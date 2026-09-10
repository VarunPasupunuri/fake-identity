/**
 * SYNTHETIC DEMO WATCHLIST — TEST DATA ONLY.
 *
 * Every record here is invented for the SIH prototype. Names are obviously
 * artificial, document numbers use the reserved "ZZ" prefix, and nationalities
 * use ICAO's fictional codes (UTO = Utopia, XXX = unspecified). Nothing in this
 * file corresponds to a real person, a real document, or any real watchlist.
 *
 * This is NOT connected to Interpol, immigration, police, passport or any
 * government database. A production deployment replaces the `demo` provider
 * with an authorised API provider (see ./api.js) without touching the UI or
 * the fusion engine.
 */
export const DEMO_WATCHLIST_SOURCE = 'Synthetic demo watchlist (test data — not a government database)';

/**
 * @typedef {Object} WatchlistRecord
 * @property {string} recordId          synthetic identifier
 * @property {string} listType          lost_stolen | fraudulent_document | alert | duplicate_identity
 * @property {string} [documentNumber]  normalised (upper-case alphanumerics)
 * @property {string} [documentType]
 * @property {string} [fullName]        normalised upper-case
 * @property {string} [dateOfBirth]     ISO yyyy-mm-dd
 * @property {string} [nationality]     ISO-3 / ICAO code
 * @property {string} note              why the synthetic record exists
 */
export const DEMO_WATCHLIST = Object.freeze([
  { recordId: 'DEMO-WL-0001', listType: 'lost_stolen', documentNumber: 'ZZ0000001', documentType: 'passport', fullName: 'TEST SUBJECT ALPHA', dateOfBirth: '1990-01-01', nationality: 'UTO', note: 'Synthetic: passport reported lost' },
  { recordId: 'DEMO-WL-0002', listType: 'fraudulent_document', documentNumber: 'ZZ0000002', documentType: 'passport', fullName: 'TEST SUBJECT BRAVO', dateOfBirth: '1985-05-05', nationality: 'UTO', note: 'Synthetic: document number linked to a forged batch' },
  { recordId: 'DEMO-WL-0003', listType: 'alert', fullName: 'DEMO PERSON CHARLIE', dateOfBirth: '1978-12-24', nationality: 'XXX', note: 'Synthetic: name + DOB alert without a document number' },
  { recordId: 'DEMO-WL-0004', listType: 'alert', fullName: 'DEMO PERSON DELTA', note: 'Synthetic: name-only alert with no identifier, DOB or nationality (tests conservative name matching)' },
  { recordId: 'DEMO-WL-0005', listType: 'lost_stolen', documentNumber: 'ZZ0000005', documentType: 'national_id', nationality: 'UTO', note: 'Synthetic: identifier-only record (no name / DOB)' },
  { recordId: 'DEMO-WL-0006', listType: 'duplicate_identity', documentNumber: 'ZZ0000006', documentType: 'visa', fullName: 'TEST SUBJECT ECHO', dateOfBirth: '1992-07-15', nationality: 'XXX', note: 'Synthetic: visa number seen with two different identities' },
  { recordId: 'DEMO-WL-0007', listType: 'alert', documentNumber: 'ZZ0000007', documentType: 'passport', fullName: 'TEST SUBJECT FOXTROT', dateOfBirth: '2000-02-29', nationality: 'UTO', note: 'Synthetic: full record for exact-match demos' },
]);
