/** Browser image helpers shared by upload, camera capture and the CV modules. */

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

/** Downscale to `maxSide` px and re-encode as JPEG. Keeps uploads and localStorage small. */
export async function resizeDataUrl(dataUrl, maxSide = 1400, quality = 0.92) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1 && dataUrl.startsWith('data:image/jpeg')) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Crop a horizontal band of an image and scale it up, as a data URL.
 *
 * The machine readable zone is a small strip of OCR-B at the foot of the page.
 * Recognised as part of a whole-page pass it is usually lost, so it gets a pass
 * of its own: this cuts the band out and enlarges it, because OCR of small
 * fixed-pitch text improves markedly with resolution.
 *
 * @param {string} dataUrl
 * @param {{ top?: number, height?: number, scale?: number }} band  fractions of image height
 */
export async function cropBand(dataUrl, { top = 0.7, height = 0.3, scale = 2 } = {}) {
  const img = await loadImage(dataUrl);
  const y = Math.max(0, Math.round(img.height * top));
  const h = Math.max(1, Math.min(img.height - y, Math.round(img.height * height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, y, img.width, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function stripDataUrlPrefix(dataUrl) {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
