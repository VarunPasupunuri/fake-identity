/**
 * DOCUMENT AUTHENTICITY DETERMINATION
 *
 * Answers one question — *does the evidence indicate this document was altered?*
 * — and keeps it separate from every other number the platform produces:
 *
 *   Authenticity  is about the document: do its own representations agree, and
 *                 does the image show signs of modification?
 *   Risk          is about the encounter: watchlist hits, expiry, prior records.
 *   Confidence    is about the analysis: how much of it could actually run.
 *
 * Authenticity is NOT 100 − risk and NOT the OCR confidence. It is derived only
 * from forensic and field-level evidence, listed here as structured indicators.
 *
 * Four outcomes, because three would force a dishonest answer:
 *
 *   TAMPERED              evidence indicates modification
 *   ORIGINAL              enough checks ran, and their evidence positively
 *                         supports an unaltered document
 *   NO_INDICATORS         nothing suspicious was found, but not enough positive
 *                         evidence to call the document original
 *   INSUFFICIENT_EVIDENCE the analysis could not reach a reliable answer
 *
 * The distinction between ORIGINAL and NO_INDICATORS matters: "we found nothing"
 * is not the same statement as "the evidence says it is genuine", and a screening
 * platform that conflates them is lying to the officer.
 *
 * WHAT THIS CANNOT DO: none of this is issuer verification. Holograms, watermarks,
 * intaglio printing, UV features, substrate and chip data are not observable in a
 * photograph, so a well-made physical counterfeit that is internally consistent
 * will pass every check here. See LIMITATION_* below.
 *
 * Pure and deterministic — no I/O, no clock, no randomness.
 */
import { compareRepresentations, checksumIndicators } from './consistency.js';
import { INDICATOR, CATEGORY, SEVERITY, SEVERITY_RANK, INDICATOR_STATUS, indicator, peakSeverity } from './indicators.js';
import { getProfile } from '../documents/registry.js';
import { parseMrz } from '../validation/mrz.js';

export { INDICATOR, CATEGORY, CATEGORY_LABEL, SEVERITY, INDICATOR_STATUS } from './indicators.js';
export { compareRepresentations, canonical } from './consistency.js';

/** @typedef {'tampered'|'original'|'no_indicators'|'insufficient_evidence'} AuthenticityStatus */
export const AUTHENTICITY = Object.freeze({
  TAMPERED: 'tampered',
  ORIGINAL: 'original',
  NO_INDICATORS: 'no_indicators',
  INSUFFICIENT: 'insufficient_evidence',
});

export const AUTHENTICITY_LABEL = Object.freeze({
  tampered: 'Tampering detected',
  original: 'Consistent with an original document',
  no_indicators: 'No tampering indicators detected',
  insufficient_evidence: 'Insufficient evidence',
});

/** Short form for tables, history rows and the CSV export. */
export const AUTHENTICITY_SHORT = Object.freeze({
  tampered: 'TAMPERED',
  original: 'ORIGINAL',
  no_indicators: 'NO INDICATORS',
  insufficient_evidence: 'INSUFFICIENT',
});

/* ------------------------------------------------------------------ */
/* Tunables — every number the determination uses, in one place.        */
/* ------------------------------------------------------------------ */
export const AUTH = Object.freeze({
  /** Evidence classes that contribute to coverage, and what each is worth. */
  COVERAGE_WEIGHTS: { fieldCrossCheck: 0.34, mrzIntegrity: 0.2, imageForensics: 0.26, textLegible: 0.12, structure: 0.08 },
  /** Below this, the analysis saw too little of the document to make any claim. */
  MIN_COVERAGE: 0.4,
  /** ORIGINAL additionally requires this much coverage and this score. */
  ORIGINAL_COVERAGE: 0.7,
  ORIGINAL_SCORE: 85,
  /** A detected indicator this severe, believed this strongly, means TAMPERED. */
  TAMPER_SEVERITY: SEVERITY.HIGH,
  TAMPER_CONFIDENCE: 0.5,
  /** Or this much accumulated evidence weight, however it is distributed across indicators.
   *  This is measured on the EVIDENCE, never on the score: a low score caused by an
   *  incomplete analysis must never be read as a finding of tampering. */
  TAMPER_PENALTY: 45,
  /** Score floor when nothing was found against the document, and the ceiling that
   *  complete, clean coverage can reach. A photograph can never reach 100: it cannot
   *  establish genuineness, only the absence of visible contradiction. */
  BASE_SCORE: 50,
  MAX_SCORE: 95,
  /** Independent signals over the same region reinforce each other by this factor. */
  CORRELATION_GAIN: 1.5,
  /** OCR below this is too poor for its field values to be worth comparing. */
  MIN_OCR_FOR_FIELDS: 0.35,
});

