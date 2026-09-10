/**
 * Server-side Error Level Analysis with sharp. Mirrors src/modules/tampering/ela.js
 * (same grid statistics and flag heuristics) so the cloud and local providers are
 * interchangeable. A trained forgery-detection model would replace `analyseImage`
 * here while keeping the same return shape.
 */
import sharp from 'sharp';

const ELA_QUALITY = 90;
const ELA_GAIN = 12;
const GRID = 10;
const MAX_SIDE = 1000;

export async function runEla(buffer) {
  const base = sharp(buffer).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
  const { data: orig, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const resavedJpeg = await base.clone().jpeg({ quality: ELA_QUALITY }).toBuffer();
  const { data: re } = await sharp(resavedJpeg).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  const diff = Buffer.alloc(w * h * 3);
  const cells = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  const counts = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  for (let y = 0; y < h; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y / h) * GRID));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const o = (y * w + x) * 3;
      const dr = Math.abs(orig[i] - re[i]);
      const dg = Math.abs(orig[i + 1] - re[i + 1]);
      const db = Math.abs(orig[i + 2] - re[i + 2]);
      diff[o] = Math.min(255, dr * ELA_GAIN);
      diff[o + 1] = Math.min(255, dg * ELA_GAIN);
      diff[o + 2] = Math.min(255, db * ELA_GAIN);
      const gx = Math.min(GRID - 1, Math.floor((x / w) * GRID));
      cells[gy][gx] += (dr + dg + db) / 3;
      counts[gy][gx]++;
    }
  }
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) cells[y][x] = counts[y][x] ? cells[y][x] / counts[y][x] : 0;
  const flat = cells.flat();
  const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
  const std = Math.sqrt(flat.reduce((a, b) => a + (b - mean) ** 2, 0) / flat.length);
  const elaJpeg = await sharp(diff, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
  return { elaImage: `data:image/jpeg;base64,${elaJpeg.toString('base64')}`, cells, mean, std, width: w, height: h };
}

export function analyseElaCells({ cells, mean, std }, documentType) {
  const grid = cells.length;
  const flags = [];
  const zThreshold = 2.2;
  const hot = [];
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const z = std > 0.001 ? (cells[y][x] - mean) / std : 0;
    if (z > zThreshold && cells[y][x] > 2.5) hot.push({ x, y, z });
  }
  const seen = new Set();
  const key = (x, y) => `${x},${y}`;
  const hotMap = new Map(hot.map((c) => [key(c.x, c.y), c]));
  const regions = [];
  for (const c of hot) {
    if (seen.has(key(c.x, c.y))) continue;
    const stack = [c], members = [];
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
    regions.push({ x: x0 / grid, y: y0 / grid, w: (x1 - x0) / grid, h: (y1 - y0) / grid, cells: members.length, maxZ: Math.max(...members.map((m) => m.z)) });
  }
  for (const [i, r] of regions.entries()) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const inPhotoZone = cx < 0.36 && cy > 0.15 && cy < 0.85;
    const inMrzZone = cy > 0.78 && ['passport', 'visa', 'national_id'].includes(documentType);
    const severity = r.maxZ > 4 || r.cells >= 6 ? 'high' : r.maxZ > 3 ? 'medium' : 'low';
    let type = 'text_manipulation', label = 'Inconsistent compression in text area';
    if (inPhotoZone && r.cells >= 2) { type = 'photo_replacement'; label = 'Possible photo replacement'; }
    else if (inMrzZone) { label = 'Possible MRZ / data-line edit'; }
    else if (r.cells <= 2 && r.maxZ > 3.5) { type = 'stamp_forgery'; label = 'Localised anomaly (stamp/seal area)'; }
    flags.push({ id: `ela_${i}`, type, severity, label, detail: `ELA error level is ${r.maxZ.toFixed(1)}σ above the document average across ${r.cells} grid cell(s).`, region: { x: r.x, y: r.y, w: r.w, h: r.h }, field: type === 'photo_replacement' ? 'photo' : inMrzZone ? 'mrz' : undefined });
  }
  const strength = hot.reduce((s, c) => s + Math.min(6, c.z - zThreshold + 1), 0);
  const score = Math.max(0, Math.min(100, Math.round(strength * 9 + regions.filter((r) => r.maxZ > 4).length * 10)));
  return { flags, score, hotspots: hot.length };
}

export function analyseMetadata(exif) {
  const flags = [];
  let score = 0;
  const summary = {};
  if (!exif) return { flags, score, summary: { note: 'No EXIF metadata present.' } };
  const software = exif.Software || exif.ProcessingSoftware || exif.CreatorTool || exif.HistorySoftwareAgent;
  const created = toDate(exif.DateTimeOriginal || exif.CreateDate);
  const modified = toDate(exif.ModifyDate);
  summary.software = software || null;
  summary.created = created?.toISOString() || null;
  summary.modified = modified?.toISOString() || null;
  summary.camera = [exif.Make, exif.Model].filter(Boolean).join(' ') || null;
  if (software && /photoshop|gimp|lightroom|affinity|pixelmator|paint\.net|canva|snapseed|picsart|photopea|inkscape|illustrator/i.test(String(software))) {
    flags.push({ id: 'meta_editor', type: 'metadata', severity: 'high', label: `Edited with ${software}`, detail: 'Image metadata records an image-editing application in the processing chain.' });
    score += 45;
  }
  if (created && modified && modified - created > 60000) {
    const mins = Math.round((modified - created) / 60000);
    flags.push({ id: 'meta_modified', type: 'metadata', severity: mins > 60 ? 'medium' : 'low', label: 'Modified after capture', detail: `ModifyDate is ${mins > 1440 ? Math.round(mins / 1440) + ' day(s)' : mins + ' min'} after DateTimeOriginal.` });
    score += mins > 60 ? 20 : 8;
  }
  if (exif.History || exif.HistoryAction) {
    flags.push({ id: 'meta_history', type: 'metadata', severity: 'medium', label: 'XMP edit history present', detail: 'The file carries an XMP history block describing prior edits.' });
    score += 20;
  }
  return { flags, score: Math.min(100, score), summary };
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
  return Number.isNaN(d.getTime()) ? null : d;
}
