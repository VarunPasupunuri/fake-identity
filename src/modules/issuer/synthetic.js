/**
 * SYNTHETIC issuer register — DEMO ONLY.
 * A handful of invented records matching the synthetic fixtures so the
 * "Verified against issuer record" state can be demonstrated end to end.
 * The result is always labelled synthetic; it is not a government or
 * institutional database and must never be enabled in production.
 */
import { sleep } from '../../lib/image.js';

export const PROVIDER_ID = 'synthetic';
export const SYNTHETIC_ISSUER_SOURCE = 'Synthetic demo issuer register (invented records — not a real issuer)';

/** @type {Array<{ documentType: string, identifier: string, name: string, fields: Object }>} */
export const SYNTHETIC_ISSUER_RECORDS = Object.freeze([
  { documentType: 'birth_certificate', identifier: 'BR-DEMO-2016-00417', name: 'AARAV DEMO KUMAR', fields: { dateOfBirth: '2016-05-20', placeOfBirth: 'SAMPLE CITY GENERAL HOSPITAL' } },
  { documentType: 'death_certificate', identifier: 'DR-DEMO-2024-01932', name: 'MOHAN DEMO VERMA', fields: { dateOfDeath: '2024-11-02' } },
  { documentType: 'marks_memo', identifier: '21DEMO0512', name: 'NEHA DEMO REDDY', fields: { totalMarks: 335 } },
  { documentType: 'degree_certificate', identifier: 'DEMO-DG-2023-01188', name: 'KARAN DEMO MEHTA', fields: { cgpa: 8.6 } },
  { documentType: 'employment_certificate', identifier: 'DEMO-EMP-2210', name: 'ROHAN DEMO IYER', fields: { designation: 'SOFTWARE ENGINEER' } },
  { documentType: 'passport', identifier: 'M8412345', name: 'ANITA SHARMA', fields: { dateOfBirth: '1988-04-12' } },
]);

const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normName = (v) => String(v || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** @returns {Promise<import('./index.js').IssuerResult>} */
export async function verify({ fields = {}, documentType, onProgress, records = SYNTHETIC_ISSUER_RECORDS }) {
  const t0 = performance.now();
  onProgress?.(0.4, 'Querying synthetic issuer register');
  await sleep(120);
  const ids = ['documentNumber', 'visaNumber', 'registrationNumber', 'certificateNumber', 'rollNumber', 'employeeId', 'epicNumber', 'referenceNumber'].map((k) => norm(fields[k])).filter(Boolean);
  const name = normName(fields.fullName);
  const done = (r) => ({ ...r, provider: PROVIDER_ID, source: SYNTHETIC_ISSUER_SOURCE, synthetic: true, durationMs: Math.round(performance.now() - t0) });
  if (!ids.length) return done({ status: 'unavailable', matchedFields: [], conflicts: [], explanation: 'No document identifier was extracted, so the synthetic issuer register could not be queried.' });
  const rec = records.find((r) => (!documentType || r.documentType === documentType) && ids.includes(norm(r.identifier)));
  if (!rec) return done({ status: 'not_found', matchedFields: [], conflicts: [], explanation: `No record with identifier ${ids[0]} exists in the synthetic issuer register. Absence from a demo register is not proof of forgery.` });
  const matched = ['identifier'];
  const conflicts = [];
  if (name && rec.name) (normName(rec.name) === name ? matched : conflicts).push('name');
  for (const [k, v] of Object.entries(rec.fields)) if (fields[k] !== undefined && fields[k] !== null) (norm(fields[k]) === norm(v) ? matched : conflicts).push(k);
  if (conflicts.length) return done({ status: 'mismatch', matchedFields: matched, conflicts, explanation: `The synthetic issuer record for ${rec.identifier} disagrees with the presented document on ${conflicts.join(', ')}.` });
  return done({ status: 'verified', matchedFields: matched, conflicts, explanation: `Record ${rec.identifier} found in the synthetic issuer register; ${matched.join(', ')} agree. (Demo register — not a real issuer.)` });
}