export const LIMITATION_PHYSICAL = 'Physical security features — holograms, watermarks, UV elements, intaglio printing, substrate and any chip — cannot be assessed from an image. A physical counterfeit that is internally consistent would not be detected by this analysis.';
export const LIMITATION_ISSUER = 'This is forensic analysis of the supplied image, not verification with the issuing authority. No government, passport, Aadhaar or institutional database was contacted.';

const overlaps = (a, b) => Boolean(a && b) && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const detected = (list) => list.filter((i) => i.status === INDICATOR_STATUS.DETECTED);

/* ------------------------------------------------------------------ */
/* Forensic flags → indicators                                          */
/* ------------------------------------------------------------------ */
/**
 * The tampering provider reports flags over image regions. Translate them into
 * indicators, deliberately conservatively: a single localised anomaly on a
 * photograph of a document is ordinary (glare, a fold, a shadow, a dense stamp),
 * so image evidence on its own is capped at MEDIUM severity. It becomes serious
 * only where it coincides with a field that independently disagrees with itself,
 * which is handled by `correlate` below.
 */
function forensicIndicators(tampering, profile) {
  if (!tampering) {
    return [indicator({
      id: INDICATOR.ELA_LOCALIZED_ANOMALY, category: CATEGORY.FORENSICS, severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.UNAVAILABLE,
      explanation: 'Image forensics did not run, so compression, noise and duplication anomalies were not assessed.',
    })];
  }
  const out = [];
  const flags = tampering.flags || [];
  const MAP = {
    photo_replacement: { id: INDICATOR.PHOTO_REPLACEMENT_INDICATOR, field: 'photo', text: 'The portrait region shows compression and noise characteristics that differ from the rest of the document, which can indicate a replaced photograph. Perspective, glare and a protective laminate can produce the same appearance.' },
    stamp_forgery: { id: INDICATOR.STAMP_COMPOSITING_INDICATOR, field: 'stamp', text: 'A localised region around a stamp or seal shows compression characteristics inconsistent with its surroundings, which can indicate compositing.' },
    text_manipulation: { id: INDICATOR.LOCALIZED_TEXT_EDIT, field: 'text', text: 'A text region shows compression characteristics inconsistent with the rest of the document, which can indicate a localised edit.' },
    copy_move: { id: INDICATOR.COPY_MOVE_INDICATOR, field: null, text: 'Two separated regions of the image are near-identical, which can indicate content copied from one part of the document over another.' },
    noise: { id: INDICATOR.NOISE_INCONSISTENCY, field: null, text: 'Sensor-noise characteristics are not uniform across the document, which can indicate content introduced from another source.' },
    resampling: { id: INDICATOR.RESAMPLING_INCONSISTENCY, field: null, text: 'A region shows interpolation artefacts absent elsewhere, which can indicate content that was scaled or rotated before being placed.' },
    dimensions: { id: INDICATOR.ASPECT_RATIO_ANOMALY, field: null, text: 'The image proportions do not match the physical document, which can indicate a crop or composite. A photograph taken at an angle produces this innocently.' },
    metadata: { id: INDICATOR.METADATA_EDITOR_INDICATOR, field: 'metadata', text: 'File metadata records an image editor in the processing chain. Many scanning and messaging applications write the same fields, so on its own this is supporting evidence only.' },
  };

  for (const f of flags) {
    const m = MAP[f.type] || MAP.text_manipulation;
    const isMeta = f.type === 'metadata';
    // Image evidence alone never exceeds MEDIUM; metadata alone never exceeds LOW.
    const severity = isMeta ? SEVERITY.LOW : f.severity === 'high' ? SEVERITY.MEDIUM : f.severity === 'medium' ? SEVERITY.MEDIUM : SEVERITY.LOW;
    const id = isMeta && /modified|timestamp/i.test(f.id || '') ? INDICATOR.METADATA_TIMESTAMP_INDICATOR : m.id;
    out.push(indicator({
      id,
      category: isMeta ? CATEGORY.METADATA : CATEGORY.FORENSICS,
      severity,
      explanation: `${m.text}${f.detail ? ` Measured: ${f.detail}` : ''}`,
      field: m.field,
      region: f.region || null,
      evidence: { flag: f.id, type: f.type, providerSeverity: f.severity, detail: f.detail || null, provider: tampering.provider },
      riskContribution: isMeta ? 6 : severity === SEVERITY.MEDIUM ? 14 : 7,
      // A heuristic over one photograph: believed, but not strongly.
      confidence: isMeta ? 0.5 : 0.45,
    }));
  }

  if (!out.length) {
    out.push(indicator({
      id: INDICATOR.ELA_LOCALIZED_ANOMALY, category: CATEGORY.FORENSICS, severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.CLEAR,
      explanation: `Image forensics found no localised compression, noise or duplication anomaly (${tampering.provider || 'analysis'}).`,
      evidence: { score: tampering.score ?? null, stats: tampering.evidence?.stats || null },
    }));
  }
  if (profile.mrz && !flags.some((f) => f.field === 'mrz')) {
    // Nothing to report; the MRZ zone was analysed with the rest of the image.
  }
  return out;
}

