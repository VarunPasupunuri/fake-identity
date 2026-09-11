/**
 * Pure helpers that turn a FusionResult into what the results UI renders.
 * No React here so the mapping can be unit-tested directly.
 */
import { DECISION } from '../../modules/fusion/index.js';

export const DECISION_UI = {
  [DECISION.VERIFIED]: { label: 'VERIFIED', short: 'Verified', tone: 'green', headline: 'Confirmed against an authorised issuer record; no contradictory evidence found.', legacy: 'accept' },
  [DECISION.APPROVE]: { label: 'LIKELY AUTHENTIC', short: 'Likely authentic', tone: 'green', headline: 'Document-level evidence is consistent and no contradictory findings were detected. Issuer verification is reported separately.', legacy: 'accept' },
  [DECISION.REVIEW]: { label: 'REVIEW REQUIRED', short: 'Review required', tone: 'amber', headline: 'Suspicious or incomplete evidence requires officer inspection.', legacy: 'flag' },
  [DECISION.REJECT]: { label: 'SUSPICIOUS', short: 'Suspicious', tone: 'red', headline: 'Strong evidence of invalidity, alteration or identity mismatch.', legacy: 'reject' },
  [DECISION.INSUFFICIENT]: { label: 'INSUFFICIENT EVIDENCE', short: 'Insufficient evidence', tone: 'slate', headline: 'Analysis cannot safely determine authenticity because required evidence is unavailable.', legacy: 'flag' },
};

/** Evidence-fusion dimensions and which evidence items feed each one (trust-scored ones map to fusion.trust). */
export const DIMENSIONS = [
  { key: 'identityConsistency', label: 'Data consistency', hint: 'MRZ ↔ printed data, check digits, cross-field dates, marks', match: (e) => e.source === 'validation' && ['mrz', 'dob', 'consistency'].includes(e.category) },
  { key: 'documentValidity', label: 'Document validity', hint: 'Expiry, formats, required fields, visa rules', match: (e) => e.source === 'validation' && ['expiry', 'format', 'required', 'visa', 'code'].includes(e.category) },
  { key: 'documentIntegrity', label: 'Document integrity', hint: 'Image forensics, metadata', match: (e) => e.source === 'tampering' },
  { key: 'barcode', label: 'QR / barcode', hint: 'Readability and agreement with printed fields', match: (e) => e.source === 'barcode' || (e.source === 'validation' && e.category === 'barcode'), noTrust: true },
  { key: 'biometricConsistency', label: 'Biometric consistency', hint: 'Live face vs document photo', match: (e) => e.source === 'face' },
  { key: 'extractionConfidence', label: 'Extraction confidence', hint: 'OCR quality and MRZ read', match: (e) => e.source === 'ocr' },
  { key: 'watchlist', label: 'Watchlist screening', hint: 'Configured list', match: (e) => e.source === 'watchlist', noTrust: true },
  { key: 'identity', label: 'Identity correlation', hint: 'Prior screening records', match: (e) => e.source === 'identity', noTrust: true },
  { key: 'issuer', label: 'Issuer verification', hint: 'Authorised issuer source', match: (e) => e.source === 'issuer', noTrust: true },
];

const RANK = { fail: 3, warn: 2, pass: 1, info: 0 };

/** Worst status among the evidence items feeding a dimension; `unavailable` when nothing usable exists. */
export function dimensionStatus(fusion, dim) {
  const items = (fusion?.evidence || []).filter(dim.match);
  if (!items.length) return 'unavailable';
  if (items.some((e) => e.id === 'face:not_applicable')) return 'not_applicable';
  const usable = items.filter((e) => e.status !== 'unavailable');
  if (!usable.length) return 'unavailable';
  return usable.reduce((worst, e) => ((RANK[e.status] ?? 0) > (RANK[worst] ?? 0) ? e.status : worst), 'info') === 'info' ? 'pass' : usable.reduce((worst, e) => ((RANK[e.status] ?? 0) > (RANK[worst] ?? 0) ? e.status : worst), 'info');
}

/** Rows for the Evidence Fusion / Trust Profile panel. */
export function fusionRows(fusion) {
  return DIMENSIONS.map((dim) => {
    const status = dimensionStatus(fusion, dim);
    const trust = fusion?.trust?.[dim.key];
    const items = (fusion?.evidence || []).filter(dim.match);
    return {
      key: dim.key,
      label: dim.label,
      hint: dim.hint,
      status,
      trust: dim.noTrust ? undefined : trust?.available ? trust.score : null,
      unavailableReason: trust && !trust.available ? trust.reason : status === 'not_applicable' ? 'Not applicable for this document type' : null,
      findings: items.filter((e) => e.status === 'fail' || e.status === 'warn').map((e) => e.label),
    };
  });
}

