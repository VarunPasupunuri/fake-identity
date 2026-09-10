/**
 * Shared contracts for every screening module.
 *
 * Each module (OCR, validation, tampering, face, risk) exposes a single async
 * function with a fixed input/output shape. The UI only ever talks to these
 * shapes, so a provider (mock, in-browser, Cloud Function, trained ML model)
 * can be swapped in `src/modules/registry.js` without touching any component.
 *
 * @typedef {'passport'|'visa'|'national_id'|'driving_license'|'permit'} DocumentType
 *
 * @typedef {Object} ExtractedFields
 * @property {string} [surname]
 * @property {string} [givenNames]
 * @property {string} [fullName]
 * @property {string} [documentNumber]
 * @property {string} [nationality]        ISO 3166-1 alpha-3 where possible
 * @property {string} [issuingCountry]
 * @property {string} [dateOfBirth]        ISO yyyy-mm-dd
 * @property {string} [expiryDate]         ISO yyyy-mm-dd
 * @property {string} [gender]             M | F | X
 * @property {string} [visaNumber]
 * @property {string} [visaType]
 * @property {string} [entries]            e.g. SINGLE / MULTIPLE
 * @property {string} [validFrom]          ISO yyyy-mm-dd
 * @property {string} [validUntil]         ISO yyyy-mm-dd
 * @property {string} [stayDuration]       e.g. "90 days"
 *
 * @typedef {Object} OcrResult
 * @property {ExtractedFields} fields
 * @property {Object<string, number>} fieldConfidence   0..1 per field
 * @property {number} confidence                        0..1 overall
 * @property {string} rawText
 * @property {{ format: 'TD1'|'TD2'|'TD3', lines: string[] }|null} mrz
 * @property {string} provider
 * @property {number} durationMs
 *
 * @typedef {'pass'|'fail'|'warn'|'skip'} CheckStatus
 *
 * @typedef {Object} ValidationCheck
 * @property {string} id
 * @property {string} label
 * @property {CheckStatus} status
 * @property {string} detail
 * @property {string} [field]
 * @property {'critical'|'major'|'minor'} severity
 *
 * @typedef {Object} ValidationResult
 * @property {ValidationCheck[]} checks
 * @property {number} passed
 * @property {number} failed
 * @property {number} warnings
 * @property {boolean} ok
 *
 * @typedef {Object} Region   normalised 0..1 box on the document image
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 *
 * @typedef {Object} TamperFlag
 * @property {string} id
 * @property {'photo_replacement'|'text_manipulation'|'stamp_forgery'|'metadata'|'recompression'} type
 * @property {'low'|'medium'|'high'} severity
 * @property {string} label
 * @property {string} detail
 * @property {Region} [region]
 * @property {string} [field]
 *
 * @typedef {Object} TamperResult
 * @property {number} score           0..100 (higher = more likely tampered)
 * @property {TamperFlag[]} flags
 * @property {{ elaImage?: string, metadata?: Object, stats?: Object }} evidence
 * @property {string} provider
 * @property {number} durationMs
 *
 * @typedef {Object} FaceResult
 * @property {number} confidence      0..100 match confidence
 * @property {boolean} match
 * @property {number|null} distance   raw embedding distance when available
 * @property {boolean} documentFaceFound
 * @property {boolean} liveFaceFound
 * @property {Region|null} documentFaceBox
 * @property {Region|null} liveFaceBox
 * @property {string} provider
 * @property {number} durationMs
 * @property {string} [note]
 *
 * @typedef {Object} RiskFactor
 * @property {string} id
 * @property {string} label
 * @property {number} points
 * @property {'validation'|'tampering'|'face'|'ocr'} source
 * @property {string} detail
 *
 * @typedef {Object} RiskResult
 * @property {number} score           0..100
 * @property {'low'|'medium'|'high'} level
 * @property {RiskFactor[]} factors
 * @property {string} recommendation  accept | flag | reject
 * @property {string} summary
 */

export const DOCUMENT_TYPES = [
  { value: 'passport', label: 'Passport', hasMrz: true },
  { value: 'visa', label: 'Visa', hasMrz: true },
  { value: 'national_id', label: 'National ID', hasMrz: true },
  { value: 'driving_license', label: 'Driving Licence', hasMrz: false },
  { value: 'permit', label: 'Permit / Pass', hasMrz: false },
];

export const DOCUMENT_TYPE_LABEL = Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.value, d.label]));

export const DECISIONS = {
  accept: { label: 'Accept', color: 'emerald' },
  flag: { label: 'Flag for review', color: 'amber' },
  reject: { label: 'Reject', color: 'red' },
};
