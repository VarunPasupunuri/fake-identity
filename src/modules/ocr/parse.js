/**
 * Turns raw OCR text into structured fields. Shared by every OCR provider
 * (Tesseract in-browser, Cloud Vision via Cloud Function, mock) so that swapping
 * the text engine never changes the field extraction behaviour.
 */
import { extractMrzLines, parseMrz, isValidIsoDate } from '../validation/mrz.js';

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/** Parse many human date formats into ISO yyyy-mm-dd. */
export function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim().toUpperCase();
  let m;
  if ((m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})/))) return iso(m[3], m[2], m[1]);
  if ((m = s.match(/(\d{1,2})\s*[-/.\s]?\s*([A-Z]{3})[A-Z]*\s*[-/.\s]?\s*(\d{4})/))) return MONTHS[m[2]] ? iso(m[3], MONTHS[m[2]], m[1]) : null;
  if ((m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/))) {
    const yy = Number(m[3]);
    return iso(String(yy < 50 ? 2000 + yy : 1900 + yy), m[2], m[1]);
  }
  return null;
}

function iso(y, m, d) {
  const out = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidIsoDate(out) ? out : null;
}

const DATE_RE = '(\\d{1,2}[\\s/.-]+(?:\\d{1,2}|[A-Za-z]{3,9})[\\s/.-]+\\d{2,4}|\\d{4}[/.-]\\d{1,2}[/.-]\\d{1,2})';

/**
 * How far below a label its value may sit, in lines.
 *
 * Text values get a short reach. A candidate found further away is more likely
 * to belong to another field than to this one, and a wrong value is worse than
 * no value: it is compared against the machine readable zone, so a misread turns
 * into an accusation against a genuine document.
 *
 * Dates get a long one. Some captures come out fully stacked — every label, then
 * every value — and a date pattern is specific enough that a match several lines
 * down is still the date belonging to the only date label above it.
 */
const TEXT_LOOKAHEAD = 2;
const DATE_LOOKAHEAD = 8;

/** Words that only ever appear in a label, never in a holder's details. */
const LABEL_WORDS = /\b(?:SURNAME|FAMILY NAME|LAST NAME|GIVEN NAMES?|FIRST NAMES?|FORENAMES?|NATIONALITY|CITIZENSHIP|DATE OF BIRTH|BIRTH DATE|PLACE OF BIRTH|DATE OF ISSUE|DATE OF EXPIRY|EXPIRY DATE|VALID FROM|VALID UNTIL|VALID TILL|DURATION OF STAY|ISSUING|AUTHORITY|PASSPORT NO|DOCUMENT NO|VISA NO|COUNTRY CODE|SEX|GENDER|TYPE|ENTRIES)\b/i;

/** A row of headings carries no values, so it is never read as one. */
const isLabelLine = (line) => LABEL_WORDS.test(line);

