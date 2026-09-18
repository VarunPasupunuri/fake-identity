/**
 * ICAO 9303 Machine Readable Zone parsing + check digits.
 * Pure functions — no browser or Firebase dependency — so they are unit-testable.
 */

const WEIGHTS = [7, 3, 1];

/** Character value per ICAO 9303: digits 0-9, letters A-Z = 10-35, filler '<' = 0. */
export function charValue(ch) {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  if (ch === '<') return 0;
  return 0;
}

/** Compute an ICAO check digit for a string. */
export function checkDigit(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += charValue(str[i]) * WEIGHTS[i % 3];
  return sum % 10;
}

/** True when the check digit character matches the computed value (a '<' digit is treated as 0 for optional fields). */
export function verifyCheckDigit(str, digit) {
  if (digit === '<') return checkDigit(str) === 0;
  if (!/^[0-9]$/.test(digit)) return false;
  return checkDigit(str) === Number(digit);
}

/** yyMMdd -> ISO yyyy-mm-dd, using a pivot so that expiry dates land in the future and DOBs in the past. */
export function mrzDateToIso(yymmdd, { future = false } = {}) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const nowYY = new Date().getFullYear() % 100;
  const century = future ? (yy <= nowYY + 20 ? 2000 : 1900) : (yy <= nowYY ? 2000 : 1900);
  const iso = `${century + yy}-${mm}-${dd}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function isValidIsoDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

const clean = (s) => s.replace(/</g, ' ').trim().replace(/\s+/g, ' ');

function splitNames(nameField) {
  const [surname = '', given = ''] = nameField.split('<<');
  return { surname: clean(surname), givenNames: clean(given) };
}

/**
 * Normalise OCR output into candidate MRZ lines. OCR tends to insert spaces and confuse
 * `<` with `«`, `K`, or `(`; we fix the common confusions and pad/trim to the expected length.
 */
export function extractMrzLines(rawText) {
  const candidates = rawText
    .split(/\r?\n/)
    .map(normaliseMrzLine)
    .filter((l) => l.length >= 28 && (l.includes('<<') || /<{2,}/.test(l) || /^[A-Z0-9<]{30,44}$/.test(l)));

  // TD3: two lines of 44 starting with P<, V< or similar (OCR may over-run the filler, so allow long lines and trim)
  const td3 = candidates.filter((l) => l.length >= 40 && l.length <= 80);
  const td3Start = td3.findIndex((l) => /^[PV][A-Z<]/.test(l));
  if (td3Start >= 0 && td3[td3Start + 1]) {
    const l1 = padTo(td3[td3Start], 44);
    return { format: 'TD3', lines: [l1, padTo(repairTd3Numerics(realignTd3Line2(td3[td3Start + 1], clean(l1.slice(2, 5)))), 44)] };
  }
  // TD1: three lines of 30 starting with I<, A<, C<
  const td1 = candidates.filter((l) => l.length >= 28 && l.length <= 32);
  const td1Start = td1.findIndex((l) => /^[IAC][A-Z<]/.test(l));
  if (td1Start >= 0 && td1[td1Start + 1] && td1[td1Start + 2]) {
    return { format: 'TD1', lines: [0, 1, 2].map((i) => padTo(td1[td1Start + i], 30)) };
  }
  // TD2: two lines of 36
  const td2 = candidates.filter((l) => l.length >= 34 && l.length <= 38);
  const td2Start = td2.findIndex((l) => /^[IAC][A-Z<]/.test(l));
  if (td2Start >= 0 && td2[td2Start + 1]) {
    return { format: 'TD2', lines: [padTo(td2[td2Start], 36), padTo(td2[td2Start + 1], 36)] };
  }
  return null;
}

/**
 * Fix the usual OCR confusions in an MRZ line.
 *
 * `<` is read as «, (, [, {, and long filler runs come back as K, L, I or 1 — a
 * run of those next to a `<` or at the end of the line is never real data.
 *
 * Only those four letters. S, R, C and E are read for filler too, but they occur
 * constantly in real names — ERIC, LESLIE, CLARK — and treating them as filler
 * deletes the name out of the zone. It then disagrees with the name printed on
 * the page, and a genuine passport is reported as having had its name altered:
 * a false accusation, traded for a little more tolerance of a speckled capture.
 * Where speckle does survive here it costs at most the name comparison, and the
 * dates and numbers that carry the finding are untouched by it.
 */
export function normaliseMrzLine(line) {
  let l = line.toUpperCase().replace(/[«»(){}\[\]]/g, '<').replace(/[^A-Z0-9<]/g, '');
  l = l.replace(/(<)([KLI1]{3,})/g, (m, lt, run) => lt + '<'.repeat(run.length));
  l = l.replace(/([KLI1]{5,})(?=<|$)/g, (run) => '<'.repeat(run.length));
  return l;
}

/**
 * Put the second line back on its true columns.
 *
 * Every field in the zone is found by counting characters from the start of the
 * line, so a character lost at the left edge — a finger over the corner, the page
 * cropped a little tight — shifts every field along and the whole line parses as
 * nonsense. The date of birth is read correctly and lands where the document
 * number is expected, so nothing verifies and nothing can be compared.
 *
 * The line carries its own ruler: the three-letter nationality code, which must
 * sit at column 10 and is already known from the first line. Finding it says how
 * far the line has slipped. Characters genuinely lost are restored as filler, so
 * the field that lost them fails its own check digit — which is honest, it was
 * not read — while every field after it is back where it belongs.
 */
export function realignTd3Line2(l2, issuingCountry) {
  if (!l2 || !/^[A-Z]{3}$/.test(issuingCountry || '')) return l2;
  if (looksLikeTd3Line2(l2, issuingCountry)) return l2;

  // Characters LOST off the front. Every place the code appears is a candidate
  // ruler; how far the line slipped is not guessed at, each shift is tried and
  // kept only if the fields it implies are the shape a zone's fields must be.
  for (let at = l2.indexOf(issuingCountry); at >= 0; at = l2.indexOf(issuingCountry, at + 1)) {
    const shifted = at < 10 ? '<'.repeat(10 - at) + l2 : l2.slice(at - 10);
    if (looksLikeTd3Line2(shifted, issuingCountry)) return shifted;
  }

  // A character INVENTED inside the line — a speck of the page read as a letter,
  // or one character recognised as two. That pushes every field after it along
  // while the ones before stay put, so no single shift of the whole line can put
  // it right. Dropping one character is tried at each position up to the sex
  // field, and again only what leaves the fields the right shape is kept.
  for (let i = 0; i < Math.min(l2.length, 22); i += 1) {
    const dropped = l2.slice(0, i) + l2.slice(i + 1);
    if (looksLikeTd3Line2(dropped, issuingCountry)) return dropped;
  }
  return l2;
}

/** Letters recognised where only a digit can stand, in the fields that are all digits. */
const AS_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7', A: '4' };
const digitsOnly = (s) => s.replace(/[A-Z]/g, (c) => AS_DIGIT[c] ?? c);

/** The fixed shape of a second line: a code, two dates, a sex, and their check digits. */
function looksLikeTd3Line2(l, issuingCountry) {
  // The date fields are read through the digit map: a date of birth that is only
  // a date once O is read as 0 is still a date, and the line is still on its
  // columns. The map is applied for this test alone, never to the stored line.
  return l.length >= 28
    && l.slice(10, 13) === issuingCountry
    && /^\d{6}$/.test(digitsOnly(l.slice(13, 19)))   // date of birth
    && /^[0-9<]$/.test(digitsOnly(l[19]))            // its check digit
    && /^[MFX<]$/.test(l[20])                        // sex
    && /^\d{6}$/.test(digitsOnly(l.slice(21, 27)))   // expiry
    && /^[0-9<]$/.test(digitsOnly(l[27]));           // its check digit
}

/**
 * Put digits back in the fields that can only hold digits.
 *
 * The zone is one typeface at one size, and O for 0, S for 5, I for 1 are the
 * confusions it produces. In a date or a check digit a letter cannot be right,
 * so the reading is corrected rather than carried forward as damage — a date
 * that fails to parse takes the whole line's alignment with it. Only these
 * positions are touched; the name and the document number may legitimately hold
 * letters and are left exactly as they were read.
 */
export function repairTd3Numerics(l) {
  if (!l || l.length < 28) return l;
  return l.slice(0, 13)
    + digitsOnly(l.slice(13, 20))   // date of birth and its check digit
    + l[20]                         // sex
    + digitsOnly(l.slice(21, 28))   // expiry and its check digit
    + l.slice(28);
}

function padTo(line, n) {
  return line.length >= n ? line.slice(0, n) : line.padEnd(n, '<');
}

/**
 * Parse an MRZ block.
 * @returns {{ format, fields, checks: {id,label,ok,expected,actual,value}[] } | null}
 */
export function parseMrz(mrz) {
  if (!mrz) return null;
  if (mrz.format === 'TD3') return parseTd3(mrz.lines);
  if (mrz.format === 'TD1') return parseTd1(mrz.lines);
  if (mrz.format === 'TD2') return parseTd2(mrz.lines);
  return null;
}

function check(id, label, str, digit) {
  return { id, label, ok: verifyCheckDigit(str, digit), value: str, expected: checkDigit(str), actual: digit };
}

function parseTd3([l1, l2]) {
  const docCode = l1.slice(0, 2);
  const issuingCountry = clean(l1.slice(2, 5));
  const { surname, givenNames } = splitNames(l1.slice(5, 44));
  const documentNumber = clean(l2.slice(0, 9)).replace(/ /g, '');
  const docCheck = l2[9];
  const nationality = clean(l2.slice(10, 13));
  const dob = l2.slice(13, 19);
  const dobCheck = l2[19];
  const sex = l2[20];
  const expiry = l2.slice(21, 27);
  const expiryCheck = l2[27];
  const optional = l2.slice(28, 42);
  const optionalCheck = l2[42];
  const finalCheck = l2[43];
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);

  const checks = [
    check('mrz_doc_number', 'Document number check digit', l2.slice(0, 9), docCheck),
    check('mrz_dob', 'Date of birth check digit', dob, dobCheck),
    check('mrz_expiry', 'Expiry date check digit', expiry, expiryCheck),
    check('mrz_composite', 'Composite check digit', composite, finalCheck),
  ];
  if (optional.replace(/</g, '').length > 0) {
    checks.push(check('mrz_optional', 'Optional data check digit', optional, optionalCheck));
  }

  return {
    format: 'TD3',
    documentCode: docCode,
    fields: {
      surname,
      givenNames,
      fullName: `${givenNames} ${surname}`.trim(),
      documentNumber,
      issuingCountry,
      nationality,
      dateOfBirth: mrzDateToIso(dob),
      expiryDate: mrzDateToIso(expiry, { future: true }),
      gender: sex === '<' ? 'X' : sex,
      ...(docCode[0] === 'V' ? { visaNumber: documentNumber } : {}),
    },
    checks,
  };
}

function parseTd1([l1, l2, l3]) {
  const docCode = l1.slice(0, 2);
  const issuingCountry = clean(l1.slice(2, 5));
  const documentNumber = clean(l1.slice(5, 14)).replace(/ /g, '');
  const docCheck = l1[14];
  const optional1 = l1.slice(15, 30);
  const dob = l2.slice(0, 6);
  const dobCheck = l2[6];
  const sex = l2[7];
  const expiry = l2.slice(8, 14);
  const expiryCheck = l2[14];
  const nationality = clean(l2.slice(15, 18));
  const optional2 = l2.slice(18, 29);
  const finalCheck = l2[29];
  const { surname, givenNames } = splitNames(l3);
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);

  return {
    format: 'TD1',
    documentCode: docCode,
    fields: {
      surname,
      givenNames,
      fullName: `${givenNames} ${surname}`.trim(),
      documentNumber,
      issuingCountry,
      nationality,
      dateOfBirth: mrzDateToIso(dob),
      expiryDate: mrzDateToIso(expiry, { future: true }),
      gender: sex === '<' ? 'X' : sex,
      optionalData: clean(optional1 + optional2),
    },
    checks: [
      check('mrz_doc_number', 'Document number check digit', l1.slice(5, 14), docCheck),
      check('mrz_dob', 'Date of birth check digit', dob, dobCheck),
      check('mrz_expiry', 'Expiry date check digit', expiry, expiryCheck),
      check('mrz_composite', 'Composite check digit', composite, finalCheck),
    ],
  };
}

function parseTd2([l1, l2]) {
  const docCode = l1.slice(0, 2);
  const issuingCountry = clean(l1.slice(2, 5));
  const { surname, givenNames } = splitNames(l1.slice(5, 36));
  const documentNumber = clean(l2.slice(0, 9)).replace(/ /g, '');
  const docCheck = l2[9];
  const nationality = clean(l2.slice(10, 13));
  const dob = l2.slice(13, 19);
  const dobCheck = l2[19];
  const sex = l2[20];
  const expiry = l2.slice(21, 27);
  const expiryCheck = l2[27];
  const finalCheck = l2[35];
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35);

  return {
    format: 'TD2',
    documentCode: docCode,
    fields: {
      surname,
      givenNames,
      fullName: `${givenNames} ${surname}`.trim(),
      documentNumber,
      issuingCountry,
      nationality,
      dateOfBirth: mrzDateToIso(dob),
      expiryDate: mrzDateToIso(expiry, { future: true }),
      gender: sex === '<' ? 'X' : sex,
    },
    checks: [
      check('mrz_doc_number', 'Document number check digit', l2.slice(0, 9), docCheck),
      check('mrz_dob', 'Date of birth check digit', dob, dobCheck),
      check('mrz_expiry', 'Expiry date check digit', expiry, expiryCheck),
      check('mrz_composite', 'Composite check digit', composite, finalCheck),
    ],
  };
}

/** Build a valid TD3 MRZ from fields — used by the mock OCR provider and tests. */
export function buildTd3({ docCode = 'P<', issuingCountry, surname, givenNames, documentNumber, nationality, dateOfBirth, gender, expiryDate, optional = '' }) {
  const fmt = (s, n) => s.toUpperCase().replace(/[^A-Z0-9<]/g, '<').padEnd(n, '<').slice(0, n);
  const yymmdd = (iso) => iso.replace(/-/g, '').slice(2);
  const names = `${surname.toUpperCase().replace(/ /g, '<')}<<${givenNames.toUpperCase().replace(/ /g, '<')}`;
  const l1 = fmt(`${docCode}${issuingCountry}${names}`, 44);
  const num = fmt(documentNumber, 9);
  const dob = yymmdd(dateOfBirth);
  const exp = yymmdd(expiryDate);
  const opt = fmt(optional, 14);
  let l2 = num + checkDigit(num) + fmt(nationality, 3) + dob + checkDigit(dob) + (gender || '<') + exp + checkDigit(exp) + opt + checkDigit(opt);
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
  l2 += checkDigit(composite);
  return { format: 'TD3', lines: [l1, l2] };
}
