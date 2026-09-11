/**
 * Mock QR / barcode provider — deterministic demo output derived from the
 * synthetic fixtures so the decoded content agrees (or deliberately disagrees)
 * with the mock OCR text for the same scenario.
 */
import { sleep } from '../../lib/image.js';
import { fixtureBarcode } from '../documents/fixtures.js';

export const PROVIDER_ID = 'mock';

/** @returns {Promise<import('./index.js').BarcodeResult>} */
export async function scan({ documentType = 'passport', scenario = 'clean', mockDocument, onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.3, 'Reading QR/barcode');
  await sleep(160);
  const fx = fixtureBarcode(mockDocument || documentType, scenario);
  onProgress?.(0.9, fx.status === 'detected' ? 'Code decoded' : 'No code found');
  return { ...fx, provider: PROVIDER_ID, engine: 'mock', durationMs: Math.round(performance.now() - t0) };
}
