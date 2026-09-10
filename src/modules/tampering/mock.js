import { sleep } from '../../lib/image.js';

/** @returns {Promise<import('../types.js').TamperResult>} */
export async function analyse({ scenario = 'clean', onProgress }) {
  const t0 = performance.now();
  for (const [p, m] of [[0.2, 'Reading metadata'], [0.5, 'Running error level analysis'], [0.9, 'Compiling evidence']]) { onProgress?.(p, m); await sleep(250); }
  const suspicious = scenario === 'suspicious';
  return {
    score: suspicious ? 72 : 8,
    flags: suspicious
      ? [
          { id: 'ela_0', type: 'photo_replacement', severity: 'high', label: 'Possible photo replacement', detail: 'ELA error level is 4.6σ above the document average across 6 grid cell(s).', region: { x: 0.06, y: 0.25, w: 0.24, h: 0.42 }, field: 'photo' },
          { id: 'ela_1', type: 'text_manipulation', severity: 'medium', label: 'Inconsistent compression in text area', detail: 'ELA error level is 3.1σ above the document average across 2 grid cell(s).', region: { x: 0.5, y: 0.55, w: 0.2, h: 0.1 }, field: 'expiryDate' },
          { id: 'meta_editor', type: 'metadata', severity: 'high', label: 'Edited with Adobe Photoshop 25.0', detail: 'Image metadata records an image-editing application in the processing chain.' },
        ]
      : [],
    evidence: { metadata: suspicious ? { software: 'Adobe Photoshop 25.0', created: '2026-01-04T09:12:00.000Z', modified: '2026-01-06T17:40:00.000Z' } : { note: 'No EXIF metadata present.' }, stats: { hotspots: suspicious ? 9 : 0, meanError: 1.8, stdError: 0.6, grid: 10 } },
    provider: 'mock',
    durationMs: Math.round(performance.now() - t0),
  };
}
