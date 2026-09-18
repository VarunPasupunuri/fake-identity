/**
 * IMAGE FORENSICS — pure analysis primitives.
 *
 * Every function here takes raw pixels ({ data, width, height }, the shape of a
 * canvas ImageData) and returns numbers. No canvas, no DOM, no I/O — so the
 * browser provider and the unit tests run exactly the same code.
 *
 * These are CLASSICAL forensic heuristics, not a trained model: block-level
 * statistics over compression error, noise residuals, edge sharpness and
 * duplicated blocks. They detect *inconsistency within one image* — a region
 * that does not match the rest of the document. They cannot prove a document is
 * genuine, and each one alone is weak evidence; the authenticity engine only
 * treats them as meaningful when independent signals agree (see
 * modules/authenticity/).
 *
 * Known blind spots are documented per function so nothing here is oversold.
 */

/** Luma of an RGBA buffer, as a Float32Array of length width*height. */
export function toGray({ data, width, height }) {
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; p < g.length; i += 4, p += 1) g[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return g;
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const stddev = (a, m = mean(a)) => (a.length ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) : 0);

/** Per-cell statistic over a GRID x GRID tiling, as a flat array of { x, y, value }. */
export function tile(gray, width, height, grid, fn) {
  const out = [];
  const cw = Math.max(1, Math.floor(width / grid));
  const ch = Math.max(1, Math.floor(height / grid));
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x0 = gx * cw, y0 = gy * ch;
      const x1 = gx === grid - 1 ? width : x0 + cw;
      const y1 = gy === grid - 1 ? height : y0 + ch;
      out.push({ x: gx, y: gy, value: fn(gray, width, x0, y0, x1, y1) });
    }
  }
  return out;
}

/** Cells whose value is `z` standard deviations above the document's own average. */
export function outliers(cells, z = 2.2) {
  const values = cells.map((c) => c.value);
  const m = mean(values);
  const s = stddev(values, m);
  if (s < 1e-6) return { hot: [], mean: m, std: s };
  const hot = cells
    .map((c) => ({ ...c, z: (c.value - m) / s }))
    .filter((c) => c.z >= z)
    .sort((a, b) => b.z - a.z);
  return { hot, mean: m, std: s };
}

/* ------------------------------------------------------------------ */
/* Noise inconsistency                                                  */
/* ------------------------------------------------------------------ */
/**
 * Sensor noise is uniform across an unedited photograph. A region pasted from
 * another source, or smoothed after editing, carries a different residual.
 *
 * Residual = pixel minus the mean of its 4-neighbourhood (a cheap high-pass).
 * The per-cell statistic is the standard deviation of that residual.
 *
 * Blind spot: texture is also noise. A dense stamp or a patterned background
 * raises the residual legitimately, which is why this is never decisive alone.
 */
export function noiseResidual(gray, width, x0, y0, x1, y1) {
  const res = [];
  for (let y = Math.max(1, y0); y < Math.min(y1, Math.floor(gray.length / width) - 1); y += 1) {
    for (let x = Math.max(1, x0); x < Math.min(x1, width - 1); x += 1) {
      const i = y * width + x;
      const nb = (gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width]) / 4;
      res.push(gray[i] - nb);
    }
  }
  return stddev(res);
}

/* ------------------------------------------------------------------ */
/* Resampling / interpolation                                           */
/* ------------------------------------------------------------------ */
/**
 * Scaling or rotating a pasted fragment interpolates it, which softens edge
 * transitions relative to natively-captured detail. The statistic is the ratio
 * of second-derivative energy to first-derivative energy: interpolated content
 * has proportionally less curvature at its edges.
 *
 * Blind spot: out-of-focus areas of a genuine photograph look the same. Only a
 * cell that is soft while the document around it is sharp means anything.
 */
