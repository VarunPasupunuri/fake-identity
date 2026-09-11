export const PROVIDER_ID = 'unavailable';

/** @returns {Promise<import('./index.js').IssuerResult>} */
export async function verify() {
  return { status: 'unavailable', provider: PROVIDER_ID, source: 'No authorised issuer source configured', synthetic: false, matchedFields: [], conflicts: [], explanation: 'Official issuer verification was not performed — no authorised external data source is configured.', durationMs: 0 };
}
