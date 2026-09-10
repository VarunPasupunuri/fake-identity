/** Tampering via the `analyzeTampering` Cloud Function (sharp-based ELA + EXIF). */
import { callFunction } from '../../lib/firebase.js';
import { stripDataUrlPrefix } from '../../lib/image.js';

/** @returns {Promise<import('../types.js').TamperResult>} */
export async function analyse({ imageDataUrl, documentType, onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.1, 'Uploading to analysis service');
  const res = await callFunction('analyzeTampering', { imageBase64: stripDataUrlPrefix(imageDataUrl), documentType });
  onProgress?.(0.95, 'Compiling evidence');
  return { ...res, provider: 'cloud-ela', durationMs: Math.round(performance.now() - t0) };
}
