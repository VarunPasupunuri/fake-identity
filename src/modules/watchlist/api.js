/**
 * Placeholder for an AUTHORISED external watchlist service.
 *
 * This provider is intentionally not implemented: the prototype has no access to
 * any government, police, immigration or Interpol database, and must never claim
 * to. When an authorised integration exists, implement `check()` here (typically
 * via a server-side function holding the credentials) returning the same
 * WatchlistResult shape, and select it with VITE_WATCHLIST_PROVIDER=api.
 * Until then it reports `unavailable`, which Evidence Fusion treats as zero-risk
 * unavailable evidence.
 */
export const PROVIDER_ID = 'api';

export async function check() {
  return { status: 'unavailable', provider: PROVIDER_ID, source: 'External watchlist API (not configured)', matches: [], confidence: null, explanation: 'Watchlist check unavailable — no authorised external watchlist service is configured for this deployment.', fieldsUsed: [], synthetic: false, durationMs: 0 };
}
