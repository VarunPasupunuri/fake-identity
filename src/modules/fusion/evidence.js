/**
 * Evidence normalisation — turns raw module outputs into a flat list of
 * EvidenceItem objects. Nothing is inferred: every item maps 1:1 to a value that
 * a module actually produced. Missing modules yield `unavailable` items, never failures.
 *
 * @typedef {Object} EvidenceItem
 * @property {string} id                    stable id, e.g. "validation:mrz_viz_dateOfBirth"
 * @property {string} source                see constants.SOURCE
 * @property {string} category              mrz | expiry | format | dob | required | visa | code | ocr_quality |
 *                                          photo_replacement | text_manipulation | stamp_forgery | metadata | integrity |
 *                                          biometric | extraction | watchlist | identity | classification
 * @property {string} status                pass | fail | warn | info | unavailable
 * @property {string} severity              none | low | medium | high | critical
 * @property {*}      value                 the actual observed value(s)
 * @property {string} label                 short name of the finding (for lists / chips)
 * @property {string} explanation           plain-language description of the finding
 * @property {number} riskContribution      points added to the risk score (0 for pass / unavailable)
 * @property {number|null} confidence       0..1 confidence attached to this specific finding, when the module provides one
 * @property {Object} [region]              normalised box on the document image
 * @property {string} [field]               extracted field this evidence refers to
 * @property {string} [rule]                validation rule id / detector id
 * @property {string[]} [refs]              ids of other evidence this item is derived from
 */
import { SOURCE, STATUS, SEVERITY, RISK, FACE_BANDS } from './constants.js';
import { parseMrz } from '../validation/mrz.js';
import { FIELD_LABELS } from '../validation/rules.js';

const VALIDATION_CATEGORY = [
  [/^mrz_viz_/, 'mrz'],
  [/^mrz_/, 'mrz'],
  [/^expiry|^valid_from/, 'expiry'],
  [/^doc_number_format/, 'format'],
  [/^dob_valid/, 'dob'],
  [/^required_/, 'required'],
  [/^visa_/, 'visa'],
  [/_code$/, 'code'],
  [/^gender/, 'format'],
  [/^ocr_confidence/, 'ocr_quality'],
];

export function validationCategory(checkId) {
  for (const [re, cat] of VALIDATION_CATEGORY) if (re.test(checkId)) return cat;
  return 'other';
}

function validationSeverity(check) {
  if (check.status === STATUS.FAIL) return check.severity === 'critical' ? SEVERITY.CRITICAL : check.severity === 'minor' ? SEVERITY.MEDIUM : SEVERITY.HIGH;
  if (check.status === STATUS.WARN) return SEVERITY.LOW;
  return SEVERITY.NONE;
}

function validationRisk(check) {
  if (check.status === STATUS.FAIL) return RISK.validation[check.severity] ?? RISK.validation.major;
  if (check.status === STATUS.WARN) return RISK.validation.warn;
  return 0;
}

/** Validation checks → evidence. MRZ↔visual mismatches carry both observed values so the chain can show them. */
export function evidenceFromValidation(validation, ocr) {
  if (!validation) return [{ id: 'validation:unavailable', source: SOURCE.VALIDATION, category: 'validation', status: STATUS.UNAVAILABLE, severity: SEVERITY.NONE, label: 'Validation unavailable', value: null, explanation: 'Document validation did not run.', riskContribution: 0, confidence: null }];
  const mrzFields = ocr?.mrz ? parseMrz(ocr.mrz)?.fields || {} : {};
  return validation.checks.map((c) => {
    const item = {
      id: `validation:${c.id}`,
      source: SOURCE.VALIDATION,
      category: validationCategory(c.id),
      status: c.status === 'skip' ? STATUS.INFO : c.status,
      severity: validationSeverity(c),
      label: c.label,
      value: c.field && ocr?.fields?.[c.field] !== undefined ? ocr.fields[c.field] : null,
      explanation: `${c.label}: ${c.detail}`,
      riskContribution: validationRisk(c),
      confidence: c.field && typeof ocr?.fieldConfidence?.[c.field] === 'number' ? ocr.fieldConfidence[c.field] : null,
      field: c.field,
      rule: c.id,
    };
    const viz = c.id.match(/^mrz_viz_(.+)$/);
    if (viz) {
      const key = viz[1];
      item.value = { visual: ocr?.vizFields?.[key] ?? null, mrz: mrzFields[key] ?? null };
      item.field = key;
      item.label = c.status === STATUS.FAIL ? `${FIELD_LABELS[key] || key} differs from MRZ` : `${FIELD_LABELS[key] || key} matches MRZ`;
      item.explanation = c.status === STATUS.FAIL
        ? `${FIELD_LABELS[key] || key} printed on the document (${item.value.visual}) differs from the machine readable zone (${item.value.mrz}).`
        : `${FIELD_LABELS[key] || key} agrees between the printed data and the machine readable zone.`;
    }
    return item;
  });
}

