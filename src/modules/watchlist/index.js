/**
 * Watchlist / blacklist screening — provider abstraction.
 *
 *   demo  deterministic local provider over clearly synthetic records (prototype default)
 *   api   placeholder for an authorised external service (returns `unavailable` until implemented)
 *   off   screening disabled (returns `unavailable`)
 *
 * @typedef {Object} WatchlistMatch
 * @property {string} recordId        identifier of the watchlist record (synthetic for the demo provider)
 * @property {string} listType        lost_stolen | fraudulent_document | alert | duplicate_identity | …
 * @property {'document_number'|'name_dob'|'name_nationality'|'name_only'} matchType
 * @property {number} confidence      0..1 strength of this candidate
 * @property {string[]} matchedFields
 * @property {string[]} contradictions
 * @property {string} explanation
 * @property {boolean} synthetic
 *
 * @typedef {Object} WatchlistResult
 * @property {'clear'|'possible_match'|'confirmed_match'|'unavailable'} status
 * @property {string} provider
 * @property {string} source          human-readable description of the list consulted
 * @property {WatchlistMatch[]} matches
 * @property {number|null} confidence top-candidate confidence (1 when clear, null when unavailable)
 * @property {string} explanation
 * @property {string[]} fieldsUsed    identifiers that were available for matching
 * @property {boolean} synthetic      true when the consulted list is demo data
 * @property {number} durationMs
 */
import * as demo from './demo.js';
import * as api from './api.js';
import * as off from './off.js';

export const WATCHLIST_PROVIDERS = { demo, api, off };

/**
 * Run the configured watchlist provider. Never throws for a missing provider —
 * an unknown provider id falls back to `off` (unavailable).
 * @param {{ provider?: string, fields: Object, documentType?: string, onProgress?: Function }} args
 * @returns {Promise<WatchlistResult>}
 */
export async function runWatchlistCheck({ provider, ...args }) {
  const impl = WATCHLIST_PROVIDERS[provider] || WATCHLIST_PROVIDERS.off;
  return impl.check(args);
}

export { subjectFromFields, screenSubject, compareRecord, nameSimilarity, THRESHOLDS } from './match.js';
export { DEMO_WATCHLIST, DEMO_WATCHLIST_SOURCE } from './demoWatchlist.js';