/** Structure: does the document carry the fields its own type requires? */
function structureIndicators(profile, fields, textLength) {
  const required = (profile.fields || []).filter((f) => f.required).map((f) => f.key);
  if (!required.length || textLength < 24) {
    return [indicator({
      id: INDICATOR.DOCUMENT_LAYOUT_ANOMALY, category: CATEGORY.STRUCTURE, severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.UNAVAILABLE,
      explanation: 'Too little text was recognised to check the document against its expected structure.',
    })];
  }
  const missing = required.filter((k) => fields[k] === undefined || fields[k] === null || fields[k] === '');
  if (!missing.length) {
    return [indicator({
      id: INDICATOR.DOCUMENT_LAYOUT_ANOMALY, category: CATEGORY.STRUCTURE, severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.CLEAR,
      explanation: `All ${required.length} field(s) expected on a ${profile.label.toLowerCase()} are present.`,
      evidence: { required, missing: [] },
    })];
  }
  // Missing fields are far more often a poor capture than a forgery.
  return [indicator({
    id: INDICATOR.DOCUMENT_LAYOUT_ANOMALY, category: CATEGORY.STRUCTURE,
    severity: missing.length >= required.length ? SEVERITY.MEDIUM : SEVERITY.LOW,
    explanation: `${missing.length} of ${required.length} field(s) expected on a ${profile.label.toLowerCase()} could not be found (${missing.join(', ')}). This is usually an incomplete or unclear capture rather than an alteration.`,
    evidence: { required, missing },
    riskContribution: missing.length >= required.length ? 10 : 4,
    confidence: 0.4,
  })];
}

/** Face comparison is only tampering evidence when it is a genuine non-match. */
function biometricIndicator(face, profile) {
  if (profile.face === 'not_applicable') return [];
  if (!face || typeof face.similarity !== 'number' || face.status === 'unavailable') {
    return [indicator({
      id: INDICATOR.BIOMETRIC_MISMATCH, category: CATEGORY.BIOMETRIC, severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.UNAVAILABLE,
      explanation: 'No face comparison was performed, so the portrait was not checked against the person presenting the document.',
    })];
  }
  const match = face.match === true || face.status === 'match';
  if (match) {
    return [indicator({
      id: INDICATOR.BIOMETRIC_MISMATCH, category: CATEGORY.BIOMETRIC, severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.CLEAR,
      explanation: 'The portrait on the document matches the person presenting it.',
      evidence: { similarity: face.similarity },
    })];
  }
  return [indicator({
    id: INDICATOR.BIOMETRIC_MISMATCH, category: CATEGORY.BIOMETRIC, severity: SEVERITY.MEDIUM,
    explanation: `The portrait on the document does not match the person presenting it (similarity ${Math.round((face.similarity || 0) * 100)}%). This concerns who is presenting the document; on its own it is not evidence that the document was altered.`,
    field: 'photo',
    evidence: { similarity: face.similarity, threshold: face.threshold ?? null },
    riskContribution: 12,
    confidence: 0.6,
  })];
}

/* ------------------------------------------------------------------ */
/* Correlation                                                          */
/* ------------------------------------------------------------------ */
/**
 * Independent signals about the same place on the document are worth more than
 * the sum of their parts: a printed date that disagrees with the MRZ is serious,
 * and a compression anomaly over exactly that date is how an edit looks.
 *
 * Only genuinely independent pairs are joined — two forensic flags over the same
 * region are one observation, not two, and are never correlated with each other.
 */
