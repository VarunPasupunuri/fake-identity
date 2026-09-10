/** Watchlist screening disabled by configuration → unavailable evidence. */
export const PROVIDER_ID = 'off';
export async function check() {
  return { status: 'unavailable', provider: PROVIDER_ID, source: 'Watchlist screening disabled', matches: [], confidence: null, explanation: 'Watchlist check unavailable — screening is disabled in this configuration.', fieldsUsed: [], synthetic: false, durationMs: 0 };
}