/** Every match of `valueRe` in one line, with the column it starts at. */
function candidates(line, valueRe) {
  const re = new RegExp(valueRe, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    out.push({ text: (m[1] !== undefined ? m[1] : m[0]).trim(), at: m.index });
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

/**
 * Find the value belonging to a label.
 *
 * Identity documents are not printed as "label: value" pairs. A passport bio page
 * prints a ROW OF LABELS above a ROW OF VALUES, several columns wide, and each
 * label usually carries a translation after a slash:
 *
 *     Nationality/ Nationalite   Sex/ Sexe   Date of Birth/ Date de naissance
 *     INDIAN                     F           05/11/2006
 *
 * So the value is looked for in two places. First on the label's own line, for
 * documents that do print inline. A candidate separated from the label by a "/"
 * is skipped there: it belongs to the label's translation, not to the holder —
 * that is what turns "Nationality/ Nationalite" into a nationality of NATIONALITE.
 *
 * Failing that, the following lines are read as columns, and the value is the
 * candidate starting nearest the label's own column. Column position is what
 * keeps the date under "Date of Expiry" from being read as the date of issue
 * printed to its left.
 */
function grab(text, labels, valueRe = '([A-Z0-9][A-Z0-9 \\-/]{2,40})', { lookahead = TEXT_LOOKAHEAD, skipLabelLines = false } = {}) {
  const lines = String(text).split(/\r?\n/);
  for (const label of labels) {
    const labelRe = new RegExp(label, 'i');
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(labelRe);
      if (!m) continue;
      const column = m.index;
      const tail = lines[i].slice(m.index + m[0].length);

      const inline = candidates(tail, valueRe).find((c) => !tail.slice(0, c.at).includes('/'));
      if (inline) return inline.text;

      let budget = lookahead;
      for (let j = i + 1; j < lines.length && budget > 0; j += 1) {
        if (isLabelLine(lines[j])) {
          // A heading row is not this field's value. For dates it is stepped over,
          // because a stacked capture puts every heading before any value; for text
          // it still costs budget, which is what stops a name being read as the
          // value of the label three rows above it.
          if (!skipLabelLines) budget -= 1;
          continue;
        }
        budget -= 1;
        const found = candidates(lines[j], valueRe);
        if (!found.length) continue;
        return found.reduce((a, b) => (Math.abs(b.at - column) < Math.abs(a.at - column) ? b : a)).text;
      }
    }
  }
  return null;
}

function grabDate(text, labels) {
  const v = grab(text, labels, DATE_RE, { lookahead: DATE_LOOKAHEAD, skipLabelLines: true });
  return v ? parseDate(v) : null;
}

/**
 * @param {string} rawText
 * @param {import('../types.js').DocumentType} documentType
 * @returns {{ fields: import('../types.js').ExtractedFields, vizFields: Object, mrz: {format, lines}|null }}
 */
export function parseFields(rawText, documentType) {
  const text = rawText.replace(/[ \t]+/g, ' ');
  const upper = text.toUpperCase();

  // Visual-zone (printed text) fields
  const viz = {};
  const surname = grab(upper, ['SURNAME', 'FAMILY NAME', 'LAST NAME'], '([A-Z][A-Z \\-\']{1,40})');
  const given = grab(upper, ['GIVEN NAMES?', 'FIRST NAMES?', 'FORENAMES?', 'NAME'], '([A-Z][A-Z \\-\']{1,40})');
  if (surname) viz.surname = cleanName(surname);
  if (given) viz.givenNames = cleanName(given);
  if (viz.surname || viz.givenNames) viz.fullName = [viz.givenNames, viz.surname].filter(Boolean).join(' ');

  const number = grab(upper, ['PASSPORT NO\\.?', 'PASSPORT NUMBER', 'DOCUMENT NO\\.?', 'DOC NO\\.?', 'ID NO\\.?', 'ID NUMBER', 'LICENCE NO\\.?', 'LICENSE NO\\.?', 'DL NO\\.?', 'PERMIT NO\\.?', 'NO\\.?'], '([A-Z]{0,2}[0-9A-Z]{5,12})');
  if (number) viz.documentNumber = number.replace(/\s/g, '');

  const nat = grab(upper, ['NATIONALITY', 'CITIZENSHIP'], '([A-Z]{3,20})');
  if (nat) viz.nationality = toIso3(nat);
  const issuer = grab(upper, ['ISSUING COUNTRY', 'COUNTRY CODE', 'CODE'], '([A-Z]{3})\\b');
  if (issuer) viz.issuingCountry = issuer;

  const dob = grabDate(upper, ['DATE OF BIRTH', 'BIRTH DATE', 'DOB', 'BORN']);
  if (dob) viz.dateOfBirth = dob;
  const exp = grabDate(upper, ['DATE OF EXPIRY', 'EXPIRY DATE', 'EXPIRES?', 'EXP', 'VALID UNTIL', 'VALID TO', 'VALID THRU', 'EXPIRATION']);
  if (exp) viz.expiryDate = exp;

  const sex = grab(upper, ['SEX', 'GENDER'], '(M|F|X|MALE|FEMALE)\\b');
  if (sex) viz.gender = sex[0];

  if (documentType === 'visa') {
    const visaNo = grab(upper, ['VISA NO\\.?', 'VISA NUMBER', 'CONTROL NO\\.?'], '([A-Z0-9]{6,12})');
    if (visaNo) viz.visaNumber = visaNo;
    const visaType = grab(upper, ['VISA TYPE', 'TYPE', 'CATEGORY', 'CLASS'], '([A-Z0-9][A-Z0-9 /\\-]{0,20})');
    if (visaType) viz.visaType = visaType;
    const entries = grab(upper, ['ENTRIES', 'NUMBER OF ENTRIES', 'ENTRY'], '(SINGLE|MULTIPLE|DOUBLE|MULT|[1-9]|M|S)\\b');
    if (entries) viz.entries = entries === 'M' || entries === 'MULT' ? 'MULTIPLE' : entries === 'S' ? 'SINGLE' : entries;
    const from = grabDate(upper, ['VALID FROM', 'FROM', 'ISSUE DATE', 'DATE OF ISSUE']);
    if (from) viz.validFrom = from;
    const until = grabDate(upper, ['VALID UNTIL', 'UNTIL', 'VALID TO', 'EXPIRY']);
    if (until) viz.validUntil = until;
    const stay = grab(upper, ['DURATION OF STAY', 'DURATION', 'STAY', 'PERIOD OF STAY'], '(\\d{1,3}\\s*(?:DAYS?|MONTHS?|YEARS?|D|M))');
    if (stay) viz.stayDuration = stay.replace(/\s*D$/, ' days').replace(/\s*M$/, ' months').toLowerCase();
    if (viz.expiryDate && !viz.validUntil) viz.validUntil = viz.expiryDate;
  }

  if (documentType === 'permit') {
    const from = grabDate(upper, ['VALID FROM', 'FROM', 'ISSUE DATE', 'DATE OF ISSUE']);
    if (from) viz.validFrom = from;
    const until = grabDate(upper, ['VALID UNTIL', 'UNTIL', 'VALID TO', 'EXPIRY']);
    viz.validUntil = until || viz.expiryDate || undefined;
  }

  // Machine readable zone — authoritative when present
  const mrz = extractMrzLines(rawText);
  const parsed = mrz ? parseMrz(mrz) : null;

  const fields = { ...viz, ...(parsed ? stripEmpty(parsed.fields) : {}) };
  if (parsed && documentType === 'visa') {
    fields.visaNumber = fields.visaNumber || parsed.fields.documentNumber;
    fields.validUntil = fields.validUntil || parsed.fields.expiryDate;
  }
  return { fields: stripEmpty(fields), vizFields: viz, mrz };
}

function stripEmpty(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

function cleanName(s) {
  return s.replace(/\b(GIVEN|NAMES?|SURNAME|SEX|NATIONALITY|DATE|OF|BIRTH)\b.*$/i, '').trim();
}

const NATIONALITY_TO_ISO3 = {
  INDIAN: 'IND', INDIA: 'IND', NEPALESE: 'NPL', NEPALI: 'NPL', NEPAL: 'NPL', BHUTANESE: 'BTN', BHUTAN: 'BTN',
  BANGLADESHI: 'BGD', BANGLADESH: 'BGD', PAKISTANI: 'PAK', PAKISTAN: 'PAK', 'SRI LANKAN': 'LKA', CHINESE: 'CHN', CHINA: 'CHN',
  BRITISH: 'GBR', AMERICAN: 'USA', 'UNITED STATES': 'USA', CANADIAN: 'CAN', AUSTRALIAN: 'AUS', GERMAN: 'DEU', FRENCH: 'FRA',
  JAPANESE: 'JPN', MYANMAR: 'MMR', AFGHAN: 'AFG', THAI: 'THA', MALAYSIAN: 'MYS', SINGAPOREAN: 'SGP',
};

export function toIso3(nat) {
  const key = String(nat).toUpperCase().trim();
  if (/^[A-Z]{3}$/.test(key)) return key;
  for (const [k, v] of Object.entries(NATIONALITY_TO_ISO3)) if (key.startsWith(k)) return v;
  return key;
}