/** Strongest factors behind the decision, with the evidence status/severity attached. */
export function topFactors(fusion, limit = 6) {
  if (!fusion) return [];
  const byId = Object.fromEntries((fusion.evidence || []).map((e) => [e.id, e]));
  const corr = Object.fromEntries((fusion.correlations || []).map((c) => [c.id, c]));
  const rows = (fusion.risk?.contributions || []).filter((c) => c.points > 0).map((c) => {
    const e = byId[c.id];
    const k = corr[c.id];
    return {
      id: c.id,
      label: c.label,
      points: c.points,
      detail: c.detail || e?.explanation || k?.explanation || '',
      status: e ? e.status : k ? (k.kind === 'aggravating' ? 'fail' : 'warn') : 'info',
      severity: e?.severity || k?.severity || 'none',
      source: c.source,
      field: e?.field || k?.field || null,
    };
  });
  return rows.slice(0, limit);
}

/** Evidence items the engine could not obtain — shown for INSUFFICIENT_EVIDENCE and unavailable dimensions. */
export function unavailableEvidence(fusion) {
  return (fusion?.evidence || []).filter((e) => e.status === 'unavailable');
}

/** Human sentence for a counterfactual pivot. */
export function pivotSentence(p) {
  const target = DECISION_UI[p.decisionIfCleared]?.label || p.decisionIfCleared;
  return `Verifying "${p.label.replace(/\.$/, '')}" would move the decision to ${target}.`;
}

export const SOURCE_LABEL = { ocr: 'OCR', validation: 'Validation', tampering: 'Forensics', face: 'Face', fusion: 'Correlation', watchlist: 'Watchlist', identity: 'Identity', classification: 'Classification' };

/* ------------------------------------------------------------------ */
/* Universal results helpers                                            */
/* ------------------------------------------------------------------ */
const has = (fusion, pred) => (fusion?.evidence || []).some(pred);
const find = (fusion, pred) => (fusion?.evidence || []).find(pred);

/**
 * Officer-facing verification signals: one line per check family, each
 * pass | warn | fail | unavailable | not_applicable, derived only from evidence that exists.
 */
export function signalChecklist(fusion) {
  const ev = fusion?.evidence || [];
  const byCat = (src, cats) => ev.filter((e) => e.source === src && (!cats || cats.includes(e.category)));
  const worst = (items) => {
    if (!items.length) return 'unavailable';
    if (items.every((e) => e.status === 'unavailable')) return 'unavailable';
    const usable = items.filter((e) => e.status !== 'unavailable');
    if (usable.some((e) => e.status === 'fail')) return 'fail';
    if (usable.some((e) => e.status === 'warn')) return 'warn';
    return 'pass';
  };
  const detail = (items) => items.filter((e) => e.status === 'fail' || e.status === 'warn').map((e) => e.label).slice(0, 2).join(' · ');
  const out = [];
  const ocr = find(fusion, (e) => e.id === 'ocr:confidence' || e.id === 'ocr:unavailable');
  out.push({ id: 'ocr', label: 'Text extraction', status: !ocr || ocr.status === 'unavailable' ? 'unavailable' : ocr.status === 'info' ? 'pass' : ocr.status, detail: ocr?.label || '' });
  const cls = find(fusion, (e) => e.id === 'classification:type');
  if (cls) out.push({ id: 'classification', label: 'Document type recognised', status: cls.status === 'warn' ? 'warn' : 'pass', detail: cls.value?.overridden ? 'Set by officer' : `${Math.round((cls.value?.confidence || 0) * 100)}% classification confidence` });
  const req = byCat('validation', ['required']);
  if (req.length) out.push({ id: 'required', label: 'Required fields present', status: worst(req), detail: detail(req) });
  const fmt = byCat('validation', ['format', 'code']);
  if (fmt.length) out.push({ id: 'format', label: 'Identifier and value formats', status: worst(fmt), detail: detail(fmt) });
  const dates = byCat('validation', ['expiry', 'dob', 'consistency', 'visa']);
  if (dates.length) out.push({ id: 'dates', label: 'Date and cross-field consistency', status: worst(dates), detail: detail(dates) });
  const mrz = byCat('validation', ['mrz']);
  if (mrz.length) out.push({ id: 'mrz', label: 'Document structure (MRZ)', status: worst(mrz), detail: detail(mrz) });
  else if (has(fusion, (e) => e.id === 'ocr:mrz')) out.push({ id: 'mrz', label: 'Document structure (MRZ)', status: 'pass', detail: 'MRZ parsed' });
  const bc = ev.filter((e) => e.source === 'barcode' || (e.source === 'validation' && e.category === 'barcode'));
  if (bc.length) {
    const mod = bc.find((e) => e.source === 'barcode');
    const st = mod?.status === 'unavailable' ? 'unavailable' : mod?.id === 'barcode:none' ? 'not_applicable' : worst(bc.filter((e) => e.status !== 'info'));
    out.push({ id: 'barcode', label: mod?.id === 'barcode:none' ? 'QR / barcode' : 'QR / barcode decoded and compared', status: mod?.id === 'barcode:none' ? 'info' : st, detail: mod?.id === 'barcode:none' ? 'No code detected' : detail(bc) || (mod?.label || '') });
  }
  const tamper = byCat('tampering');
  if (tamper.length) out.push({ id: 'integrity', label: tamper.every((e) => e.status === 'unavailable') ? 'Image integrity' : worst(tamper) === 'pass' ? 'No significant manipulation detected' : 'Possible manipulation indicators', status: worst(tamper), detail: detail(tamper) });
  const face = byCat('face');
  if (face.length) {
    const na = face.some((e) => e.id === 'face:not_applicable');
    out.push({ id: 'face', label: 'Face comparison', status: na ? 'not_applicable' : worst(face), detail: na ? 'Not applicable' : face[0]?.label || '' });
  }
  const wl = byCat('watchlist');
  if (wl.length) out.push({ id: 'watchlist', label: 'Watchlist screening', status: worst(wl), detail: wl[0]?.value?.synthetic ? 'Synthetic demo list' : wl[0]?.label || '' });
  const idl = byCat('identity');
  if (idl.length) out.push({ id: 'identity', label: 'Identity correlation', status: worst(idl), detail: idl[0]?.label || '' });
  const issuer = byCat('issuer');
  if (issuer.length) out.push({ id: 'issuer', label: 'Issuer verification', status: worst(issuer), detail: issuer[0]?.status === 'unavailable' ? 'Not performed — no authorised source' : issuer[0]?.label || '' });
  return out;
}

