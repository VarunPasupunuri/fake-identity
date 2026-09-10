/**
 * Risk, analysis confidence, trust profile and evidence chain.
 * Pure functions over the normalised evidence list.
 */
import { RISK, RISK_THRESHOLDS, CONFIDENCE, TRUST, MRZ_DOCUMENT_TYPES, STATUS, SEVERITY } from './constants.js';

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v);

/**
 * RISK (0–100): how suspicious the document / person is.
 * Sum of evidence contributions, capped per source exactly like the legacy engine,
 * plus bounded correlation bonuses. Unavailable evidence contributes nothing.
 */
export function scoreRisk(evidence, correlations) {
  const contributions = [];
  const perSource = {};
  for (const e of evidence) {
    if (!e.riskContribution) continue;
    perSource[e.source] = (perSource[e.source] || 0) + e.riskContribution;
    contributions.push({ id: e.id, source: e.source, points: e.riskContribution, label: e.explanation });
  }
  const caps = [];
  const capFor = { validation: RISK.validation.cap, tampering: RISK.tampering.cap + RISK.tampering.highFlag * 3, face: RISK.face.cap + RISK.face.noMatch };
  let total = 0;
  for (const [source, pts] of Object.entries(perSource)) {
    const cap = capFor[source];
    if (cap !== undefined && pts > cap) { caps.push({ source, raw: pts, cap }); total += cap; } else total += pts;
  }
  let corrPts = 0;
  for (const c of correlations) {
    if (!c.riskContribution) continue;
    corrPts += c.riskContribution;
    contributions.push({ id: c.id, source: 'fusion', points: c.riskContribution, label: c.label });
  }
  if (corrPts > RISK.correlation.cap) { caps.push({ source: 'fusion', raw: corrPts, cap: RISK.correlation.cap }); corrPts = RISK.correlation.cap; }
  total += corrPts;
  const score = clamp(round(total));
  const level = score >= RISK_THRESHOLDS.reject ? 'high' : score >= RISK_THRESHOLDS.review ? 'medium' : 'low';
  return { score, level, contributions: contributions.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id)), caps, bySource: perSource, correlationPoints: corrPts };
}

/**
 * ANALYSIS CONFIDENCE (0–100): how far the analysis itself can be trusted.
 * Independent of suspicion: a clean document analysed by mock providers scores LOW
 * confidence; a forged document fully analysed by real providers scores HIGH confidence.
 */
export function computeConfidence(inputs, evidence) {
  const ev = Object.fromEntries(evidence.map((e) => [e.id, e]));
  const comps = [];
  const add = (id, label, points, max, reason) => comps.push({ id, label, points: round(points), max, reason });

  const ocr = ev['ocr:confidence'];
  if (!ocr || ocr.status === STATUS.UNAVAILABLE) add('ocr', 'Text extraction', 0, CONFIDENCE.ocr, 'OCR unavailable or no fields extracted');
  else add('ocr', 'Text extraction', CONFIDENCE.ocr * ocr.value.confidence, CONFIDENCE.ocr, `${Math.round(ocr.value.confidence * 100)}% OCR confidence`);

  const needsMrz = MRZ_DOCUMENT_TYPES.includes(inputs.documentType);
  if (!needsMrz) add('structure', 'Structural corroboration', CONFIDENCE.structure, CONFIDENCE.structure, 'Document type carries no MRZ');
  else if (ev['ocr:mrz']) add('structure', 'Structural corroboration', CONFIDENCE.structure, CONFIDENCE.structure, `MRZ ${ev['ocr:mrz'].value.format} parsed`);
  else add('structure', 'Structural corroboration', 0, CONFIDENCE.structure, 'MRZ expected but not read');

  add('tampering', 'Forensic analysis', ev['tampering:unavailable'] ? 0 : CONFIDENCE.tampering, CONFIDENCE.tampering, ev['tampering:unavailable'] ? 'Forensic analysis unavailable' : 'Forensic analysis completed');

  if (ev['face:match']) add('face', 'Biometric comparison', CONFIDENCE.face, CONFIDENCE.face, 'Faces compared');
  else if (ev['face:not_compared']) add('face', 'Biometric comparison', CONFIDENCE.faceNotFound, CONFIDENCE.face, 'Module ran but a face was not detected');
  else add('face', 'Biometric comparison', 0, CONFIDENCE.face, 'Face verification unavailable');

  const providers = inputs.providers || {};
  const providerNames = [providers.ocr, providers.tamper, providers.face, inputs.ocr?.provider, inputs.tampering?.provider, inputs.face?.provider].filter(Boolean);
  const mock = providerNames.some((p) => /mock|seed/i.test(String(p)));
  add('providers', 'Provider fidelity', mock ? 0 : CONFIDENCE.providers, CONFIDENCE.providers, mock ? 'Mock / demo provider output — not real analysis' : 'Real analysis providers');

  const score = clamp(round(comps.reduce((s, c) => s + c.points, 0)));
  return { score, components: comps, usesMockProviders: mock };
}

/**
 * DOCUMENT TRUST PROFILE — five 0–100 dimensions, each `available: false` when the
 * evidence to compute it does not exist (never a fake 0).
 */
