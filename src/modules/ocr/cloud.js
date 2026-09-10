/**
 * OCR via the `ocrExtract` Cloud Function (Google Cloud Vision DOCUMENT_TEXT_DETECTION).
 * The function returns raw text + confidence; field parsing stays client-side and shared.
 */
import { callFunction } from '../../lib/firebase.js';
import { parseFields } from './parse.js';
import { stripDataUrlPrefix } from '../../lib/image.js';

/** @returns {Promise<import('../types.js').OcrResult>} */
export async function extract({ imageDataUrl, documentType = 'passport', onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.1, 'Uploading to Cloud Vision');
  const res = await callFunction('ocrExtract', { imageBase64: stripDataUrlPrefix(imageDataUrl) });
  onProgress?.(0.8, 'Parsing fields');
  const rawText = res.rawText || '';
  const { fields, vizFields, mrz } = parseFields(rawText, documentType);
  const confidence = typeof res.confidence === 'number' ? res.confidence : 0.8;
  const fieldConfidence = Object.fromEntries(Object.keys(fields).map((k) => [k, confidence]));
  return { fields, vizFields, fieldConfidence, confidence, rawText, mrz, provider: 'cloud-vision', durationMs: Math.round(performance.now() - t0) };
}
