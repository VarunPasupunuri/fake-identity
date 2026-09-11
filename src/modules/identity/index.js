/**
 * Historical identity correlation.
 *
 * Compares the identity extracted from the current document with the screening
 * history this officer (or admin) can see. It never declares "same person";
 * it reports potential correlations with a strength band and the fields that
 * agree or contradict, for officer review. Pure — the caller supplies the rows.
 *
 * @typedef {Object} IdentityLink
 * @property {string} screeningId
 * @property {'strong'|'moderate'|'weak'} strength
 * @property {'repeat_document'|'same_identity'|'conflicting_identity'|'name_match'} kind
 * @property {string[]} matchedFields
 * @property {string[]} conflicts
 * @property {string} explanation
 * @property {string|null} createdAt
 * @property {string|null} documentType
 * @property {string|null} decision
 *
 * @typedef {Object} IdentityResult
 * @property {'ok'|'unavailable'} status
 * @property {IdentityLink[]} links
 * @property {string} explanation
 * @property {string[]} fieldsUsed
 * @property {number} recordsCompared
 */
import { nameSimilarity, normaliseDocNumber, normaliseName, normaliseDate, normaliseCode } from '../watchlist/match.js';

const NAME_STRONG = 0.88;

function subject(fields = {}) {
  return {
    documentNumber: normaliseDocNumber(fields.documentNumber || fields.visaNumber || fields.registrationNumber || fields.certificateNumber || fields.rollNumber || fields.epicNumber),
    fullName: normaliseName(fields.fullName || [fields.givenNames, fields.surname].filter(Boolean).join(' ')),
    dateOfBirth: normaliseDate(fields.dateOfBirth),
    nationality: normaliseCode(fields.nationality),
  };
}

function subjectFromRow(row) {
  return {
    documentNumber: normaliseDocNumber(row.documentNumber || row.ocr?.fields?.documentNumber || row.ocr?.fields?.visaNumber),
    fullName: normaliseName(row.subjectName || row.ocr?.fields?.fullName),
    dateOfBirth: normaliseDate(row.ocr?.fields?.dateOfBirth),
    nationality: normaliseCode(row.nationality || row.ocr?.fields?.nationality),
  };
}

/**
 * @param {{ fields: Object, documentType?: string, history?: Object[], excludeId?: string|null, maxLinks?: number }} args
 * @returns {IdentityResult}
 */
export function correlateIdentity({ fields, documentType, history = [], excludeId = null, maxLinks = 5 } = {}) {
  const me = subject(fields);
  const fieldsUsed = Object.entries(me).filter(([, v]) => v).map(([k]) => k);
  if (!me.documentNumber && !me.fullName) return { status: 'unavailable', links: [], explanation: 'Identity correlation not possible — no name or document identifier was extracted.', fieldsUsed, recordsCompared: 0 };
  if (!Array.isArray(history) || !history.length) return { status: 'ok', links: [], explanation: 'No prior screening records were available for comparison.', fieldsUsed, recordsCompared: 0 };

  const links = [];
  let compared = 0;
  for (const row of history) {
    if (!row || row.id === excludeId) continue;
    const other = subjectFromRow(row);
    if (!other.documentNumber && !other.fullName) continue;
    compared += 1;
    const matched = [];
    const conflicts = [];
    const sameDoc = me.documentNumber && other.documentNumber && me.documentNumber === other.documentNumber;
    const nameSim = me.fullName && other.fullName ? nameSimilarity(me.fullName, other.fullName) : 0;
    const sameName = nameSim >= NAME_STRONG;
    if (sameDoc) matched.push('documentNumber');
    if (sameName) matched.push('fullName');
    if (me.dateOfBirth && other.dateOfBirth) (me.dateOfBirth === other.dateOfBirth ? matched : conflicts).push('dateOfBirth');
    if (me.nationality && other.nationality) (me.nationality === other.nationality ? matched : conflicts).push('nationality');
    if (me.fullName && other.fullName && !sameName && sameDoc) conflicts.push('fullName');

    let kind = null, strength = null;
    if (sameDoc && conflicts.length) { kind = 'conflicting_identity'; strength = 'strong'; }
    else if (sameDoc) { kind = 'repeat_document'; strength = 'moderate'; }
    else if (sameName && matched.includes('dateOfBirth') && !conflicts.length) { kind = 'same_identity'; strength = row.documentType && documentType && row.documentType !== documentType ? 'moderate' : 'moderate'; }
    else if (sameName && conflicts.length) { kind = 'conflicting_identity'; strength = 'moderate'; }
    else if (sameName && !me.dateOfBirth && !other.dateOfBirth) { kind = 'name_match'; strength = 'weak'; }
    if (!kind) continue;

    const when = row.createdAt ? String(row.createdAt).slice(0, 10) : 'an earlier date';
    const explanation = kind === 'conflicting_identity'
      ? `The same ${sameDoc ? 'document number' : 'name'} was screened on ${when} with different ${conflicts.map(labelOf).join(' and ')} — the records contradict each other.`
      : kind === 'repeat_document' ? `This document number was screened before on ${when}${row.decision ? ` (officer decision: ${row.decision})` : ''}.`
        : kind === 'same_identity' ? `Name and date of birth match a record screened on ${when}${row.documentType && row.documentType !== documentType ? ` presenting a different document type (${row.documentType})` : ''}.`
          : `Name resembles a record screened on ${when}; no date of birth was available to confirm or rule it out.`;
    links.push({ screeningId: row.id, strength, kind, matchedFields: matched, conflicts, explanation, createdAt: row.createdAt || null, documentType: row.documentType || null, decision: row.decision || null });
  }
  const order = { strong: 0, moderate: 1, weak: 2 };
  links.sort((a, b) => order[a.strength] - order[b.strength] || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const top = links.slice(0, maxLinks);
  return {
    status: 'ok',
    links: top,
    explanation: top.length ? `${top.length} potential identity correlation(s) with prior screenings — requires officer review.` : `No potential identity correlations among ${compared} prior screening record(s).`,
    fieldsUsed,
    recordsCompared: compared,
  };
}

function labelOf(k) { return { dateOfBirth: 'date of birth', nationality: 'nationality', fullName: 'name', documentNumber: 'document number' }[k] || k; }