/** Evidence grouped for the officer: supporting (pass), conflicting (fail/warn), unavailable. */
export function groupEvidence(fusion) {
  const ev = (fusion?.evidence || []).filter((e) => e.id !== 'classification:type');
  return {
    supporting: ev.filter((e) => e.status === 'pass'),
    conflicting: ev.filter((e) => e.status === 'fail' || e.status === 'warn').sort((a, b) => (b.riskContribution || 0) - (a.riskContribution || 0)),
    unavailable: ev.filter((e) => e.status === 'unavailable'),
    informational: ev.filter((e) => e.status === 'info'),
  };
}

/** What this assessment could NOT establish — always includes the issuer position. */
export function assessmentLimitations(fusion, results = {}) {
  const out = [];
  const issuer = find(fusion, (e) => e.source === 'issuer');
  if (!issuer || issuer.status === 'unavailable') out.push({ id: 'issuer', text: 'Official issuer verification was not performed. Document-level analysis cannot confirm that the issuer recorded this document; an authorised external data source is required for that.' });
  else if (issuer.value?.synthetic) out.push({ id: 'issuer_synthetic', text: 'Issuer verification used a synthetic demo register, not a real issuer. Treat the VERIFIED state as a demonstration only.' });
  if (fusion?.confidence?.usesMockProviders) out.push({ id: 'mock', text: 'One or more results come from synthetic demo providers, not real analysis.' });
  if (find(fusion, (e) => e.id === 'face:not_applicable')) out.push({ id: 'face_na', text: 'No holder photograph applies to this document type, so the presented person was not biometrically compared.' });
  else if (find(fusion, (e) => e.id === 'face:unavailable' || e.id === 'face:not_compared')) out.push({ id: 'face', text: 'The presented person was not biometrically compared with the document photograph.' });
  const wl = find(fusion, (e) => e.source === 'watchlist');
  if (!wl || wl.status === 'unavailable') out.push({ id: 'watchlist', text: 'Watchlist screening was not available.' });
  else if (wl.value?.synthetic) out.push({ id: 'watchlist_synthetic', text: 'Watchlist screening used synthetic demo records only — not a government or law-enforcement list.' });
  if (find(fusion, (e) => e.id === 'tampering:unavailable')) out.push({ id: 'integrity', text: 'Image forensics did not run; alterations could not be assessed.' });
  else out.push({ id: 'forensics', text: 'Image forensics indicate possible manipulation; they cannot prove or exclude forgery with certainty.' });
  const cls = find(fusion, (e) => e.id === 'classification:type');
  if (cls?.status === 'warn') out.push({ id: 'classification', text: 'The document type was recognised with low confidence; document-specific rules may not fully apply.' });
  if (results?.documentType === 'generic_document') out.push({ id: 'generic', text: 'No document-specific rule set exists for this document; only generic extraction, consistency and integrity checks were applied.' });
  return out;
}