/** Tampering result → one integrity item (overall score) + one item per detector flag. */
export function evidenceFromTampering(tampering) {
  if (!tampering) return [{ id: 'tampering:unavailable', source: SOURCE.TAMPERING, category: 'integrity', status: STATUS.UNAVAILABLE, severity: SEVERITY.NONE, label: 'Forensic analysis unavailable', value: null, explanation: 'Forensic analysis unavailable.', riskContribution: 0, confidence: null }];
  const score = Math.max(0, Math.min(100, Number(tampering.score) || 0));
  const scoreRisk = Math.round(Math.min(RISK.tampering.cap, score * RISK.tampering.multiplier));
  const items = [{
    id: 'tampering:score',
    source: SOURCE.TAMPERING,
    category: 'integrity',
    status: score >= 50 ? STATUS.FAIL : score >= 25 ? STATUS.WARN : STATUS.PASS,
    severity: score >= 50 ? SEVERITY.HIGH : score >= 25 ? SEVERITY.MEDIUM : SEVERITY.NONE,
    label: `Tampering likelihood ${score}%`,
    value: score,
    explanation: score >= 25 ? `Image forensics estimate a ${score}% likelihood of manipulation.` : `Image forensics found no significant manipulation signal (${score}%).`,
    riskContribution: scoreRisk,
    confidence: null,
    rule: tampering.provider || 'ela',
  }];
  for (const f of tampering.flags || []) {
    items.push({
      id: `tampering:${f.id}`,
      source: SOURCE.TAMPERING,
      category: f.type || 'integrity',
      status: f.severity === 'low' ? STATUS.WARN : STATUS.FAIL,
      severity: f.severity === 'high' ? SEVERITY.HIGH : f.severity === 'medium' ? SEVERITY.MEDIUM : SEVERITY.LOW,
      label: f.label,
      value: f.label,
      explanation: f.detail || f.label,
      riskContribution: f.severity === 'high' ? RISK.tampering.highFlag : 0,
      confidence: null,
      region: f.region,
      field: f.field,
      rule: f.type,
    });
  }
  return items;
}

/** Face verification → a single biometric item with an explicit verification state. */
export function evidenceFromFace(face) {
  if (!face) return [{ id: 'face:unavailable', source: SOURCE.FACE, category: 'biometric', status: STATUS.UNAVAILABLE, severity: SEVERITY.NONE, label: 'Face verification unavailable', value: { state: 'insufficient' }, explanation: 'Face verification unavailable — no live photo was compared.', riskContribution: 0, confidence: null }];
  const compared = Boolean(face.documentFaceFound && face.liveFaceFound);
  if (!compared) {
    return [{ id: 'face:not_compared', source: SOURCE.FACE, category: 'biometric', status: STATUS.UNAVAILABLE, severity: SEVERITY.NONE, label: !face.documentFaceFound ? 'No face found on document' : 'No face found in live capture', value: { state: 'insufficient', documentFaceFound: Boolean(face.documentFaceFound), liveFaceFound: Boolean(face.liveFaceFound) }, explanation: !face.documentFaceFound ? 'No face could be detected on the document image, so biometric comparison was not possible.' : 'No face could be detected in the live capture, so biometric comparison was not possible.', riskContribution: 0, confidence: null, rule: face.provider }];
  }
  const conf = Math.max(0, Math.min(100, Number(face.confidence) || 0));
  const state = conf >= FACE_BANDS.match ? 'match' : conf >= FACE_BANDS.review ? 'review' : 'mismatch';
  const points = Math.round(Math.min(RISK.face.cap, ((100 - conf) / 100) * RISK.face.cap)) + (state === 'mismatch' ? RISK.face.noMatch : 0);
  return [{
    id: 'face:match',
    source: SOURCE.FACE,
    category: 'biometric',
    status: state === 'match' ? STATUS.PASS : state === 'review' ? STATUS.WARN : STATUS.FAIL,
    severity: state === 'match' ? SEVERITY.NONE : state === 'review' ? SEVERITY.MEDIUM : SEVERITY.HIGH,
    label: state === 'match' ? `Face match ${conf}%` : state === 'review' ? `Face match borderline ${conf}%` : `Face mismatch ${conf}%`,
    value: { state, confidence: conf, distance: face.distance ?? null },
    explanation: state === 'match' ? `Presented person matches the document photo (${conf}% match confidence).` : state === 'review' ? `Biometric similarity is borderline (${conf}%) and needs officer review.` : `Presented person does not match the document photo (${conf}% match confidence).`,
    riskContribution: points,
    confidence: null,
    region: face.documentFaceBox || undefined,
    rule: face.provider,
  }];
}

