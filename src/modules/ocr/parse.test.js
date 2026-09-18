/**
 * FIELD EXTRACTION FROM REAL DOCUMENT LAYOUTS.
 *
 * A passport bio page does not print "label: value". It prints a row of labels
 * above a row of values, several columns wide, each label followed by its own
 * translation. Every fixture here is synthetic, and none of the values below is
 * referenced by production logic — the parser reads whatever it is handed.
 *
 * These cases exist because a printed field that cannot be read cannot be
 * cross-checked against the machine readable zone, and an alteration nobody
 * compares is an alteration nobody finds.
 */
import { describe, it, expect } from 'vitest';
import { parseFields, parseDate } from './parse.js';
import { determineAuthenticity, AUTHENTICITY, INDICATOR } from '../authenticity/index.js';
import { finalVerdict, VERDICT } from '../authenticity/report.js';
import { buildTd3 } from '../validation/mrz.js';

const CLEAN_IMAGE = { score: 7, flags: [], evidence: {}, provider: 'local-ela' };

/** A photographed passport bio page: columns, bilingual labels, values on the row below. */
function bioPage({ number = 'X1234567', surname = 'DEMO', given = 'ANITA', printedDob = '05/11/2006', issue = '30/06/2021', expiry = '30/06/2031', mrzDob = '2006-11-03' } = {}) {
  const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname, givenNames: given, documentNumber: number, nationality: 'IND', dateOfBirth: mrzDob, gender: 'F', expiryDate: '2031-06-30' });
  const text = [
    'REPUBLIC OF INDIA',
    'Type/ Type  Country Code/ Code du Pays  Passport No./ No de Passeport',
    `P           IND                          ${number}`,
    'Surname/ Nom',
    surname,
    'Given Name(s)/ Prenom(s)',
    given,
    'Nationality/ Nationalite     Sex/ Sexe    Date of Birth/ Date de naissance',
    `INDIAN                       F            ${printedDob}`,
    'Place of Birth/ Lieu de naissance',
    'SAMPLE CITY',
    "Date of Issue/ Date de delivrance   Date of Expiry/ Date d'expiration",
    `${issue}                          ${expiry}`,
    ...mrz.lines,
  ].join('\n');
  return { text, mrz };
}

const read = (text) => parseFields(text, 'passport');
const screen = (text) => {
  const out = read(text);
  return determineAuthenticity({ documentType: 'passport', ocr: { ...out, confidence: 0.88, rawText: text, provider: 'tesseract' }, tampering: CLEAN_IMAGE });
};

describe('a photographed bio page, not a "label: value" list', () => {
  it('reads the printed fields that sit on the row below their labels', () => {
    const { vizFields } = read(bioPage().text);
    expect(vizFields).toMatchObject({
      surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567',
      nationality: 'IND', gender: 'F', dateOfBirth: '2006-11-05',
    });
  });

  it('takes each date from its own column, not the one printed to its left', () => {
    // Issue and expiry share a row. Reading the expiry as the issue date would
    // make a valid passport look expired.
    const { vizFields } = read(bioPage({ issue: '30/06/2021', expiry: '30/06/2031' }).text);
    expect(vizFields.expiryDate).toBe('2031-06-30');
    expect(vizFields.expiryDate).not.toBe('2021-06-30');
  });

  it('does not mistake a label\'s translation for its value', () => {
    // "Nationality/ Nationalite" must not yield a nationality of NATIONALITE.
    const { vizFields } = read(bioPage().text);
    expect(vizFields.nationality).toBe('IND');
    expect(vizFields.surname).toBe('DEMO');
    expect(vizFields.documentNumber).toBe('X1234567');
  });

  it('still reads documents that do print the value inline', () => {
    const { vizFields } = read('PASSPORT\nSurname SHARMA\nGiven Names ANITA\nSex F  Date of Birth 12/04/1988\nDate of Expiry 30/06/2031');
    expect(vizFields).toMatchObject({ surname: 'SHARMA', givenNames: 'ANITA', gender: 'F', dateOfBirth: '1988-04-12', expiryDate: '2031-06-30' });
  });
});

