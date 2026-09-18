/**
 * PREFLIGHT DOCUMENT-TYPE CHECK
 *
 * Runs between capture/upload and the screening pipeline: it compares the
 * document type the officer selected with the type the classifier detects in
 * the recognised text, so passport rules are never applied to an Aadhaar card
 * (or visa rules to a passport, and so on).
 *
 * Pure and deterministic — no React, no I/O. The caller supplies the recognised
 * text; this module only decides what it means.
 *
 * Design rules:
 *   • Blocking is conservative. A document is only blocked when another type is
 *     detected *confidently* and the selected type is clearly not supported by
 *     the text. Anything weaker is UNCERTAIN, which warns but never rejects.
 *   • Detection is not authenticity verification. These are layout and wording
 *     clues, nothing more.
 *   • The officer's selection is never silently changed; they must choose.
 */
import { classifyDocument, CLASSIFICATION_FLOOR } from './classify.js';
import { getProfile, resolveSelection, GENERIC_DOCUMENT, DOCUMENT_CATEGORIES } from './registry.js';
import { scoreProfile } from './classify.js';

/** @typedef {'match'|'mismatch'|'uncertain'|'unavailable'} PreflightStatus */
export const PREFLIGHT = Object.freeze({ MATCH: 'match', MISMATCH: 'mismatch', UNCERTAIN: 'uncertain', UNAVAILABLE: 'unavailable' });

/**
 * Signal strength the detected type needs before a mismatch may block the screening.
 * This is the weighted evidence for that type, not the classifier's blended confidence:
 * the blend also folds in the margin over the runner-up, which is checked separately
 * below, so using it here would under-report a document with a clear, decisive heading.
 */
export const MISMATCH_FLOOR = 0.6;
/** If the selected type scores within this of the detected type, the evidence is too close to call. */
export const AMBIGUITY_MARGIN = 0.15;
/** Below this many recognised characters there is nothing to classify. */
export const MIN_TEXT_LENGTH = 24;

const label = (id) => getProfile(id).label;

/**
 * Compare the officer's selection with the detected type.
 *
 * @param {{ selected: string, rawText: string, mrz?: Object|null, classification?: Object }} args
 *   `selected` is a selector value: a profile id, `auto`, or `category:<name>`.
 *   `classification` may be supplied to reuse an existing classifier result.
 * @returns {{ status: PreflightStatus, blocking: boolean, selectedType: string|null, selectedLabel: string,
 *   detectedType: string|null, detectedLabel: string, confidence: number, signals: {label:string,weight:number}[],
 *   title: string, message: string, classification: Object|null }}
 */
export function checkDocumentType({ selected, rawText, mrz = null, classification = null }) {
  const sel = resolveSelection(selected);
  const selectedLabel = sel.type ? label(sel.type) : sel.category ? DOCUMENT_CATEGORIES[sel.category]?.label || sel.category : 'Auto-detect';
  const base = { selectedType: sel.type, selectedLabel, detectedType: null, detectedLabel: '', confidence: 0, signals: [], classification: null };

  const text = String(rawText || '').trim();
  if (text.length < MIN_TEXT_LENGTH) {
    return {
      ...base, status: PREFLIGHT.UNAVAILABLE, blocking: false,
      title: 'Document type could not be checked',
      message: 'Not enough text could be read from the image to identify the document type. Screening can continue, and the extraction stage will report what it could read.',
    };
  }

  // Classify without the officer's hint: the point is to see the document on its own terms.
  const cls = classification || classifyDocument({ rawText: text, mrz });
  const detectedType = cls.type;
  const detectedLabel = label(detectedType);
  const confidence = Number(cls.confidence) || 0;
  const signals = cls.signals || [];
  const found = { ...base, detectedType, detectedLabel, confidence, signals, classification: cls };

  // Auto-detect or a category selection: nothing was asserted that the document can contradict.
  if (!sel.type) {
    if (sel.category && detectedType !== GENERIC_DOCUMENT && scoreProfile(getProfile(detectedType), String(text).toUpperCase()) >= MISMATCH_FLOOR && getProfile(detectedType).category !== sel.category) {
      return {
        ...found, status: PREFLIGHT.MISMATCH, blocking: true,
        title: 'Document type mismatch',
        message: `You selected ${selectedLabel}, but this looks like a ${detectedLabel}. Select the matching document type, or upload a document from the ${selectedLabel.toLowerCase()} category.`,
      };
    }
    return {
      ...found, status: PREFLIGHT.MATCH, blocking: false,
      title: detectedType === GENERIC_DOCUMENT ? 'Document type will be detected during screening' : `Detected: ${detectedLabel}`,
      message: detectedType === GENERIC_DOCUMENT
        ? 'No specific document type could be recognised yet. Screening will continue and apply generic checks.'
        : `Text clues identify a ${detectedLabel.toLowerCase()} (${Math.round(confidence * 100)}% classification confidence).`,
    };
  }

  // Selected type agrees with the detection.
  if (detectedType === sel.type) {
    return {
      ...found, status: PREFLIGHT.MATCH, blocking: false,
      title: 'Document type match',
      message: `The uploaded document matches the selected type (${Math.round(confidence * 100)}% classification confidence).`,
    };
  }

  const upper = String(text).toUpperCase();
  const selectedScore = scoreProfile(getProfile(sel.type), upper);
  const detectedScore = detectedType === GENERIC_DOCUMENT ? 0 : scoreProfile(getProfile(detectedType), upper);

  // The classifier could not settle on any specific type — never call that a mismatch.
  if (detectedType === GENERIC_DOCUMENT || detectedScore < MISMATCH_FLOOR) {
    return {
      ...found, status: PREFLIGHT.UNCERTAIN, blocking: false, selectedScore, detectedScore,
      title: 'Document type uncertain',
      message: `The document could not be identified confidently${detectedType !== GENERIC_DOCUMENT ? ` (closest match ${detectedLabel}, ${Math.round(confidence * 100)}%)` : ''}. Check that ${selectedLabel} is correct, or upload a clearer image. Screening can continue.`,
    };
  }

  // The selected type also has real support in the text: too close to call.
  if (selectedScore > 0 && detectedScore - selectedScore < AMBIGUITY_MARGIN) {
    return {
      ...found, status: PREFLIGHT.UNCERTAIN, blocking: false, selectedScore, detectedScore,
      title: 'Document type uncertain',
      message: `The text supports both ${selectedLabel} and ${detectedLabel}. Confirm the selected type is correct, or upload a clearer image. Screening can continue.`,
    };
  }

  return {
    ...found, status: PREFLIGHT.MISMATCH, blocking: true, selectedScore, detectedScore,
    title: 'Document type mismatch',
    message: `The uploaded document does not match the selected screening type. Select ${detectedLabel}, or upload a ${selectedLabel.toLowerCase()} image.`,
  };
}

/** True when the screening pipeline must not start. */
export function blocksScreening(result) { return Boolean(result?.blocking); }

export { CLASSIFICATION_FLOOR };
