/**
 * Mock face provider — SYNTHETIC demonstration output.
 * The scenario descriptor decides the comparison outcome, including the case
 * where no face can be detected (reported as unavailable, never as a mismatch).
 */
import { sleep } from '../../lib/image.js';
import { scenarioProfile } from '../documents/scenarios.js';

const CASES = {
  match: { confidence: 91, distance: 0.31, documentFaceFound: true, liveFaceFound: true },
  mismatch: { confidence: 38, distance: 0.71, documentFaceFound: true, liveFaceFound: true },
  not_found: { confidence: 0, distance: null, documentFaceFound: false, liveFaceFound: true, note: 'No face could be detected on the document image.' },
  skip: { confidence: 0, distance: null, documentFaceFound: false, liveFaceFound: false, note: 'No face could be detected on either image.' },
};

/** @returns {Promise<import('../types.js').FaceResult>} */
export async function verify({ scenario = 'clean', onProgress }) {
  const t0 = performance.now();
  for (const [p, m] of [[0.2, 'Detecting face on document'], [0.5, 'Detecting live face'], [0.85, 'Comparing embeddings']]) { onProgress?.(p, m); await sleep(220); }
  const c = CASES[scenarioProfile(scenario).face] || CASES.match;
  const compared = c.documentFaceFound && c.liveFaceFound;
  return {
    confidence: c.confidence,
    match: compared && c.confidence >= 50,
    distance: c.distance,
    documentFaceFound: c.documentFaceFound,
    liveFaceFound: c.liveFaceFound,
    documentFaceBox: c.documentFaceFound ? { x: 0.08, y: 0.28, w: 0.2, h: 0.36 } : null,
    liveFaceBox: c.liveFaceFound ? { x: 0.3, y: 0.18, w: 0.4, h: 0.55 } : null,
    provider: 'mock',
    durationMs: Math.round(performance.now() - t0),
    ...(c.note ? { note: c.note } : {}),
  };
}
