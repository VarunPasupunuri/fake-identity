/**
 * QR / barcode analysis — provider abstraction.
 *
 *   local  on-device: the browser BarcodeDetector API when available (QR + 1-D
 *          formats), otherwise jsQR (QR only). Nothing leaves the device.
 *   mock   deterministic demo output
 *   off    reports `unavailable`
 *
 * A detected code is evidence of what the code ENCODES, never of authenticity;
 * consistency with the printed fields is judged by the validation rules.
 *
 * @typedef {Object} DecodedCode
 * @property {string} format       qr_code | code_128 | ean_13 | pdf417 | …
 * @property {string} rawValue
 * @property {{ x: number, y: number, w: number, h: number }} [region]   normalised box on the image
 *
 * @typedef {Object} BarcodeResult
 * @property {'detected'|'not_found'|'unreadable'|'unavailable'} status
 * @property {DecodedCode[]} codes
 * @property {string} provider
 * @property {string} explanation
 * @property {number} durationMs
 */
import * as local from './local.js';
import * as mock from './mock.js';
import * as off from './off.js';

export const BARCODE_PROVIDERS = { local, mock, off };

/**
 * @param {{ provider?: string, imageDataUrl: string, documentType?: string, scenario?: string, onProgress?: Function }} args
 * @returns {Promise<BarcodeResult>}
 */
export async function runBarcodeScan({ provider, ...args }) {
  const impl = BARCODE_PROVIDERS[provider] || BARCODE_PROVIDERS.off;
  return impl.scan(args);
}

export { classifyDecodedContent, contentMatchesIdentifiers, encodedIdentifiers } from './decode.js';