export function resamplingIndicator(gray, width, x0, y0, x1, y1) {
  let d1 = 0; let d2 = 0; let n = 0;
  const rows = Math.floor(gray.length / width);
  for (let y = Math.max(1, y0); y < Math.min(y1, rows - 1); y += 1) {
    for (let x = Math.max(1, x0); x < Math.min(x1, width - 1); x += 1) {
      const i = y * width + x;
      const gx = gray[i + 1] - gray[i - 1];
      const lx = gray[i + 1] - 2 * gray[i] + gray[i - 1];
      d1 += Math.abs(gx); d2 += Math.abs(lx); n += 1;
    }
  }
  if (!n || d1 < 1e-6) return 0;
  // High when edges are soft relative to their gradient — i.e. interpolated.
  return 1 - Math.min(1, (d2 / d1));
}

/* ------------------------------------------------------------------ */
/* Copy-move (duplicated regions)                                       */
/* ------------------------------------------------------------------ */
/**
 * A region copied from elsewhere in the SAME image — the usual way a stamp is
 * duplicated or a character is cloned over another.
 *
 * Each block is reduced to a coarse signature (mean-normalised, quantised) and
 * blocks sharing a signature are paired. Pairs closer together than
 * `minDistance` are ignored: adjacent blocks of flat background are identical
 * by nature and say nothing.
 *
 * Blind spot: flat or near-uniform blocks are excluded entirely (they match
 * everything), so a duplication inside a blank area is invisible to this.
 */
export function copyMove(gray, width, height, { block = 16, minDistance = 48, minVariance = 24 } = {}) {
  const sigs = new Map();
  const pairs = [];
  for (let y = 0; y + block <= height; y += block / 2) {
    for (let x = 0; x + block <= width; x += block / 2) {
      const px = [];
      for (let by = 0; by < block; by += 2) for (let bx = 0; bx < block; bx += 2) px.push(gray[(y + by) * width + (x + bx)]);
      const m = mean(px);
      const sd = stddev(px, m);
      if (sd < minVariance) continue;                     // featureless: skip
      const sig = px.map((v) => Math.round((v - m) / sd)).join(',');
      const seen = sigs.get(sig);
      if (seen) {
        const dist = Math.hypot(seen.x - x, seen.y - y);
        if (dist >= minDistance) pairs.push({ a: { x: seen.x, y: seen.y }, b: { x, y }, distance: Math.round(dist), block });
      } else {
        sigs.set(sig, { x, y });
      }
    }
  }
  return pairs;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                             */
/* ------------------------------------------------------------------ */
/**
 * Aspect-ratio check against the physical document, when the profile declares
 * one. A crop or a composite often does not preserve it.
 *
 * This is a WEAK signal by design: a photograph taken at an angle, or a
 * deliberate crop to the data page, changes the ratio innocently.
 */
export function aspectAnomaly(width, height, expectedAspect, tolerance = 0.25) {
  if (!expectedAspect || !width || !height) return null;
  const actual = width / height;
  const ratio = actual / expectedAspect;
  const off = Math.abs(Math.log(ratio));
  return { actual: +actual.toFixed(3), expected: expectedAspect, deviation: +off.toFixed(3), anomalous: off > Math.log(1 + tolerance) };
}

/**
 * Cluster hot cells into rectangular regions (4-neighbour flood fill),
 * expressed in fractions of the image so they can be drawn at any size.
 */
export function clusterRegions(hot, grid) {
  const key = (x, y) => `${x},${y}`;
  const map = new Map(hot.map((c) => [key(c.x, c.y), c]));
  const seen = new Set();
  const regions = [];
  for (const c of hot) {
    if (seen.has(key(c.x, c.y))) continue;
    const stack = [c]; const members = [];
    seen.add(key(c.x, c.y));
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(cur.x + dx, cur.y + dy);
        if (map.has(k) && !seen.has(k)) { seen.add(k); stack.push(map.get(k)); }
      }
    }
    const xs = members.map((m) => m.x); const ys = members.map((m) => m.y);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs) + 1;
    const y0 = Math.min(...ys); const y1 = Math.max(...ys) + 1;
    regions.push({
      x: x0 / grid, y: y0 / grid, w: (x1 - x0) / grid, h: (y1 - y0) / grid,
      cells: members.length, maxZ: +Math.max(...members.map((m) => m.z)).toFixed(2),
    });
  }
  return regions.sort((a, b) => b.maxZ - a.maxZ);
}

export const stats = { mean, stddev };