export function trustProfile(evidence, inputs) {
  const ev = Object.fromEntries(evidence.map((e) => [e.id, e]));
  const val = evidence.filter((e) => e.source === 'validation' && e.status !== STATUS.UNAVAILABLE);
  const dims = {};

  // Identity consistency: MRZ↔visual agreement, MRZ check digits, DOB plausibility
  const idChecks = val.filter((e) => e.category === 'mrz' || e.category === 'dob');
  if (idChecks.length) {
    let s = 100;
    for (const e of idChecks) {
      if (e.status === STATUS.FAIL) s -= /^validation:mrz_viz_/.test(e.id) ? TRUST.identity.mrzVisualMismatch : /^validation:mrz_/.test(e.id) ? TRUST.identity.mrzChecksumFail : TRUST.identity.dobImplausible;
      else if (e.status === STATUS.WARN) s -= TRUST.identity.warn;
    }
    dims.identityConsistency = { score: clamp(s), available: true, basis: idChecks.map((e) => e.id) };
  } else dims.identityConsistency = { score: null, available: false, reason: 'No MRZ or identity cross-checks available' };

  // Document validity: expiry, format, required fields, visa rules, codes
  const valChecks = val.filter((e) => ['expiry', 'format', 'required', 'visa', 'code'].includes(e.category));
  if (valChecks.length) {
    let s = 100;
    for (const e of valChecks) {
      if (e.status === STATUS.FAIL) s -= e.severity === SEVERITY.CRITICAL ? TRUST.validity.critical : e.severity === SEVERITY.HIGH ? TRUST.validity.major : TRUST.validity.minor;
      else if (e.status === STATUS.WARN) s -= TRUST.validity.warn;
    }
    dims.documentValidity = { score: clamp(s), available: true, basis: valChecks.map((e) => e.id) };
  } else dims.documentValidity = { score: null, available: false, reason: 'Validation did not run' };

  // Document integrity: inverse of the forensic manipulation likelihood
  const t = ev['tampering:score'];
  if (t) {
    const highFlags = evidence.filter((e) => e.source === 'tampering' && e.severity === SEVERITY.HIGH && e.id !== 'tampering:score').length;
    dims.documentIntegrity = { score: clamp(100 - t.value - highFlags * TRUST.integrity.highFlag), available: true, basis: ['tampering:score'] };
  } else dims.documentIntegrity = { score: null, available: false, reason: 'Forensic analysis unavailable' };

  // Biometric consistency
  const f = ev['face:match'];
  if (f) dims.biometricConsistency = { score: clamp(f.value.confidence), available: true, basis: ['face:match'] };
  else dims.biometricConsistency = { score: null, available: false, reason: ev['face:not_compared'] ? ev['face:not_compared'].explanation : 'Face verification unavailable' };

  // Extraction confidence
  const o = ev['ocr:confidence'];
  if (o && o.status !== STATUS.UNAVAILABLE) dims.extractionConfidence = { score: clamp(round(o.value.confidence * 100)), available: true, basis: ['ocr:confidence'] };
  else dims.extractionConfidence = { score: null, available: false, reason: 'OCR unavailable' };

  const available = Object.entries(dims).filter(([, d]) => d.available);
  const overall = available.length >= TRUST.minDimensionsForOverall
    ? { score: round(available.reduce((s, [, d]) => s + d.score, 0) / available.length), available: true, basis: available.map(([k]) => k) }
    : { score: null, available: false, reason: 'Fewer than two trust dimensions could be computed' };
  return { ...dims, overall };
}

/**
 * EVIDENCE CHAIN — one entry per risk contribution, tracing points → finding → observed values → rule.
 * Every step references actual evidence ids.
 */
export function buildChain(evidence, correlations, risk) {
  const ev = Object.fromEntries(evidence.map((e) => [e.id, e]));
  const corr = Object.fromEntries(correlations.map((c) => [c.id, c]));
  return risk.contributions.map((c) => {
    const e = ev[c.id];
    if (e) {
      const steps = [{ label: e.category === 'mrz' && /mrz_viz/.test(e.id) ? 'MRZ inconsistency' : e.explanation, evidenceId: e.id }];
      if (e.value && typeof e.value === 'object' && 'visual' in e.value) {
        steps.push({ label: `Printed value: ${e.value.visual}`, evidenceId: e.id });
        steps.push({ label: `MRZ value: ${e.value.mrz}`, evidenceId: e.id });
      } else if (e.value && typeof e.value === 'object' && 'confidence' in e.value && e.source === 'face') {
        steps.push({ label: `Face similarity: ${e.value.confidence}%${e.value.distance != null ? ` (descriptor distance ${e.value.distance})` : ''}`, evidenceId: e.id });
      } else if (e.value !== null && e.value !== undefined && typeof e.value !== 'object') {
        steps.push({ label: `Observed: ${e.value}`, evidenceId: e.id });
      }
      if (e.region) steps.push({ label: `Region x${e.region.x.toFixed(2)} y${e.region.y.toFixed(2)} w${e.region.w.toFixed(2)} h${e.region.h.toFixed(2)}`, evidenceId: e.id });
      if (e.rule) steps.push({ label: `${e.source === 'validation' ? 'Validation rule' : 'Detector'}: ${e.rule}`, evidenceId: e.id });
      return { points: c.points, evidenceId: e.id, source: e.source, steps, refs: [e.id] };
    }
    const k = corr[c.id];
    return { points: c.points, evidenceId: k.id, source: 'fusion', steps: [{ label: k.label, evidenceId: k.id }, ...k.refs.map((r) => ({ label: ev[r]?.explanation || r, evidenceId: r }))], refs: k.refs };
  });
}
