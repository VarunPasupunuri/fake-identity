/**
 * DEMONSTRATION SCENARIOS — SYNTHETIC DATA ONLY.
 *
 * One descriptor per scenario, read by every mock provider (OCR, tampering,
 * face, barcode) so a scenario produces a coherent case across all four SIH
 * modules instead of each provider guessing independently.
 *
 * These drive the "Demonstration data" toggle on the screening page. Nothing
 * here touches the real providers: with the toggle off, Tesseract, the ELA
 * forensics, face-api.js and the configured watchlist run normally.
 *
 * `expected` documents the assessment the evidence should produce. It is a note
 * for the demonstrator, not an input: the fusion engine derives the actual
 * assessment from the evidence, so a rule change can legitimately move it.
 */

/**
 * @typedef {Object} ScenarioProfile
 * @property {string} id
 * @property {string} label           shown in the scenario dropdown
 * @property {string} summary         one line describing what the case demonstrates
 * @property {string} expected        assessment this evidence is designed to produce
 * @property {string} ocr             clean | dob_mismatch | expired_watchlisted | unreadable | missing_fields | inconsistent_dates | poor_ocr | unknown
 * @property {string} tampering       clean | dob_region | photo_region | full
 * @property {string} face            match | mismatch | not_found | skip
 * @property {boolean} [sih]          part of the five headline SIH demonstration cases
 */

/** @type {ScenarioProfile[]} */
export const SCENARIO_PROFILES = [
  {
    id: 'clean_passport', label: 'Clean passport', sih: true,
    summary: 'Consistent MRZ and printed data, no manipulation signal, face matches, watchlist clear.',
    expected: 'Approve', ocr: 'clean', tampering: 'clean', face: 'match',
  },
  {
    id: 'tampered_dob', label: 'Tampered date of birth', sih: true,
    summary: 'Printed date of birth disagrees with the MRZ and image forensics flag that same region.',
    expected: 'Review required', ocr: 'dob_mismatch', tampering: 'dob_region', face: 'match',
  },
  {
    id: 'photo_substitution', label: 'Altered photograph', sih: true,
    summary: 'Photo region shows a manipulation signal and the presented person does not match the document photo.',
    expected: 'Reject', ocr: 'clean', tampering: 'photo_region', face: 'mismatch',
  },
  {
    id: 'expired_watchlist', label: 'Expired + watchlist hit', sih: true,
    summary: 'Document expired, and its identifiers match a record on the synthetic demo watchlist.',
    expected: 'Reject', ocr: 'expired_watchlisted', tampering: 'clean', face: 'match',
  },
  {
    id: 'insufficient_evidence', label: 'Insufficient evidence', sih: true,
    summary: 'Extraction fails and no face can be compared, so no defensible assessment exists.',
    expected: 'Insufficient evidence', ocr: 'unreadable', tampering: 'clean', face: 'not_found',
  },
  // Document-quality cases used by the universal document types
  { id: 'clean', label: 'Genuine document', summary: 'Internally consistent document.', expected: 'Approve', ocr: 'clean', tampering: 'clean', face: 'match' },
  { id: 'suspicious', label: 'Altered document', summary: 'Multiple manipulation signals and a failing document check.', expected: 'Reject', ocr: 'suspicious', tampering: 'full', face: 'mismatch' },
  { id: 'missing_fields', label: 'Missing required fields', summary: 'Required fields absent from the document.', expected: 'Review required', ocr: 'missing_fields', tampering: 'clean', face: 'match' },
  { id: 'inconsistent_dates', label: 'Inconsistent dates', summary: 'Contradictory dates on the document.', expected: 'Review required', ocr: 'inconsistent_dates', tampering: 'clean', face: 'match' },
  { id: 'poor_ocr', label: 'Poor OCR quality', summary: 'Garbled text lowers analysis confidence.', expected: 'Insufficient evidence', ocr: 'poor_ocr', tampering: 'clean', face: 'match' },
  { id: 'unreadable_qr', label: 'Unreadable QR code', summary: 'A code is present but cannot be decoded.', expected: 'Review required', ocr: 'clean', tampering: 'clean', face: 'match' },
  { id: 'unknown', label: 'Unknown document type', summary: 'Text matches no known document type.', expected: 'Review required', ocr: 'unknown', tampering: 'clean', face: 'skip' },
];

const BY_ID = Object.fromEntries(SCENARIO_PROFILES.map((s) => [s.id, s]));

/** Scenario descriptor; unknown ids fall back to the clean case (never throws). */
export function scenarioProfile(id) { return BY_ID[id] || BY_ID.clean; }

/** The five headline SIH demonstration cases, in presentation order. */
export const SIH_SCENARIOS = SCENARIO_PROFILES.filter((s) => s.sih);

/** Options for the scenario dropdown: SIH cases first, then the document-quality cases. */
export const SCENARIO_OPTIONS = SCENARIO_PROFILES.map((s) => ({ value: s.id, label: s.label, summary: s.summary, expected: s.expected, sih: Boolean(s.sih) }));
