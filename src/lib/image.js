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
 * Rotate an image by a quarter turn, as a data URL.
 *
 * A document photographed with the phone held the other way round arrives
 * sideways. Text recognition reads horizontal lines, so on a sideways page it
 * returns noise: no fields, no machine readable zone, nothing to cross-check,
 * and a forged document with nothing to contradict it.
 *
 * @param {string} dataUrl
 * @param {0|90|180|270} degrees  clockwise
 */
export async function rotateDataUrl(dataUrl, degrees) {
  if (!degrees) return dataUrl;
  const img = await loadImage(dataUrl);
  const quarter = degrees === 90 || degrees === 270;
  const canvas = document.createElement('canvas');
  canvas.width = quarter ? img.height : img.width;
  canvas.height = quarter ? img.width : img.height;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas.toDataURL('image/png');
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
export async function cropBand(dataUrl, { top = 0.7, height = 0.3, scale = 2, enhance = false } = {}) {
  const img = await loadImage(dataUrl);
  const y = Math.max(0, Math.round(img.height * top));
  const h = Math.max(1, Math.min(img.height - y, Math.round(img.height * height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, y, img.width, h, 0, 0, canvas.width, canvas.height);
  if (enhance) enhanceForOcr(ctx, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/**
 * Flatten a photographed strip to high-contrast grey, in place.
 *
 * A document photographed rather than scanned carries the colour of whatever it
 * was lying on, the shadow of the hand holding it, and a page that is off-white
 * rather than white. Recognition works on the difference between ink and paper,
 * so the channel is reduced to luminance and stretched to fill the range: paper
 * goes to white, ink to black, and the printed surface stops competing with the
 * print. The percentile bounds keep a single glare highlight or dark fold from
 * setting the range for the whole strip.
 */
function enhanceForOcr(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const luma = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
    px[i] = px[i + 1] = px[i + 2] = luma;
    histogram[luma] += 1;
  }
  const total = width * height;
  const cut = Math.max(1, Math.round(total * 0.02));
  let low = 0; let high = 255; let seen = 0;
  for (let v = 0; v < 256; v += 1) { seen += histogram[v]; if (seen >= cut) { low = v; break; } }
  seen = 0;
  for (let v = 255; v >= 0; v -= 1) { seen += histogram[v]; if (seen >= cut) { high = v; break; } }
  const span = Math.max(1, high - low);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - low) * 255) / span));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
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
