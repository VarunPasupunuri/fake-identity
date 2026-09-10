import { sleep } from '../../lib/image.js';

/** @returns {Promise<import('../types.js').FaceResult>} */
export async function verify({ scenario = 'clean', onProgress }) {
  const t0 = performance.now();
  for (const [p, m] of [[0.2, 'Detecting face on document'], [0.5, 'Detecting live face'], [0.85, 'Comparing embeddings']]) { onProgress?.(p, m); await sleep(220); }
  const suspicious = scenario === 'suspicious';
  const confidence = suspicious ? 38 : 91;
  return {
    confidence,
    match: confidence >= 50,
    distance: suspicious ? 0.71 : 0.31,
    documentFaceFound: true,
    liveFaceFound: true,
    documentFaceBox: { x: 0.08, y: 0.28, w: 0.2, h: 0.36 },
    liveFaceBox: { x: 0.3, y: 0.18, w: 0.4, h: 0.55 },
    provider: 'mock',
    durationMs: Math.round(performance.now() - t0),
  };
}
