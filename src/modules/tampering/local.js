/**
 * Local (in-browser) tampering provider: ELA on canvas + EXIF via exifr.
 */
import { runEla, analyseElaCells } from './ela.js';
import { analysePixels } from './analysis.js';
import { analyseMetadata } from './metadata.js';
import { getProfile } from '../documents/registry.js';
import { dataUrlToBlob } from '../../lib/image.js';

/** @returns {Promise<import('../types.js').TamperResult>} */
export async function analyse({ imageDataUrl, originalFile, documentType, onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.1, 'Reading metadata');
  let exif = null;
  try {
    const exifr = (await import('exifr')).default;
    exif = await exifr.parse(originalFile || dataUrlToBlob(imageDataUrl), { xmp: true, tiff: true, exif: true, ifd0: true }).catch(() => null);
  } catch { exif = null; }
  const meta = analyseMetadata(exif, { fileType: originalFile?.type });

  onProgress?.(0.35, 'Running error level analysis');
  const ela = await runEla(imageDataUrl);
  const elaRes = analyseElaCells(ela, documentType);

  // Noise, resampling, copy-move and geometry reuse the decode `runEla` already performed.
  onProgress?.(0.7, 'Analysing noise, resampling and duplicated regions');
  const profile = getProfile(documentType);
  const extra = analysePixels(ela.pixels, { expectedAspect: profile.aspect || null });
  onProgress?.(0.95, 'Compiling evidence');

  const imageScore = Math.min(100, elaRes.score + extra.flags.reduce((s, f) => s + (f.severity === 'medium' ? 10 : 4), 0));
  const score = Math.min(100, Math.round(Math.max(imageScore, meta.score) + Math.min(imageScore, meta.score) * 0.3));
  return {
    score,
    flags: [...elaRes.flags, ...extra.flags, ...meta.flags],
    evidence: { elaImage: ela.elaImage, metadata: meta.summary, stats: { hotspots: elaRes.hotspots, meanError: +ela.mean.toFixed(2), stdError: +ela.std.toFixed(2), grid: ela.cells.length, ...extra.stats } },
    provider: 'local-ela',
    durationMs: Math.round(performance.now() - t0),
  };
}