describe('an altered printed date of birth on a photographed passport', () => {
  it('is reported as TAMPERED and boxed on the date of birth', () => {
    // The printed date says the 5th; the machine readable zone still encodes the 3rd.
    const v = finalVerdict(screen(bioPage({ printedDob: '05/11/2006', mrzDob: '2006-11-03' }).text));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.reason).toMatch(/date of birth/i);
    expect(v.regions).toHaveLength(1);
    expect(v.regions[0].label).toBe('DOB field — suspected modification');
    expect(v.regions[0].tone).toBe('high');
  });

  it('names the date of birth as the altered field', () => {
    const r = screen(bioPage({ printedDob: '05/11/2006', mrzDob: '2006-11-03' }).text);
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
    expect(r.indicators.some((i) => i.id === INDICATOR.VISUAL_MRZ_DOB_MISMATCH)).toBe(true);
  });

  it('leaves the same page alone when the printed date agrees with the zone', () => {
    const v = finalVerdict(screen(bioPage({ printedDob: '03/11/2006', mrzDob: '2006-11-03' }).text));
    expect(v.headline).toBe(VERDICT.ORIGINAL);
    expect(v.regions).toEqual([]);
  });

  it('catches an altered passport number on the same layout', () => {
    const v = finalVerdict(screen(bioPage({ number: 'X1234567', mrzDob: '2006-11-03', printedDob: '03/11/2006' }).text.replace('  X1234567', '  X7654321')));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.regions.some((b) => /Document number/.test(b.label))).toBe(true);
  });
});

