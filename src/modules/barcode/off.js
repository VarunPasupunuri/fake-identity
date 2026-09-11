export const PROVIDER_ID = 'off';

/** @returns {Promise<import('./index.js').BarcodeResult>} */
export async function scan() {
  return { status: 'unavailable', codes: [], provider: PROVIDER_ID, engine: null, explanation: 'QR / barcode analysis is disabled.', durationMs: 0 };
}
