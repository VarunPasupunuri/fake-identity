/**
 * Mock tampering provider — SYNTHETIC demonstration output.
 * The scenario descriptor decides which forensic signals appear, so the flags
 * line up with the OCR and face mocks for the same case.
 */
import { sleep } from '../../lib/image.js';
import { scenarioProfile } from '../documents/scenarios.js';

const EDITOR_FLAG = { id: 'meta_editor', type: 'metadata', severity: 'high', label: 'Edited with Adobe Photoshop 25.0', detail: 'Image metadata records an image-editing application in the processing chain.' };
const PHOTO_FLAG = { id: 'ela_0', type: 'photo_replacement', severity: 'high', label: 'Possible photo replacement', detail: 'ELA error level is 4.6σ above the document average across 6 grid cell(s).', region: { x: 0.06, y: 0.25, w: 0.24, h: 0.42 }, field: 'photo' };
const DOB_FLAG = { id: 'ela_dob', type: 'text_manipulation', severity: 'medium', label: 'Localized anomaly in the date of birth area', detail: 'ELA error level is 3.4σ above the document average across 2 grid cell(s) covering the printed date of birth.', region: { x: 0.34, y: 0.52, w: 0.22, h: 0.07 }, field: 'dateOfBirth' };
const EXPIRY_FLAG = { id: 'ela_1', type: 'text_manipulation', severity: 'medium', label: 'Inconsistent compression in text area', detail: 'ELA error level is 3.1σ above the document average across 2 grid cell(s).', region: { x: 0.5, y: 0.55, w: 0.2, h: 0.1 }, field: 'expiryDate' };

const CASES = {
  clean: { score: 8, flags: [] },
  dob_region: { score: 44, flags: [DOB_FLAG] },
  photo_region: { score: 61, flags: [PHOTO_FLAG] },
  full: { score: 72, flags: [PHOTO_FLAG, EXPIRY_FLAG, EDITOR_FLAG] },
};

/** @returns {Promise<import('../types.js').TamperResult>} */
export async function analyse({ scenario = 'clean', onProgress }) {
  const t0 = performance.now();
  for (const [p, m] of [[0.2, 'Reading metadata'], [0.5, 'Running error level analysis'], [0.9, 'Compiling evidence']]) { onProgress?.(p, m); await sleep(250); }
  const key = scenarioProfile(scenario).tampering;
  const c = CASES[key] || CASES.clean;
  const edited = c.flags.some((f) => f.type === 'metadata');
  return {
    score: c.score,
    flags: c.flags,
    evidence: {
      metadata: edited ? { software: 'Adobe Photoshop 25.0', created: '2026-01-04T09:12:00.000Z', modified: '2026-01-06T17:40:00.000Z' } : { note: 'No EXIF metadata present.' },
      stats: { hotspots: c.flags.filter((f) => f.region).length * 3, meanError: 1.8, stdError: 0.6, grid: 10 },
    },
    provider: 'mock',
    durationMs: Math.round(performance.now() - t0),
  };
}
