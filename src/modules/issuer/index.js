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

/**
 * One honest line about issuer verification, for display.
 *
 * "Confirmed by an authorised issuer source" is a claim about the outside world
 * and is made ONLY when a non-synthetic issuer provider actually returned a
 * match. A synthetic demo register says so in its own words, and every other
 * state — absent, unavailable, not queried — reports that no authorised source
 * confirmed anything. A document-level assessment can never earn this sentence
 * on its own, so the decision must never be used to derive it.
 *
 * @param {IssuerResult|null|undefined} issuer
 * @returns {string}
 */
export function issuerStatusLabel(issuer) {
  if (!issuer) return 'Not verified with the issuing authority — no authorised source was consulted.';
  if (issuer.status === 'verified') {
    return issuer.synthetic
      ? 'Matched a synthetic demonstration register — not an authorised issuer source.'
      : 'Confirmed by an authorised issuer source.';
  }
  if (issuer.status === 'mismatch') {
    return `The record held by the source consulted disagrees with this document (${issuer.source}).`;
  }
  if (issuer.status === 'not_found') {
    return `No matching record at the source consulted (${issuer.source}). Absence is not evidence of forgery.`;
  }
  return 'Not verified with the issuing authority — no authorised external data source is connected.';
}
