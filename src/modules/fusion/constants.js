/**
 * Evidence Fusion Engine — all tunable numbers in one place.
 * Every value here is documented so the score can be explained line by line.
 */

/** Four-way decision vocabulary used by the fusion engine. */
export const DECISION = Object.freeze({
  APPROVE: 'approve',              // document-level evidence: LIKELY AUTHENTIC
  REVIEW: 'review',                // REVIEW REQUIRED
  REJECT: 'reject',                // SUSPICIOUS
  INSUFFICIENT: 'insufficient_evidence',
  VERIFIED: 'verified',            // only when an authorised issuer source confirmed the record
});

/**
 * Officer-facing labels. Stored values keep the original vocabulary (approve | review | reject |
 * insufficient_evidence) so older records stay readable; `verified` is only ever produced when an
 * issuer provider actually confirmed the document.
 */
export const DECISION_LABEL = Object.freeze({
  approve: 'Likely authentic',
  review: 'Review required',
  reject: 'Suspicious',
  insufficient_evidence: 'Insufficient evidence',
  verified: 'Verified',
});

/** Evidence sources (one per analysis module, plus fusion itself). */
export const SOURCE = Object.freeze({
  OCR: 'ocr',
  VALIDATION: 'validation',
  TAMPERING: 'tampering',
  FACE: 'face',
  CLASSIFICATION: 'classification',
  WATCHLIST: 'watchlist',
  IDENTITY: 'identity',
  BARCODE: 'barcode',
  ISSUER: 'issuer',
  FUSION: 'fusion',
});

/** Evidence status. `unavailable` means the module could not produce this finding — it is never a failure. */
export const STATUS = Object.freeze({ PASS: 'pass', FAIL: 'fail', WARN: 'warn', INFO: 'info', UNAVAILABLE: 'unavailable' });

/** Severity ladder. `none` is used for passing / informational evidence. */
export const SEVERITY = Object.freeze({ NONE: 'none', LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' });
export const SEVERITY_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3, critical: 4 });

/**
 * Risk contributions (points on the 0–100 risk scale).
 * Validation, tampering, face and OCR values intentionally mirror src/modules/risk/index.js
 * so the fusion risk stays interpretable next to records scored by the legacy engine.
 * Provider failures contribute 0 risk here — they lower CONFIDENCE instead.
 */
export const RISK = Object.freeze({
  validation: { critical: 25, major: 12, minor: 4, warn: 4, cap: 45 },
  tampering: { multiplier: 0.4, cap: 40, highFlag: 8 },
  face: { cap: 35, noMatch: 10 },
  ocr: { lowConfidence: 6 },
  // Optional future modules (contract only — no provider implemented yet)
  watchlist: { match: 30, possible: 15, weakPossible: 5, weakBelow: 0.5 }, // possible hits below `weakBelow` confidence (name-only) count as weak
  identity: { link: 10, conflicting: 15 },
  classification: { lowConfidence: 4 },
  // QR / barcode readability and consistency are scored by the validation rules (barcode_* checks);
  // the module's own evidence carries no points so a code is never double-counted.
  barcode: { none: 0 },
  // Issuer verification: absence from an issuer register is a review signal, a contradiction is conclusive.
  issuer: { notFound: 8, mismatch: 25 },
  // Cross-module correlations (bounded so a correlation can raise but never dominate the score)
  correlation: {
    mrz_field_tamper: 12, // MRZ↔visual mismatch on a field + tampering flag on that same field
    field_tamper: 8,      // any other field-linked validation failure + tampering flag on that field
    mrz_zone_tamper: 10,  // MRZ check-digit failure + tampering flag in the MRZ zone
    photo_face: 15,       // photo-replacement flag + biometric mismatch
    metadata_ela: 5,      // editing software in metadata + localized ELA anomaly
    watchlist_face: 10,   // watchlisted document + presented person matches its photo
    cap: 30,
  },
});

/**
 * Evidence that is conclusive on its own: a failing item with one of these ids rejects
 * the document regardless of the risk band. Everything else (MRZ mismatches, check-digit
 * failures, tampering flags…) needs the risk band or a critical correlation to reject.
 */
export const REJECT_ON_FAIL = Object.freeze(['validation:expiry_not_passed', 'validation:expiry_valid', 'watchlist:result', 'issuer:result']);

/** Core analysis modules; when one is unavailable the document cannot be APPROVED without officer inspection. */
export const CORE_UNAVAILABLE_IDS = Object.freeze(['tampering:unavailable', 'face:unavailable', 'face:not_compared']);

/** Risk bands (kept identical to the legacy engine). */
export const RISK_THRESHOLDS = Object.freeze({ review: 30, reject: 60 });

/**
 * Analysis confidence (0–100) — how much the analysis itself can be relied upon.
 * It is NOT a function of how suspicious the document is.
 *   ocr          up to 30  scaled by OCR engine confidence (0 if OCR unavailable)
 *   structure    up to 10  MRZ parsed for MRZ-bearing documents (10 for non-MRZ documents)
 *   tampering    up to 20  forensic module produced a result
 *   face         up to 25  faces compared (5 if module ran but a face was not found)
 *   providers    up to 15  real providers (0 when any module output is mock/seed data)
 */
export const CONFIDENCE = Object.freeze({
  ocr: 30, structure: 10, tampering: 20, face: 25, providers: 15,
  faceNotFound: 5,
  faceNotApplicable: 25, // biometric comparison does not apply (certificates etc.): the analysis is not less complete
  thresholds: { insufficient: 50, approve: 70, highRiskNeeds: 60 },
});

/** Face verification bands on the 0–100 match-confidence scale. */
export const FACE_BANDS = Object.freeze({ match: 65, review: 50 });

/** Document types that carry a machine readable zone. */
export const MRZ_DOCUMENT_TYPES = Object.freeze(['passport', 'visa', 'national_id']);

/** Trust-profile penalties (points subtracted from 100). */
export const TRUST = Object.freeze({
  identity: { mrzVisualMismatch: 40, mrzChecksumFail: 25, dobImplausible: 20, warn: 5 },
  validity: { critical: 50, major: 25, minor: 10, warn: 5 },
  integrity: { highFlag: 10 },
  minDimensionsForOverall: 2,
});
