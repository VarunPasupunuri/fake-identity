/**
 * Generalised field extraction over recognised text, driven by a document
 * profile. Works on any OCR provider's `rawText`; never invents values — a field
 * is only set when a labelled value (or, for generic documents, a recognisable
 * date / identifier / organisation token) is actually present in the text.
 *
 * @typedef {Object} ExtractionResult
 * @property {Object<string, *>} fields
 * @property {Object<string, number>} fieldConfidence
 * @property {Object<string, { label: string, snippet: string }>} fieldSources   where each value was read from
 * @property {string} provider
 */
import { FIELDS } from './fields.js';
import { parseDate, toIso3 } from '../ocr/parse.js';

const DATE_VALUE = '(\\d{1,2}[\\s/.-]+(?:\\d{1,2}|[A-Z]{3,9})[\\s/.-]+\\d{2,4}|\\d{4}[/.-]\\d{1,2}[/.-]\\d{1,2})';
const NAME_STOP = '(?:S/O|D/O|W/O|SON OF|DAUGHTER OF|WIFE OF|HAS |IS |WAS |BEARING|ROLL|REG|DOB|DATE|SEX|GENDER|BORN|AGED?|HOLDER|BEARER|EMPLOYEE|STUDENT|FATHER|MOTHER|NATIONALITY|OF THE|ADDRESS|RESIDENT|CERTIFICATE|PASSED|COMPLETED|STUDIED|WORKED|EMPLOYED|JOINED|NO\\b|\\d)';

const VALUE_RE = {
  name: `([A-Z][A-Z .'-]{1,60}?)\\s*(?=${NAME_STOP}|[\\n:|;]|$)`,
  date: DATE_VALUE,
  identifier: '([A-Z0-9][A-Z0-9/-]{3,23})',
  text: '([A-Z0-9][^\\n:|;]{1,80}?)\\s*(?=[\\n|;]|$)',
  number: '([0-9]{1,4}(?:\\.[0-9]{1,2})?)',
  code: '([A-Z]{3,20})',
  gender: '(M|F|X|MALE|FEMALE|TRANSGENDER)\\b',
  list: null,
};

const SEP = '\\s*[:.\\-–]?\\s*';

/** Bare nouns that also appear as the tail of a longer label ("father's name", "employee id"). */
const BARE_NOUN = /^(?:NAME|EMPLOYEE|STUDENT|CHILD|DECEASED|CANDIDATE|AMOUNT|TYPE|CLASS|CATEGORY|NUMBER|DATE|FROM|TO|TILL)$/;
const QUALIFIER = "(?:FATHER|MOTHER|GUARDIAN|HUSBAND|WIFE|SPOUSE|CHILD|STUDENT|EMPLOYEE|DECEASED|CANDIDATE|SURNAME|GIVEN|FIRST|LAST|FULL|BUSINESS|COMPANY|BANK|FILE|USER|NICK)(?:'S|S)?\\s{1,3}";
// A bare noun must not be the tail of a longer label, nor be followed by a sub-label such as "ID" / "No.".
const TAIL = '(?!\\s*(?:ID|NO\\.?|NUMBER|CODE)\\b)';

function labelRe(label, valueRe) {
  const bare = BARE_NOUN.test(label);
  const pre = bare ? `(?<!${QUALIFIER})` : '';
  const guard = /^NAME$/.test(label) ? '(?!\\s+OF\\b)' : '';
  return new RegExp(`(?<![A-Z])${pre}${label}${guard}${bare ? TAIL : ''}${SEP}${valueRe}`, 'i');
}

/** Find the first labelled value of a given kind. Returns { value, label, snippet } or null. */
export function grabLabelled(text, labels = [], kind = 'text') {
  const valueRe = VALUE_RE[kind];
  if (!valueRe) return null;
  for (const label of labels) {
    const m = text.match(labelRe(label, valueRe));
    if (m && m[1] && m[1].trim()) return { value: m[1].trim(), label: label.replace(/\\\.\?|\\|\(\?:|\)|\?/g, ''), snippet: m[0].slice(0, 80) };
  }
  return null;
}