/** OCR → extraction-quality item (+ MRZ presence info). */
export function evidenceFromOcr(ocr) {
  if (!ocr) return [{ id: 'ocr:unavailable', source: SOURCE.OCR, category: 'extraction', status: STATUS.UNAVAILABLE, severity: SEVERITY.NONE, label: 'OCR unavailable', value: null, explanation: 'Unable to extract text reliably — OCR did not produce a result.', riskContribution: 0, confidence: null }];
  const conf = Math.max(0, Math.min(1, Number(ocr.confidence) || 0));
  const fields = Object.keys(ocr.fields || {}).length;
  const items = [{
    id: 'ocr:confidence',
    source: SOURCE.OCR,
    category: 'extraction',
    status: fields === 0 ? STATUS.UNAVAILABLE : conf >= 0.75 ? STATUS.PASS : conf >= 0.5 ? STATUS.WARN : STATUS.FAIL,
    severity: fields === 0 ? SEVERITY.NONE : conf >= 0.75 ? SEVERITY.NONE : conf >= 0.5 ? SEVERITY.LOW : SEVERITY.MEDIUM,
    label: fields === 0 ? 'No fields extracted' : conf < 0.5 ? `Low OCR confidence ${Math.round(conf * 100)}%` : `OCR confidence ${Math.round(conf * 100)}%`,
    value: { confidence: conf, fieldsExtracted: fields, provider: ocr.provider || null },
    explanation: fields === 0 ? 'Unable to extract text reliably — no fields were recognised.' : `${fields} field(s) extracted at ${Math.round(conf * 100)}% OCR confidence${ocr.provider ? ` (${ocr.provider})` : ''}.`,
    riskContribution: fields > 0 && conf < 0.5 ? RISK.ocr.lowConfidence : 0,
    confidence: conf,
    rule: ocr.provider,
  }];
  if (ocr.mrz) items.push({ id: 'ocr:mrz', source: SOURCE.OCR, category: 'mrz', status: STATUS.INFO, severity: SEVERITY.NONE, label: `MRZ ${ocr.mrz.format} detected`, value: { format: ocr.mrz.format, lines: ocr.mrz.lines }, explanation: `Machine readable zone (${ocr.mrz.format}) detected.`, riskContribution: 0, confidence: conf });
  return items;
}

