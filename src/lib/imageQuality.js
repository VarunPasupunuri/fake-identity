/**
 * Quick capture-quality checks so the officer can retake before running the
 * expensive modules: brightness, contrast and a Laplacian-variance blur estimate.
 */
import { loadImage } from './image.js';

export async function assessImageQuality(dataUrl) {
  const img = await loadImage(dataUrl);
  const w = 320, h = Math.max(1, Math.round((img.height / img.width) * 320));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) { const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]; gray[i] = g; sum += g; }
  const mean = sum / (w * h);
  let varSum = 0;
  for (let i = 0; i < w * h; i++) varSum += (gray[i] - mean) ** 2;
  const contrast = Math.sqrt(varSum / (w * h));
  // Laplacian variance (focus measure)
  let lapSum = 0, lapSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
    lapSum += lap; lapSq += lap * lap; n++;
  }
  const lapMean = lapSum / n;
  const sharpness = lapSq / n - lapMean * lapMean;
  const issues = [];
  if (mean < 60) issues.push({ id: 'dark', label: 'Too dark', hint: 'Move to better light or turn on the flash.' });
  if (mean > 215) issues.push({ id: 'bright', label: 'Overexposed', hint: 'Reduce glare — tilt the document away from the light.' });
  if (contrast < 25) issues.push({ id: 'flat', label: 'Low contrast', hint: 'Text may not be readable by OCR.' });
  if (sharpness < 60) issues.push({ id: 'blur', label: 'Blurry', hint: 'Hold steady and let the camera focus before capturing.' });
  const score = Math.max(0, Math.min(100, Math.round(100 - issues.length * 25 - (sharpness < 120 ? 10 : 0))));
  return { brightness: Math.round(mean), contrast: Math.round(contrast), sharpness: Math.round(sharpness), issues, score, width: img.width, height: img.height };
}