const NAME_JUNK = /\b(GIVEN|NAMES?|SURNAME|SEX|NATIONALITY|DATE|OF|BIRTH|MR|MRS|MS|SHRI|SMT|KUM|MISS|MASTER)\b/g;
export function cleanName(s) {
  return String(s).replace(/^(?:MR|MRS|MS|SHRI|SMT|KUM|MISS|MASTER)\.?\s+/i, '').replace(NAME_JUNK, ' ').replace(/[^A-Z .'-]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function coerce(kind, raw) {
  switch (kind) {
    case 'date': return parseDate(raw);
    case 'name': { const v = cleanName(raw); return v.length >= 2 ? v : null; }
    case 'identifier': return raw.replace(/\s/g, '').toUpperCase();
    case 'code': return toIso3(raw);
    case 'gender': return raw[0].toUpperCase() === 'T' ? 'X' : raw[0].toUpperCase();
    case 'number': return Number(raw);
    default: return raw.replace(/\s+/g, ' ').trim();
  }
}

/* ------------------------------------------------------------------ */
/* Generic token extraction (dates, identifiers, organisations, title)  */
/* ------------------------------------------------------------------ */
const ORG_RE = /\b(?:GOVERNMENT OF [A-Z ]+|MINISTRY OF [A-Z ]+|DEPARTMENT OF [A-Z ]+|OFFICE OF (?:THE )?[A-Z ]+|[A-Z][A-Z .&]+ (?:UNIVERSITY|COLLEGE|INSTITUTE|SCHOOL|BOARD|BANK|MUNICIPAL(?:ITY| CORPORATION)?|CORPORATION|AUTHORITY|COMMISSION|HOSPITAL|PVT\.? LTD\.?|PRIVATE LIMITED|LIMITED|LTD\.?|LLP|INC\.?))\b/g;

export function extractDates(text) {
  const out = new Set();
  const re = new RegExp(DATE_VALUE, 'g');
  let m;
  while ((m = re.exec(text)) && out.size < 12) { const d = parseDate(m[1]); if (d) out.add(d); }
  return [...out];
}

export function extractIdentifiers(text) {
  const out = new Set();
  const re = /\b(?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{5,19}\b/g;
  let m;
  while ((m = re.exec(text)) && out.size < 12) {
    const tok = m[0];
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(tok) || /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(tok)) continue; // dates
    if (/^\d{4}[-/]\d{2,4}$/.test(tok)) continue; // academic year like 2024-25
    out.add(tok);
  }
  return [...out];
}

export function extractOrganizations(text) {
  const out = new Set();
  let m;
  const re = new RegExp(ORG_RE.source, 'g');
  while ((m = re.exec(text)) && out.size < 6) out.add(m[0].replace(/\s+/g, ' ').trim());
  return [...out];
}

export function extractTitle(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const titled = lines.find((l) => /\b(CERTIFICATE|MEMO(?:RANDUM)?|MARKSHEET|TRANSCRIPT|LETTER|LICEN[CS]E|PERMIT|PASSPORT|VISA|CARD|STATEMENT|INVOICE|RECEIPT|RECORD|EXTRACT|ACKNOWLEDGEMENT|ACKNOWLEDGMENT|NOTICE|ORDER|SLIP|FORM|DECLARATION)\b/.test(l) && l.length <= 80);
  return titled || lines.find((l) => /[A-Z]{3,}/.test(l) && !/\d/.test(l) && l.length <= 80) || null;
}

/* ------------------------------------------------------------------ */
/* Academic marks table                                                 */
/* ------------------------------------------------------------------ */
/**
 * Rows like "MATHEMATICS-I  70  100  A" or "DATA STRUCTURES 62/100 B+" → { name, marks, max, grade }.
 * A row must have a textual subject name and at least one numeric value.
 */
export function extractMarksTable(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || /\b(TOTAL|GRAND TOTAL|PERCENTAGE|CGPA|SGPA|RESULT|MAX(?:IMUM)? MARKS|SUBJECT|ROLL|NAME|DATE|SEMESTER|YEAR|COLLEGE|UNIVERSITY|INSTITUTE)\b/.test(line)) continue;
    const m = line.match(/^([A-Z][A-Z0-9 .&()'/-]{2,60}?)\s+(\d{1,3})(?:\s*\/\s*|\s+)(\d{2,3})(?:\s+([A-Z][+-]?|PASS|FAIL|ABSENT))?\s*$/) || line.match(/^([A-Z][A-Z0-9 .&()'/-]{2,60}?)\s+(\d{1,3})(?:\s+([A-Z][+-]?|PASS|FAIL|ABSENT))?\s*$/);
    if (!m) continue;
    if (m.length === 5) rows.push({ name: m[1].trim(), marks: Number(m[2]), max: Number(m[3]), grade: m[4] || null });
    else rows.push({ name: m[1].trim(), marks: Number(m[2]), max: null, grade: m[3] || null });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Profile-driven extraction                                            */
/* ------------------------------------------------------------------ */
/**
 * @param {string} rawText
 * @param {import('./profiles.js').DocumentProfile} profile
 * @param {{ baseConfidence?: number, seed?: Object }} [opts]   `seed` = fields already produced by a specialised parser (e.g. MRZ) — kept as-is
 * @returns {ExtractionResult}
 */
export function extractFields(rawText, profile, opts = {}) {
  const text = String(rawText || '').replace(/[ \t]+/g, ' ').toUpperCase();
  const base = typeof opts.baseConfidence === 'number' ? opts.baseConfidence : 0.8;
  const fields = { ...(opts.seed || {}) };
  const fieldConfidence = {};
  const fieldSources = {};
  const set = (key, value, source, conf = base) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return;
    if (fields[key] !== undefined && !(opts.seed && opts.seed[key] === undefined)) return; // seeded values win
    fields[key] = value; fieldConfidence[key] = Number(conf.toFixed(2)); if (source) fieldSources[key] = source;
  };

  for (const spec of profile.fields) {
    const def = FIELDS[spec.key];
    if (!def || fields[spec.key] !== undefined) continue;
    if (def.kind === 'list') continue; // handled below
    if (!def.labels?.length) continue;
    const hit = grabLabelled(text, def.labels, def.kind);
    if (!hit) continue;
    const value = coerce(def.kind, hit.value);
    if (value !== null && value !== undefined && !(typeof value === 'number' && Number.isNaN(value))) set(spec.key, value, { label: hit.label, snippet: hit.snippet });
  }

  // Marks table for academic documents
  if (profile.fields.some((f) => f.key === 'subjects')) {
    const rows = extractMarksTable(text);
    if (rows.length) {
      set('subjects', rows.map((r) => r.name), { label: 'table', snippet: `${rows.length} row(s)` });
      set('marks', rows.map((r) => ({ subject: r.name, marks: r.marks, max: r.max, grade: r.grade })), { label: 'table', snippet: `${rows.length} row(s)` });
    }
  }

  // Generic tokens (always computed for the generic profile; cheap and useful as context elsewhere)
  const generic = profile.category === 'generic';
  const orgs = extractOrganizations(text);
  if (generic) {
    set('title', extractTitle(text), { label: 'heading', snippet: '' }, base * 0.9);
    set('dates', extractDates(text), { label: 'scan', snippet: '' }, base * 0.8);
    set('identifiers', extractIdentifiers(text), { label: 'scan', snippet: '' }, base * 0.7);
    set('organizations', orgs, { label: 'scan', snippet: '' }, base * 0.8);
    if (!fields.issuer && orgs.length) set('issuer', orgs[0], { label: 'organisation', snippet: orgs[0] }, base * 0.7);
    if (!fields.dateOfIssue && fields.dates?.length === 1) set('dateOfIssue', fields.dates[0], { label: 'only date', snippet: fields.dates[0] }, base * 0.6);
    if (!fields.referenceNumber && fields.identifiers?.length === 1) set('referenceNumber', fields.identifiers[0], { label: 'only identifier', snippet: fields.identifiers[0] }, base * 0.6);
  } else {
    if (!fields.issuingAuthority && !fields.institution && !fields.university && !fields.organization && orgs.length) set(profile.category === 'academic' ? 'institution' : profile.category === 'employment' ? 'organization' : 'issuingAuthority', orgs[0], { label: 'organisation', snippet: orgs[0] }, base * 0.7);
  }

  // Cross-type conveniences so history / watchlist / search keep working for every document type.
  if (!fields.fullName && profile.subjectField && fields[profile.subjectField]) set('fullName', fields[profile.subjectField], { label: `subject (${profile.subjectField})`, snippet: '' }, fieldConfidence[profile.subjectField] ?? base);
  if (!fields.documentNumber && profile.primaryIdentifier && fields[profile.primaryIdentifier] && profile.primaryIdentifier !== 'visaNumber') set('documentNumber', fields[profile.primaryIdentifier], { label: `primary identifier (${profile.primaryIdentifier})`, snippet: '' }, fieldConfidence[profile.primaryIdentifier] ?? base);

  return { fields, fieldConfidence, fieldSources, provider: 'profile-extractor' };
}
