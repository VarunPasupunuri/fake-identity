/**
 * Document-type registry: lookups over the declarative profiles.
 * Pure — safe in the browser, Cloud Functions and tests.
 */
import { PROFILES } from './profiles.js';

export const AUTO_DETECT = 'auto';
export const GENERIC_DOCUMENT = 'generic_document';

export const DOCUMENT_CATEGORIES = Object.freeze({
  travel: { label: 'Travel document', order: 1 },
  identity: { label: 'Identity document', order: 2 },
  civil: { label: 'Civil registration', order: 3 },
  academic: { label: 'Academic document', order: 4 },
  employment: { label: 'Employment document', order: 5 },
  certificate: { label: 'Official certificate', order: 6 },
  generic: { label: 'Generic document', order: 7 },
});

const BY_ID = Object.fromEntries(PROFILES.map((p) => [p.id, p]));

/** All profiles in display order. */
export function listProfiles() { return PROFILES; }

/** Profile for a stored document type; unknown ids resolve to the generic profile (never throws). */
export function getProfile(id) { return BY_ID[id] || BY_ID[GENERIC_DOCUMENT]; }

export function isKnownType(id) { return Boolean(BY_ID[id]); }

/** Types validated by the original passport/visa rule engine. */
export const LEGACY_TYPES = Object.freeze(PROFILES.filter((p) => p.legacy).map((p) => p.id));

/** Document types that carry a machine readable zone. */
export const MRZ_TYPES = Object.freeze(PROFILES.filter((p) => p.mrz).map((p) => p.id));

/** Whether a live-face comparison applies to a document type. */
export function faceApplicability(id) { return getProfile(id).face; }

/** Label for a type or category selection value. */
export function typeLabel(id) { return BY_ID[id]?.label || (id === AUTO_DETECT ? 'Auto-detect' : id); }

/**
 * Options for the document-type selector: auto-detect first, the most common
 * types by name, then whole categories, then "Other". A category value
 * (`category:academic`) lets the classifier pick the exact type within it.
 */
export const SELECTOR_OPTIONS = Object.freeze([
  { value: AUTO_DETECT, label: 'Auto-detect', hint: 'The document type is detected from the captured text. Use this when unsure.' },
  { value: 'passport', label: 'Passport' },
  { value: 'visa', label: 'Visa' },
  { value: 'national_id', label: 'National ID' },
  { value: 'driving_license', label: 'Driving Licence' },
  { value: 'birth_certificate', label: 'Birth Certificate' },
  { value: 'death_certificate', label: 'Death Certificate' },
  { value: 'category:academic', label: 'Academic Document', hint: 'Marks memo, marksheet, degree, transcript, transfer or migration certificate.' },
  { value: 'category:employment', label: 'Employment Document', hint: 'Employment, experience or salary certificate, offer or appointment letter.' },
  { value: 'category:certificate', label: 'Certificate / Licence', hint: 'Government, professional, business or financial documents.' },
  { value: GENERIC_DOCUMENT, label: 'Other' , hint: 'Generic screening: extraction, forensics and consistency checks without a document-specific rule set.' },
]);

/**
 * Interpret a selector value.
 * @returns {{ type: string|null, category: string|null, auto: boolean }}
 */
export function resolveSelection(value) {
  if (!value || value === AUTO_DETECT) return { type: null, category: null, auto: true };
  if (value.startsWith('category:')) return { type: null, category: value.slice('category:'.length), auto: true };
  return { type: isKnownType(value) ? value : GENERIC_DOCUMENT, category: null, auto: false };
}

/** Capture guidance for a selector value. */
export function selectionGuidance(value) {
  const sel = resolveSelection(value);
  if (sel.type) return getProfile(sel.type).guidance;
  const opt = SELECTOR_OPTIONS.find((o) => o.value === value);
  return opt?.hint || 'Capture the whole document flat, with all corners visible and text legible.';
}

/** Ordered list of expected field keys for a type (required first). */
export function expectedFieldKeys(id) {
  const p = getProfile(id);
  return [...p.fields.filter((f) => f.required).map((f) => f.key), ...p.fields.filter((f) => !f.required).map((f) => f.key)];
}
