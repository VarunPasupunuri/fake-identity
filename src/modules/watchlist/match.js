/**
 * Conservative, deterministic watchlist matching. Pure functions — no I/O.
 *
 * Match ladder (strongest first):
 *   confirmed_match  document number equal AND at least one corroborating attribute agrees
 *                    (nationality, DOB or name) with nothing contradicting
 *   possible_match   document number equal but a corroborating attribute contradicts / none available;
 *                    or name ≥ NAME_STRONG AND DOB equal;
 *                    or name ≥ NAME_STRONG AND nationality equal (no DOB to compare);
 *                    or name ≥ NAME_EXACT alone (weak — flagged as name-only, low confidence)
 *   clear            nothing above the thresholds
 *
 * A name on its own can never produce a confirmed match.
 */

export const THRESHOLDS = Object.freeze({ NAME_STRONG: 0.85, NAME_EXACT: 0.92 });

export function normaliseDocNumber(v) { return v ? String(v).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''; }
export function normaliseName(v) { return v ? String(v).toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
export function normaliseCode(v) { return v ? String(v).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : ''; }
export function normaliseDate(v) { return v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : ''; }

/** Normalised Levenshtein similarity in 0..1. */
export function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  const prev = new Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let last = prev[0]; prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Name similarity that tolerates token order (SURNAME GIVEN vs GIVEN SURNAME). */
export function nameSimilarity(a, b) {
  const na = normaliseName(a), nb = normaliseName(b);
  if (!na || !nb) return 0;
  const direct = stringSimilarity(na, nb);
  const sorted = stringSimilarity(na.split(' ').sort().join(' '), nb.split(' ').sort().join(' '));
  return Math.max(direct, sorted);
}

/** Extract the identifiers the matcher can use from OCR fields. */
export function subjectFromFields(fields = {}, documentType) {
  return {
    documentNumber: normaliseDocNumber(fields.documentNumber || fields.visaNumber),
    fullName: normaliseName(fields.fullName || [fields.givenNames, fields.surname].filter(Boolean).join(' ')),
    dateOfBirth: normaliseDate(fields.dateOfBirth),
    nationality: normaliseCode(fields.nationality),
    documentType: documentType || null,
  };
}

/**
 * Compare one subject against one record.
 * @returns {null | { matchType, confidence, matchedFields, contradictions, explanation }}
 */
export function compareRecord(subject, record) {
  const rec = { documentNumber: normaliseDocNumber(record.documentNumber), fullName: normaliseName(record.fullName), dateOfBirth: normaliseDate(record.dateOfBirth), nationality: normaliseCode(record.nationality) };
  const matched = [], contradictions = [];
  const both = (k) => subject[k] && rec[k];
  const docEq = both('documentNumber') && subject.documentNumber === rec.documentNumber;
  const dobEq = both('dateOfBirth') && subject.dateOfBirth === rec.dateOfBirth;
  const natEq = both('nationality') && subject.nationality === rec.nationality;
  const nameSim = both('fullName') ? nameSimilarity(subject.fullName, rec.fullName) : 0;
  const nameStrong = nameSim >= THRESHOLDS.NAME_STRONG;

  if (docEq) matched.push('documentNumber');
  if (dobEq) matched.push('dateOfBirth');
  if (natEq) matched.push('nationality');
  if (nameStrong) matched.push('fullName');
  if (both('dateOfBirth') && !dobEq) contradictions.push('dateOfBirth');
  if (both('nationality') && !natEq) contradictions.push('nationality');
  if (both('fullName') && nameSim < 0.6) contradictions.push('fullName');

  if (docEq) {
    const corroborated = dobEq || natEq || nameStrong;
    if (corroborated && contradictions.length === 0) return { matchType: 'document_number', confidence: 0.95, matchedFields: matched, contradictions, explanation: `Document number ${subject.documentNumber} matches record ${record.recordId} and ${matched.filter((f) => f !== 'documentNumber').join(', ')} agree(s).` };
    if (!both('fullName') && !both('dateOfBirth') && !both('nationality')) return { matchType: 'document_number', confidence: 0.7, matchedFields: matched, contradictions, explanation: `Document number ${subject.documentNumber} matches record ${record.recordId}; the record holds no other attributes to corroborate.` };
    return { matchType: 'document_number', confidence: contradictions.length ? 0.45 : 0.6, matchedFields: matched, contradictions, explanation: `Document number ${subject.documentNumber} matches record ${record.recordId} but ${contradictions.length ? `${contradictions.join(', ')} differ(s)` : 'no other attribute could be corroborated'} — possible re-used or mistyped number.` };
  }
  if (nameStrong && dobEq && !contradictions.includes('nationality')) return { matchType: 'name_dob', confidence: 0.8, matchedFields: matched, contradictions, explanation: `Name (${Math.round(nameSim * 100)}% similar) and date of birth match record ${record.recordId}.` };
  if (nameStrong && natEq && !both('dateOfBirth')) return { matchType: 'name_nationality', confidence: 0.5, matchedFields: matched, contradictions, explanation: `Name (${Math.round(nameSim * 100)}% similar) and nationality match record ${record.recordId}; no date of birth available to corroborate.` };
  if (nameSim >= THRESHOLDS.NAME_EXACT && contradictions.length === 0) return { matchType: 'name_only', confidence: 0.3, matchedFields: matched, contradictions, explanation: `Name matches record ${record.recordId} (${Math.round(nameSim * 100)}% similar) but no identifier or date of birth corroborates it — name-only hits are weak and need officer review.` };
  return null;
}

/**
 * Screen a subject against a list of records.
 * @returns {{ status: 'clear'|'possible_match'|'confirmed_match', matches: Object[], confidence: number, explanation: string, fieldsUsed: string[] }}
 */
export function screenSubject(subject, records) {
  const fieldsUsed = ['documentNumber', 'fullName', 'dateOfBirth', 'nationality'].filter((k) => subject[k]);
  const matches = [];
  for (const record of records) {
    const m = compareRecord(subject, record);
    if (m) matches.push({ recordId: record.recordId, listType: record.listType, matchType: m.matchType, confidence: m.confidence, matchedFields: m.matchedFields, contradictions: m.contradictions, explanation: m.explanation, synthetic: true });
  }
  matches.sort((a, b) => b.confidence - a.confidence || a.recordId.localeCompare(b.recordId));
  const top = matches[0];
  let status = 'clear';
  if (top) status = top.matchType === 'document_number' && top.confidence >= 0.9 ? 'confirmed_match' : 'possible_match';
  const explanation = !top
    ? `No watchlist match on ${fieldsUsed.length ? fieldsUsed.join(', ') : 'the available identifiers'}.`
    : status === 'confirmed_match' ? top.explanation : `Possible watchlist match (${top.matchType.replace('_', ' ')}) — requires officer review. ${top.explanation}`;
  return { status, matches, confidence: top ? top.confidence : 1, explanation, fieldsUsed };
}
