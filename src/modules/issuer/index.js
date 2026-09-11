/**
 * Issuer verification — provider abstraction.
 *
 * Document-level analysis can never confirm that an issuer actually recorded a
 * document; only an authorised issuer source can. This module makes that an
 * explicit, swappable step:
 *
 *   unavailable   default — no authorised source is configured; reports `unavailable`
 *   synthetic     demo only — a clearly labelled synthetic issuer register with a handful
 *                 of fixture records so the VERIFIED state can be demonstrated
 *   external      placeholder for an authorised external issuer API (not configured
 *                 in this prototype → reports `unavailable`)
 *
 * No provider here simulates a government or university database.
 *
 * @typedef {Object} IssuerResult
 * @property {'verified'|'not_found'|'mismatch'|'unavailable'} status
 * @property {string} provider
 * @property {string} source            human-readable description of the source consulted
 * @property {boolean} synthetic
 * @property {string[]} matchedFields
 * @property {string[]} conflicts
 * @property {string} explanation
 * @property {number} durationMs
 */
import * as unavailable from './unavailable.js';
import * as synthetic from './synthetic.js';
import * as external from './external.js';

export const ISSUER_PROVIDERS = { unavailable, synthetic, external };

export const ISSUER_NOTICE = 'Identity Sentinel performs document-level screening using extracted information, structural validation, image forensics, and available verification sources. Official issuer verification requires an authorised external data source.';

/**
 * @param {{ provider?: string, fields: Object, documentType: string, onProgress?: Function }} args
 * @returns {Promise<IssuerResult>}
 */
export async function runIssuerVerification({ provider, ...args }) {
  const impl = ISSUER_PROVIDERS[provider] || ISSUER_PROVIDERS.unavailable;
  return impl.verify(args);
}
