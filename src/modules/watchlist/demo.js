/**
 * Demo watchlist provider — deterministic, local, synthetic records only.
 * @param {{ fields: Object, documentType?: string, onProgress?: Function }} args
 * @returns {Promise<import('./index.js').WatchlistResult>}
 */
import { DEMO_WATCHLIST, DEMO_WATCHLIST_SOURCE } from './demoWatchlist.js';
import { subjectFromFields, screenSubject } from './match.js';

export const PROVIDER_ID = 'demo';

export async function check({ fields, documentType, onProgress, records = DEMO_WATCHLIST }) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  onProgress?.(0.3, 'Screening identifiers against demo watchlist');
  const subject = subjectFromFields(fields || {}, documentType);
  if (!subject.documentNumber && !subject.fullName) {
    return { status: 'unavailable', provider: PROVIDER_ID, source: DEMO_WATCHLIST_SOURCE, matches: [], confidence: null, explanation: 'Watchlist check not possible — no document number or name was extracted.', fieldsUsed: [], synthetic: true, durationMs: 0 };
  }
  const res = screenSubject(subject, records);
  onProgress?.(0.9, res.status === 'clear' ? 'No match' : 'Match candidate found');
  return { ...res, provider: PROVIDER_ID, source: DEMO_WATCHLIST_SOURCE, synthetic: true, durationMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) };
}
