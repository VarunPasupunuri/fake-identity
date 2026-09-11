/**
 * Placeholder for an authorised external issuer-verification service.
 * Wire the real endpoint here (e.g. through a Cloud Function that holds the
 * credentials) and return the IssuerResult contract. Until then it reports
 * `unavailable` — it never fabricates a verification.
 */
export const PROVIDER_ID = 'external';

/** @returns {Promise<import('./index.js').IssuerResult>} */
export async function verify() {
  return { status: 'unavailable', provider: PROVIDER_ID, source: 'Authorised external issuer service (not configured)', synthetic: false, matchedFields: [], conflicts: [], explanation: 'The authorised external issuer service is not configured in this deployment; issuer verification was not performed.', durationMs: 0 };
}
