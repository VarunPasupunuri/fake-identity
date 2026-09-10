/**
 * Error Level Analysis (ELA) — browser implementation on <canvas>.
 *
 * Idea: re-save the image as JPEG at a known quality and diff it against the
 * original. Regions that were pasted in / edited after the last save compress
 * differently and light up in the difference image. We then split the image
 * into a grid, compute per-cell error energy, and flag cells whose energy is
 * an outlier relative to the rest of the document.
 *
 * This is an MVP heuristic. In a full build this file is replaced by a trained
 * forgery-detection model (e.g. a CNN on ELA + noise residuals, or a
 * ManTra-Net / CAT-Net style network) that returns the same `{score, flags,
 * evidence}` shape.
 */
import { loadImage } from '../../lib/image.js';

const ELA_QUALITY = 0.9;
const ELA_GAIN = 12; // amplify differences for the evidence heat-map
const GRID = 10;      // 10 x 10 cells
const MAX_SIDE = 1000;

/**
 * @param {string} imageDataUrl
 * @returns {Promise<{ elaImage: string, cells: number[][], mean: number, std: number, width: number, height: number }>}
 */
export async function runEla(imageDataUrl) {
  const img = await loadImage(imageDataUrl);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const c1 = document.createElement('canvas');
  c1.width = w; c1.height = h;
  const ctx1 = c1.getContext('2d', { willReadFrequently: true });
  ctx1.drawImage(img, 0, 0, w, h);
  const orig = ctx1.getImageData(0, 0, w, h);

  // Re-compress once at a known quality
  const resaved = await loadImage(c1.toDataURL('image/jpeg', ELA_QUALITY));
  const c2 = document.createElement('canvas');
  c2.width = w; c2.height = h;
  const ctx2 = c2.getContext('2d', { willReadFrequently: true });
  ctx2.drawImage(resaved, 0, 0, w, h);
  const re = ctx2.getImageData(0, 0, w, h);

  // Difference image + per-cell energy
  const out = ctx2.createImageData(w, h);
  const cells = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  const counts = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  const o = orig.data, r = re.data, d = out.data;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y / h) * GRID));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(o[i] - r[i]);
      const dg = Math.abs(o[i + 1] - r[i + 1]);
      const db = Math.abs(o[i + 2] - r[i + 2]);
      const e = (dr + dg + db) / 3;
      d[i] = Math.min(255, dr * ELA_GAIN);
      d[i + 1] = Math.min(255, dg * ELA_GAIN);
      d[i + 2] = Math.min(255, db * ELA_GAIN);
      d[i + 3] = 255;
      const gx = Math.min(GRID - 1, Math.floor((x / w) * GRID));
      cells[gy][gx] += e;
      counts[gy][gx]++;
    }
  }
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) cells[y][x] = counts[y][x] ? cells[y][x] / counts[y][x] : 0;
  ctx2.putImageData(out, 0, 0);

  const flat = cells.flat();
  const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
  const std = Math.sqrt(flat.reduce((a, b) => a + (b - mean) ** 2, 0) / flat.length);
  return { elaImage: c2.toDataURL('image/jpeg', 0.7), cells, mean, std, width: w, height: h };
}

/**
 * Convert ELA cell statistics into regions + flags. Shared with the Cloud
 * Function implementation (same algorithm, server-side with sharp).
 * @returns {{ flags: import('../types.js').TamperFlag[], score: number, hotspots: number }}
 */
export function analyseElaCells({ cells, mean, std }, documentType) {
  const grid = cells.length;
  const flags = [];
  const zThreshold = 2.2;
  const hot = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const z = std > 0.001 ? (cells[y][x] - mean) / std : 0;
      if (z > zThreshold && cells[y][x] > 2.5) hot.push({ x, y, z, v: cells[y][x] });
    }
  }

  // Cluster adjacent hot cells into regions (simple flood fill)
  const seen = new Set();
  const key = (x, y) => `${x},${y}`;
  const hotMap = new Map(hot.map((c) => [key(c.x, c.y), c]));
  const regions = [];
  for (const c of hot) {
    if (seen.has(key(c.x, c.y))) continue;
    const stack = [c];
    const members = [];
    seen.add(key(c.x, c.y));
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(cur.x + dx, cur.y + dy);
        if (hotMap.has(k) && !seen.has(k)) { seen.add(k); stack.push(hotMap.get(k)); }
      }
    }
    const xs = members.map((m) => m.x), ys = members.map((m) => m.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    const maxZ = Math.max(...members.map((m) => m.z));
    regions.push({ x: x0 / grid, y: y0 / grid, w: (x1 - x0) / grid, h: (y1 - y0) / grid, cells: members.length, maxZ });
  }

  // Heuristic region → flag type mapping (photo is on the left third of most ID documents)
  for (const [i, r] of regions.entries()) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const inPhotoZone = cx < 0.36 && cy > 0.15 && cy < 0.85;
    const inMrzZone = cy > 0.78 && ['passport', 'visa', 'national_id'].includes(documentType);
    const severity = r.maxZ > 4 || r.cells >= 6 ? 'high' : r.maxZ > 3 ? 'medium' : 'low';
    let type = 'text_manipulation';
    let label = 'Inconsistent compression in text area';
    if (inPhotoZone && r.cells >= 2) { type = 'photo_replacement'; label = 'Possible photo replacement'; }
    else if (inMrzZone) { type = 'text_manipulation'; label = 'Possible MRZ / data-line edit'; }
    else if (r.cells <= 2 && r.maxZ > 3.5) { type = 'stamp_forgery'; label = 'Localised anomaly (stamp/seal area)'; }
    flags.push({
      id: `ela_${i}`,
      type,
      severity,
      label,
      detail: `ELA error level is ${r.maxZ.toFixed(1)}σ above the document average across ${r.cells} grid cell(s).`,
      region: { x: r.x, y: r.y, w: r.w, h: r.h },
      field: type === 'photo_replacement' ? 'photo' : inMrzZone ? 'mrz' : undefined,
    });
  }

  // Score: hotspot density + strength. 0 hot cells → ~0, a few strong ones → 40–70, many → 90+.
  const strength = hot.reduce((s, c) => s + Math.min(6, c.z - zThreshold + 1), 0);
  const score = Math.max(0, Math.min(100, Math.round(strength * 9 + regions.filter((r) => r.maxZ > 4).length * 10)));
  return { flags, score, hotspots: hot.length };
}
