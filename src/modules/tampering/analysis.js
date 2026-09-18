/**
 * Forensic analyses that run over the decoded image, turning the pure primitives
 * in forensics.js into TamperFlags. Shared by the browser provider and the tests.
 *
 * Every threshold here is deliberately conservative. A photograph of a document
 * is a hostile input: glare, folds, perspective, a protective laminate and a
 * printed background all produce local statistics that differ from their
 * surroundings. Flags raised here are treated as SUPPORTING evidence by the
 * authenticity engine, never as proof on their own.
 */
import { toGray, tile, outliers, clusterRegions, noiseResidual, resamplingIndicator, copyMove, aspectAnomaly } from './forensics.js';

const GRID = 10;
/** Noise / resampling need a clearly stronger outlier than ELA before they are worth reporting. */
const NOISE_Z = 2.8;
const RESAMPLE_Z = 2.8;
/** Fewer duplicated blocks than this is coincidence, not cloning. */
const MIN_COPY_MOVE_PAIRS = 3;
/**
 * A single outlier cell out of a 10x10 grid is what a 2.8σ threshold is *expected* to
 * produce on ordinary image noise — roughly one cell in four images. An edit large enough
 * to matter spans more than one cell, so an isolated cell is discarded rather than
 * reported. Without this the analysis raises a flag on perfectly clean images.
 */
const MIN_CLUSTER_CELLS = 2;

/**
 * @param {ImageData|{data:Uint8ClampedArray,width:number,height:number}} pixels
 * @param {{ documentType?: string, expectedAspect?: number|null }} [opts]
 * @returns {{ flags: import('../types.js').TamperFlag[], stats: Object }}
 */
export function analysePixels(pixels, { expectedAspect = null } = {}) {
  const { width, height } = pixels;
  const gray = toGray(pixels);
  const flags = [];

  // --- noise inconsistency: a region whose residual differs from the document's ---
  const noiseCells = tile(gray, width, height, GRID, noiseResidual);
  const noiseHigh = outliers(noiseCells, NOISE_Z);
  // Both directions matter: pasted content can be noisier OR smoother than its surroundings.
  const noiseLow = outliers(noiseCells.map((c) => ({ ...c, value: -c.value })), NOISE_Z);
  for (const [dir, res] of [['higher', noiseHigh], ['lower', noiseLow]]) {
    for (const r of clusterRegions(res.hot, GRID).filter((r) => r.cells >= MIN_CLUSTER_CELLS).slice(0, 2)) {
      flags.push({
        id: `noise_${dir}_${Math.round(r.x * 100)}_${Math.round(r.y * 100)}`,
        type: 'noise',
        severity: r.maxZ > 4 ? 'medium' : 'low',
        label: `Noise level ${dir} than the rest of the document`,
        detail: `Residual noise is ${r.maxZ.toFixed(1)}σ ${dir} than the document average across ${r.cells} cell(s).`,
        region: { x: r.x, y: r.y, w: r.w, h: r.h },
      });
    }
  }

  // --- resampling: soft, interpolated content among sharp content ---
  const resCells = tile(gray, width, height, GRID, resamplingIndicator);
  for (const r of clusterRegions(outliers(resCells, RESAMPLE_Z).hot, GRID).filter((r) => r.cells >= MIN_CLUSTER_CELLS).slice(0, 2)) {
    flags.push({
      id: `resample_${Math.round(r.x * 100)}_${Math.round(r.y * 100)}`,
      type: 'resampling',
      severity: r.maxZ > 4 ? 'medium' : 'low',
      label: 'Interpolation artefacts in one region',
      detail: `Edge transitions are ${r.maxZ.toFixed(1)}σ softer than elsewhere across ${r.cells} cell(s), consistent with content that was scaled or rotated.`,
      region: { x: r.x, y: r.y, w: r.w, h: r.h },
    });
  }

  // --- copy-move: the same content in two separated places ---
  const pairs = copyMove(gray, width, height);
  if (pairs.length >= MIN_COPY_MOVE_PAIRS) {
    const p = pairs[0];
    flags.push({
      id: 'copy_move',
      type: 'copy_move',
      severity: pairs.length >= 8 ? 'medium' : 'low',
      label: 'Duplicated regions',
      detail: `${pairs.length} block pair(s) are near-identical while being at least ${p.distance}px apart.`,
      region: { x: p.b.x / width, y: p.b.y / height, w: p.block / width, h: p.block / height },
    });
  }

  // --- geometry ---
  const aspect = aspectAnomaly(width, height, expectedAspect);
  if (aspect?.anomalous) {
    flags.push({
      id: 'aspect',
      type: 'dimensions',
      severity: 'low',
      label: 'Image proportions differ from the physical document',
      detail: `Aspect ratio ${aspect.actual} against an expected ${aspect.expected.toFixed(2)} for this document type. Perspective and cropping change this innocently.`,
    });
  }

  return {
    flags,
    stats: {
      noiseMean: +noiseHigh.mean.toFixed(2), noiseStd: +noiseHigh.std.toFixed(2),
      copyMovePairs: pairs.length,
      aspect: aspect || null,
      grid: GRID,
    },
  };
}