describe('date formats printed on real documents', () => {
  it('reads the formats identity documents actually use', () => {
    expect(parseDate('05/11/2006')).toBe('2006-11-05');
    expect(parseDate('05-11-2006')).toBe('2006-11-05');
    expect(parseDate('2006-11-05')).toBe('2006-11-05');
    expect(parseDate('03 MAR 1979')).toBe('1979-03-03');
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('a capture that comes out fully stacked', () => {
  // Every heading first, then every value. Column position says nothing here,
  // so only the date — whose pattern is unmistakable — can be placed with confidence.
  const stacked = [
    'REPUBLIC OF INDIA',
    'Surname/ Nom',
    'Given Name(s)/ Prenom(s)',
    'Nationality/ Nationalite',
    'Sex/ Sexe',
    'Date of Birth/ Date de naissance',
    'DEMO',
    'ANITA',
    'INDIAN',
    'F',
    '05/11/2006',
  ].join('\n');

  it('still finds the printed date of birth', () => {
    expect(read(stacked).vizFields.dateOfBirth).toBe('2006-11-05');
  });

  it('invents nothing for the fields it cannot place', () => {
    // A guessed value is compared against the machine readable zone, so guessing
    // here would accuse a genuine document. Absent is the honest answer.
    const { vizFields } = read(stacked);
    expect(vizFields.nationality).toBeUndefined();
    expect(vizFields.documentNumber).toBeUndefined();
    for (const v of Object.values(vizFields)) expect(v).not.toBe('');
  });

  it('never reads a heading as a value', () => {
    const { vizFields } = read(stacked);
    for (const v of Object.values(vizFields)) {
      expect(String(v)).not.toMatch(/^(SEX|NATIONALITE|PRENOM|NOM|NAISSANCE|TYPE)$/i);
    }
  });

  it('catches the altered date of birth on this layout too', () => {
    const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-03', gender: 'F', expiryDate: '2031-06-30' });
    const v = finalVerdict(screen(`${stacked}\n${mrz.lines.join('\n')}`));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.reason).toMatch(/date of birth/i);
    expect(v.regions.some((b) => /DOB/.test(b.label))).toBe(true);
  });

  it('does not accuse the same layout when the date agrees', () => {
    const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-05', gender: 'F', expiryDate: '2031-06-30' });
    const v = finalVerdict(screen(`${stacked}\n${mrz.lines.join('\n')}`));
    expect(v.headline).toBe(VERDICT.ORIGINAL);
    expect(v.regions).toEqual([]);
  });
});

describe('labels are never mistaken for the values beside them', () => {
  // Recognition regularly loses the slash inside a bilingual label, leaving
  // "Passport No. No de Passeport" and "Given Names Prenoms". Reading the second
  // half as the value produces a passport number of PASSEPORT, which disagrees
  // with the machine readable zone and accuses a genuine document.
  const damaged = [
    'REPUBLIC OF INDIA                                    PASSPORT',
    'Typel Type              Gountry Codel Code du Pays:         Passport No. No de Passeport',
    'P                       IND                                 X1234567',
    'Sumame/ Nom',
    'DEMO',
    'Given Names Prenoms',
    'ANITA',
    'Nationaly/ Nationale:        sex/sexe          Date of Birth Date de naissance',
    'INDIAN                       F                03/11/2006',
    'Date of issue Date de defrance.                 Date of Expiryl Date dexpiration',
    '30/06/2021                                      30/06/2031',
  ].join('\n');

  it('reads the real document number, not the word "Passeport"', () => {
    expect(read(damaged).vizFields.documentNumber).toBe('X1234567');
  });

  it('reads the real given name, not the word "Prenoms"', () => {
    expect(read(damaged).vizFields.givenNames).toBe('ANITA');
  });

  it('extracts no field whose value is a word off the printing', () => {
    for (const v of Object.values(read(damaged).vizFields)) {
      expect(String(v)).not.toMatch(/^(PASSEPORT|PRENOMS?|NOM|NATIONALITE|SEXE|NAISSANCE)$/i);
    }
  });

  it('a document number without a digit is not a document number', () => {
    expect(read('PASSPORT\nPassport No. No de Passeport\nSurname DEMO').vizFields.documentNumber).toBeUndefined();
  });

  it('does not accuse this document, because nothing on it actually disagrees', () => {
    const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-03', gender: 'F', expiryDate: '2031-06-30' });
    const v = finalVerdict(screen(`${damaged}\n${mrz.lines.join('\n')}`));
    expect(v.headline).toBe(VERDICT.ORIGINAL);
    expect(v.regions).toEqual([]);
  });

  it('and still catches the altered date on the same damaged text', () => {
    const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-03', gender: 'F', expiryDate: '2031-06-30' });
    const v = finalVerdict(screen(`${damaged.replace('03/11/2006', '05/11/2006')}\n${mrz.lines.join('\n')}`));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.reason).toMatch(/date of birth/i);
    expect(v.regions).toHaveLength(1);
    expect(v.regions[0].label).toBe('DOB field — suspected modification');
  });
});

describe('dates printed on a page whose labels cannot be read', () => {
  it('collects them without claiming which field each belongs to', () => {
    const { printedDates } = parseFields('nsx\n05/11/2006      M\nrth 0 a of fs\n08/01/2026\nnf 1 78 Date of Expy.\n07/01/2036', 'passport');
    expect(printedDates).toEqual(['2006-11-05', '2026-01-08', '2036-01-07']);
  });

  it('leaves the machine readable zone out, since what it encodes is not what is printed', () => {
    const text = 'Date of Birth\n05/11/2006\nP<INDDEMO<<ANITA<<<<<<<<<<<<<<<<<<<<<<<<<<<<\nAM630833<1IND0611059M36010731066100677725<02';
    expect(parseFields(text, 'passport').printedDates).toEqual(['2006-11-05']);
  });

  it('is empty when nothing date-shaped was recognised', () => {
    expect(parseFields('#### ## ##\n### #', 'passport').printedDates).toEqual([]);
  });
});