/** Optional future modules — consumed if present, never fabricated. */
export function evidenceFromOptional({ classification, watchlist, identity }) {
  const items = [];
  if (classification) {
    const conf = Math.max(0, Math.min(1, Number(classification.confidence) || 0));
    items.push({ id: 'classification:type', source: SOURCE.CLASSIFICATION, category: 'classification', status: conf >= 0.6 ? STATUS.INFO : STATUS.WARN, severity: conf >= 0.6 ? SEVERITY.NONE : SEVERITY.LOW, label: `Document type ${classification.type}`, value: { type: classification.type, confidence: conf, overridden: Boolean(classification.overridden) }, explanation: conf >= 0.6 ? `Document classified as ${classification.type} (${Math.round(conf * 100)}%).` : `Document type ${classification.type} detected with low confidence (${Math.round(conf * 100)}%).`, riskContribution: conf >= 0.6 ? 0 : RISK.classification.lowConfidence, confidence: conf, rule: classification.provider });
  }
  if (watchlist) {
    // Accept both the fusion contract (clear|match|possible|unavailable) and the watchlist module's
    // vocabulary (clear|confirmed_match|possible_match|unavailable).
    const st = { confirmed_match: 'match', possible_match: 'possible' }[watchlist.status] || watchlist.status;
    const src = watchlist.source || 'source unspecified';
    const top = (watchlist.matches || [])[0] || null;
    const conf = typeof watchlist.confidence === 'number' ? watchlist.confidence : top?.confidence ?? null;
    if (st === 'unavailable' || !st) items.push({ id: 'watchlist:unavailable', source: SOURCE.WATCHLIST, category: 'watchlist', status: STATUS.UNAVAILABLE, severity: SEVERITY.NONE, label: 'Watchlist unavailable', value: { source: src, provider: watchlist.provider || null }, explanation: watchlist.explanation || 'Watchlist check unavailable.', riskContribution: 0, confidence: null, rule: watchlist.provider || watchlist.source });
    else {
      const weak = st === 'possible' && conf !== null && conf < RISK.watchlist.weakBelow;
      items.push({
        id: 'watchlist:result',
        source: SOURCE.WATCHLIST,
        category: 'watchlist',
        status: st === 'clear' ? STATUS.PASS : st === 'match' ? STATUS.FAIL : STATUS.WARN,
        severity: st === 'clear' ? SEVERITY.NONE : st === 'match' ? SEVERITY.CRITICAL : weak ? SEVERITY.LOW : SEVERITY.MEDIUM,
        label: st === 'clear' ? 'Watchlist clear' : st === 'match' ? `Watchlist match${top?.matchType ? ` (${String(top.matchType).replace('_', ' ')})` : ''}` : `Possible watchlist match${top?.matchType ? ` (${String(top.matchType).replace('_', ' ')})` : ''}`,
        value: { status: st, matches: watchlist.matches || [], source: src, confidence: conf, fieldsUsed: watchlist.fieldsUsed || [], synthetic: Boolean(watchlist.synthetic), matchType: top?.matchType || null, recordId: top?.recordId || null },
        explanation: watchlist.explanation || (st === 'clear' ? `No watchlist match (${src}).` : st === 'match' ? `Document or identity matches a watchlist entry (${src}).` : `Potential watchlist match requires officer review (${src}).`),
        riskContribution: st === 'match' ? RISK.watchlist.match : st === 'possible' ? (weak ? RISK.watchlist.weakPossible : RISK.watchlist.possible) : 0,
        confidence: conf,
        rule: watchlist.provider || src,
      });
    }
  }
  if (identity) {
    const links = identity.links || [];
    if (identity.status === 'unavailable') items.push({ id: 'identity:unavailable', source: SOURCE.IDENTITY, category: 'identity', status: STATUS.UNAVAILABLE, severity: SEVERITY.NONE, label: 'Identity correlation unavailable', value: null, explanation: 'Identity correlation unavailable.', riskContribution: 0, confidence: null });
    else items.push({ id: 'identity:links', source: SOURCE.IDENTITY, category: 'identity', status: links.length ? STATUS.WARN : STATUS.PASS, severity: links.length ? SEVERITY.MEDIUM : SEVERITY.NONE, label: links.length ? `Potential identity link (${links.length})` : 'No identity links', value: { links }, explanation: links.length ? `Potential identity link with ${links.length} prior screening record(s) — requires officer review.` : 'No potential identity links found in prior screenings.', riskContribution: links.length ? RISK.identity.link : 0, confidence: null });
  }
  return items;
}

/** Full normalised evidence list, in a fixed source order. */
export function normaliseEvidence(inputs) {
  return [
    ...evidenceFromOcr(inputs.ocr),
    ...evidenceFromValidation(inputs.validation, inputs.ocr),
    ...evidenceFromTampering(inputs.tampering),
    ...evidenceFromFace(inputs.face),
    ...evidenceFromOptional(inputs),
  ];
}

export const isFailing = (e) => e.status === STATUS.FAIL;
export const isUnavailable = (e) => e.status === STATUS.UNAVAILABLE;
