/**
 * On-device QR / barcode reader.
 * Prefers the browser BarcodeDetector API (Chromium, Safari 17+) which reads QR
 * and common 1-D formats; falls back to jsQR (QR only) on a canvas.
 */
import { loadImage } from '../../lib/image.js';

export const PROVIDER_ID = 'local';
const FORMATS = ['qr_code', 'pdf417', 'aztec', 'data_matrix', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e'];

async function withNative(img) {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats?.();
    const detector = new window.BarcodeDetector({ formats: supported?.length ? supported.filter((f) => FORMATS.includes(f)) : ['qr_code'] });
    const found = await detector.detect(img);
    return found.map((b) => ({ format: b.format, rawValue: b.rawValue, region: b.boundingBox ? { x: b.boundingBox.x / img.naturalWidth, y: b.boundingBox.y / img.naturalHeight, w: b.boundingBox.width / img.naturalWidth, h: b.boundingBox.height / img.naturalHeight } : undefined }));
  } catch {
    return null; // API present but failed → try jsQR
  }
}

async function withJsQr(img) {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  // Downscale very large captures; QR finder patterns survive at ~1200 px.
  const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hit = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
  if (!hit) return [];
  const xs = [hit.location.topLeftCorner, hit.location.topRightCorner, hit.location.bottomLeftCorner, hit.location.bottomRightCorner];
  const minX = Math.min(...xs.map((p) => p.x)), maxX = Math.max(...xs.map((p) => p.x)), minY = Math.min(...xs.map((p) => p.y)), maxY = Math.max(...xs.map((p) => p.y));
  return [{ format: 'qr_code', rawValue: hit.data, region: { x: minX / canvas.width, y: minY / canvas.height, w: (maxX - minX) / canvas.width, h: (maxY - minY) / canvas.height } }];
}

/** @returns {Promise<import('./index.js').BarcodeResult>} */
export async function scan({ imageDataUrl, onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.1, 'Loading image');
  const img = await loadImage(imageDataUrl);
  onProgress?.(0.4, 'Reading QR/barcode');
  let codes = await withNative(img);
  let engine = 'BarcodeDetector';
  if (!codes || !codes.length) { codes = await withJsQr(img); engine = codes.length ? 'jsQR' : `${codes === null ? 'jsQR' : 'BarcodeDetector + jsQR'}`; }
  onProgress?.(0.95, codes.length ? `${codes.length} code(s) decoded` : 'No code found');
  const durationMs = Math.round(performance.now() - t0);
  if (!codes.length) return { status: 'not_found', codes: [], provider: PROVIDER_ID, engine, explanation: 'No QR code or barcode was detected on the document image.', durationMs };
  return { status: 'detected', codes: codes.filter((c) => c.rawValue), provider: PROVIDER_ID, engine, explanation: `${codes.length} code(s) decoded on device (${engine}). Decoded content is compared with the printed fields; it is not an authenticity check.`, durationMs };
}