function correlate(indicators) {
  const fieldMismatches = detected(indicators).filter((i) => i.category === CATEGORY.FIELD && i.region);
  const forensic = detected(indicators).filter((i) => i.category === CATEGORY.FORENSICS && i.region);
  const links = [];
  for (const f of fieldMismatches) {
    for (const g of forensic) {
      if (!overlaps(f.region, g.region)) continue;
      links.push({
        id: `correlation:${f.id}+${g.id}`,
        field: f.field,
        indicators: [f.id, g.id],
        explanation: `The ${f.field} disagrees between representations, and image forensics independently flags the region where it is printed. Two unrelated methods pointing at the same field is materially stronger evidence than either alone.`,
        gain: AUTH.CORRELATION_GAIN,
      });
    }
  }
  return links;
}

/* ------------------------------------------------------------------ */
/* Determination                                                        */
/* ------------------------------------------------------------------ */
/**
 * @param {{ documentType: string, ocr: Object|null, validation: Object|null, tampering: Object|null,
 *           face: Object|null, barcode: Object|null }} inputs
 * @returns {Object} authenticity result
 */
export function determineAuthenticity({ documentType = 'generic_document', ocr = null, tampering = null, face = null, barcode = null } = {}) {
  const profile = getProfile(documentType);
  const fields = ocr?.fields || {};
  const visual = ocr?.vizFields || {};
  const ocrConfidence = typeof ocr?.confidence === 'number' ? ocr.confidence : 0;
  const textLength = (ocr?.rawText || '').trim().length;

  const mrzParsed = ocr?.mrz ? parseMrz(ocr.mrz) : null;
  const barcodeFields = barcode?.fields || barcode?.decoded?.fields || null;

  // --- 1. the same fact, read from independent places -----------------
  const legibleEnough = ocrConfidence >= AUTH.MIN_OCR_FOR_FIELDS;
  const { indicators: fieldIndicators, compared } = legibleEnough
    ? compareRepresentations({ visual, mrz: mrzParsed?.fields || {}, barcode: barcodeFields || {}, ocrConfidence })
    : { indicators: [], compared: [] };
  const crossChecked = compared.filter((c) => c.status !== 'not_compared').length;

  // --- 2. MRZ integrity ----------------------------------------------
  const mrzIndicators = [];
  if (mrzParsed) mrzIndicators.push(...checksumIndicators(mrzParsed, ocrConfidence));
  else if (profile.mrz) {
    mrzIndicators.push(indicator({
      id: INDICATOR.MRZ_ABSENT, category: CATEGORY.MRZ, severity: SEVERITY.LOW,
      explanation: `A ${profile.label.toLowerCase()} carries a machine readable zone, but none could be read. Without it the printed fields cannot be cross-checked, so this analysis is substantially weaker.`,
      field: 'mrz',
      riskContribution: 5,
      confidence: 0.5,
    }));
  }

  // --- 3. image forensics, structure, biometrics ----------------------
  const all = [
    ...fieldIndicators,
    ...mrzIndicators,
    ...forensicIndicators(tampering, profile),
    ...structureIndicators(profile, fields, textLength),
    ...biometricIndicator(face, profile),
  ];
  if (!legibleEnough && textLength > 0) {
    all.push(indicator({
      id: INDICATOR.LOCALIZED_TEXT_EDIT, category: CATEGORY.FIELD, severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.UNAVAILABLE,
      explanation: `Recognised text was too unreliable (${Math.round(ocrConfidence * 100)}%) to compare the printed fields against the machine readable zone. Poor recognition is not evidence of tampering.`,
    }));
  }

  const correlations = correlate(all);

  // --- 4. coverage: how much of the analysis actually ran --------------
  const ran = {
    fieldCrossCheck: crossChecked > 0,
    mrzIntegrity: Boolean(mrzParsed),
    imageForensics: Boolean(tampering),
    textLegible: legibleEnough,
    structure: textLength >= 24,
  };
  const coverage = +Object.entries(AUTH.COVERAGE_WEIGHTS)
    .reduce((s, [k, w]) => s + (ran[k] ? w : 0), 0).toFixed(3);

  // --- 5. score: built from evidence, never from risk or confidence ----
  const hits = detected(all);
  const gained = new Set(correlations.flatMap((c) => c.indicators));
  const penalty = hits.reduce((s, i) => {
    const gain = gained.has(i.id) ? AUTH.CORRELATION_GAIN : 1;
    return s + i.riskContribution * i.confidence * gain;
  }, 0);
  // Support starts at BASE_SCORE — "nothing was found against this document" — and rises
  // toward MAX_SCORE as more of the analysis actually runs and comes back clean. Evidence of
  // tampering then pushes it down. A limited analysis therefore lands mid-scale, which is
  // what it means, instead of looking like a finding against the document.
  const support = AUTH.BASE_SCORE + (AUTH.MAX_SCORE - AUTH.BASE_SCORE) * coverage;
  const rawScore = Math.round(Math.max(0, Math.min(AUTH.MAX_SCORE, support - penalty)));

  // --- 6. status -------------------------------------------------------
  const serious = hits.filter((i) => SEVERITY_RANK[i.severity] >= SEVERITY_RANK[AUTH.TAMPER_SEVERITY] && i.confidence >= AUTH.TAMPER_CONFIDENCE);
  const severity = peakSeverity(all);
  let status;
  if (serious.length || (coverage >= AUTH.MIN_COVERAGE && penalty >= AUTH.TAMPER_PENALTY)) status = AUTHENTICITY.TAMPERED;
  else if (coverage < AUTH.MIN_COVERAGE) status = AUTHENTICITY.INSUFFICIENT;
  else if (coverage >= AUTH.ORIGINAL_COVERAGE && rawScore >= AUTH.ORIGINAL_SCORE && !hits.some((i) => SEVERITY_RANK[i.severity] >= SEVERITY_RANK[SEVERITY.MEDIUM])) status = AUTHENTICITY.ORIGINAL;
  else status = AUTHENTICITY.NO_INDICATORS;

  // A score is only meaningful where the analysis had something to go on.
  const score = status === AUTHENTICITY.INSUFFICIENT ? null : rawScore;

  // --- 7. why ----------------------------------------------------------
  const reasons = [];
  if (status === AUTHENTICITY.TAMPERED) {
    for (const i of [...serious, ...hits.filter((i) => !serious.includes(i))].slice(0, 4)) reasons.push(i.explanation);
    for (const c of correlations) reasons.push(c.explanation);
  } else if (status === AUTHENTICITY.INSUFFICIENT) {
    if (!ran.textLegible) reasons.push(`Recognised text was too unreliable (${Math.round(ocrConfidence * 100)}%) to compare the document's fields.`);
    if (!ran.fieldCrossCheck) reasons.push('No field could be read from two independent places on the document, so nothing could be cross-checked.');
    if (!ran.imageForensics) reasons.push('Image forensics did not run, so the image itself was not examined for modification.');
    if (!ran.mrzIntegrity && profile.mrz) reasons.push('No machine readable zone could be read, although this document type carries one.');
    if (!reasons.length) reasons.push('Too few checks could run to make any statement about this document.');
  } else {
    // Say what could NOT be done as well as what could: an officer reading "no indicators"
    // needs to know which checks were silent.
    if (!ran.textLegible) reasons.push(`Recognised text was too unreliable (${Math.round(ocrConfidence * 100)}%) to compare the printed fields against the machine readable zone, so no field-level check was performed. Poor recognition is not evidence of tampering.`);
    if (!ran.fieldCrossCheck && ran.textLegible) reasons.push('No field could be read from two independent places on the document, so nothing could be cross-checked.');
    if (crossChecked) reasons.push(`${crossChecked} field(s) were read from two independent representations and agree.`);
    if (mrzParsed && !detected(mrzIndicators).length) reasons.push('All machine readable zone check digits verify.');
    if (tampering && !hits.some((i) => i.category === CATEGORY.FORENSICS)) reasons.push('Image forensics found no localised compression, noise or duplication anomaly.');
    const minor = hits.filter((i) => SEVERITY_RANK[i.severity] < SEVERITY_RANK[SEVERITY.HIGH]);
    if (minor.length) reasons.push(`${minor.length} lower-severity indicator(s) were noted and are listed below; none is sufficient on its own.`);
    if (status === AUTHENTICITY.NO_INDICATORS) reasons.push('Not every check could run, so the absence of indicators is reported as such rather than as positive evidence that the document is original.');
  }

  const limitations = [LIMITATION_PHYSICAL, LIMITATION_ISSUER];
  if (!ran.mrzIntegrity && profile.mrz) limitations.push('The machine readable zone could not be read, so printed values could not be cross-checked against it.');
  if (!ran.imageForensics) limitations.push('No image forensics were available for this screening.');

  return {
    version: 1,
    status,
    label: AUTHENTICITY_LABEL[status],
    short: AUTHENTICITY_SHORT[status],
    score,
    severity,
    coverage,
    coverageDetail: ran,
    indicators: all,
    detectedCount: hits.length,
    correlations,
    compared,
    reasons,
    limitations,
    basis: 'classical forensic analysis and field cross-checking of the supplied image',
  };
}
