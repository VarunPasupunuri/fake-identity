/**
 * TAMPERING INDICATORS — the structured vocabulary the authenticity engine speaks.
 *
 * One indicator is one finding about one document. Its shape is fixed so the UI,
 * the audit record, the CSV export and the tests all read the same fields.
 *
 * Severity is about what the finding WOULD mean if it holds, not how certain we
 * are that it holds — certainty lives in `confidence`. A visual/MRZ date-of-birth
 * mismatch is `high` even when read from a blurry scan; the blur lowers its
 * confidence, not its severity.
 */

/** @typedef {'field_consistency'|'image_forensics'|'metadata'|'structure'|'biometric'|'mrz'} IndicatorCategory */
export const CATEGORY = Object.freeze({
  FIELD: 'field_consistency',
  FORENSICS: 'image_forensics',
  METADATA: 'metadata',
  STRUCTURE: 'structure',
  BIOMETRIC: 'biometric',
  MRZ: 'mrz',
});

export const CATEGORY_LABEL = Object.freeze({
  field_consistency: 'Field consistency',
  image_forensics: 'Image forensics',
  metadata: 'File metadata',
  structure: 'Document structure',
  biometric: 'Face comparison',
  mrz: 'Machine readable zone',
});

/** Severity of what the indicator would mean. */
export const SEVERITY = Object.freeze({ NONE: 'none', LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' });
export const SEVERITY_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3, critical: 4 });

/** `detected` = the indicator fired. `clear` = the check ran and found nothing. `unavailable` = it could not run. */
export const INDICATOR_STATUS = Object.freeze({ DETECTED: 'detected', CLEAR: 'clear', UNAVAILABLE: 'unavailable' });

/** Stable indicator ids. Used by tests and stored on records, so they must not be renamed lightly. */
export const INDICATOR = Object.freeze({
  VISUAL_MRZ_DOB_MISMATCH: 'VISUAL_MRZ_DOB_MISMATCH',
  VISUAL_MRZ_PASSPORT_NUMBER_MISMATCH: 'VISUAL_MRZ_PASSPORT_NUMBER_MISMATCH',
  VISUAL_MRZ_EXPIRY_MISMATCH: 'VISUAL_MRZ_EXPIRY_MISMATCH',
  VISUAL_MRZ_NAME_MISMATCH: 'VISUAL_MRZ_NAME_MISMATCH',
  VISUAL_MRZ_NATIONALITY_MISMATCH: 'VISUAL_MRZ_NATIONALITY_MISMATCH',
  VISUAL_MRZ_SEX_MISMATCH: 'VISUAL_MRZ_SEX_MISMATCH',
  BARCODE_FIELD_MISMATCH: 'BARCODE_FIELD_MISMATCH',
  MRZ_CHECKSUM_FAILURE: 'MRZ_CHECKSUM_FAILURE',
  MRZ_ABSENT: 'MRZ_ABSENT',
  LOCALIZED_TEXT_EDIT: 'LOCALIZED_TEXT_EDIT',
  PHOTO_REPLACEMENT_INDICATOR: 'PHOTO_REPLACEMENT_INDICATOR',
  STAMP_COMPOSITING_INDICATOR: 'STAMP_COMPOSITING_INDICATOR',
  ELA_LOCALIZED_ANOMALY: 'ELA_LOCALIZED_ANOMALY',
  NOISE_INCONSISTENCY: 'NOISE_INCONSISTENCY',
  RESAMPLING_INCONSISTENCY: 'RESAMPLING_INCONSISTENCY',
  COPY_MOVE_INDICATOR: 'COPY_MOVE_INDICATOR',
  METADATA_EDITOR_INDICATOR: 'METADATA_EDITOR_INDICATOR',
  METADATA_TIMESTAMP_INDICATOR: 'METADATA_TIMESTAMP_INDICATOR',
  DOCUMENT_LAYOUT_ANOMALY: 'DOCUMENT_LAYOUT_ANOMALY',
  ASPECT_RATIO_ANOMALY: 'ASPECT_RATIO_ANOMALY',
  BIOMETRIC_MISMATCH: 'BIOMETRIC_MISMATCH',
});

/**
 * Build one indicator. Everything is explicit — no field is inferred later.
 *
 * @param {Object} a
 * @param {string} a.id            one of INDICATOR
 * @param {IndicatorCategory} a.category
 * @param {string} a.severity      what this WOULD mean (see SEVERITY)
 * @param {string} [a.status]      detected | clear | unavailable
 * @param {string} a.explanation   plain sentence for the officer
 * @param {string} [a.field]       the document field it concerns
 * @param {Object} [a.region]      { x, y, w, h } in fractions of the image
 * @param {Object} [a.evidence]    the measured values behind it
 * @param {number} [a.riskContribution]  points it adds to the tampering score
 * @param {number} [a.confidence]  0..1 — how reliable this particular finding is
 */
export function indicator({ id, category, severity, status = INDICATOR_STATUS.DETECTED, explanation, field = null, region = null, evidence = {}, riskContribution = 0, confidence = 1 }) {
  return {
    id, category, severity, status, explanation,
    field, region, evidence,
    riskContribution: Math.max(0, Math.round(riskContribution)),
    confidence: Math.max(0, Math.min(1, +confidence.toFixed(2))),
  };
}

/** Highest severity among the detected indicators. */
export function peakSeverity(indicators) {
  const detected = indicators.filter((i) => i.status === INDICATOR_STATUS.DETECTED);
  if (!detected.length) return SEVERITY.NONE;
  return detected.reduce((worst, i) => (SEVERITY_RANK[i.severity] > SEVERITY_RANK[worst] ? i.severity : worst), SEVERITY.NONE);
}
