/**
 * Mock OCR provider. Returns deterministic SYNTHETIC sample text per document
 * type so the whole screening flow can be exercised without any OCR engine.
 * Travel / identity samples live here (they need MRZ construction); every other
 * document category comes from modules/documents/fixtures.js.
 *
 * The scenario descriptor (modules/documents/scenarios.js) decides what the
 * sample shows, so OCR, tampering and face mocks stay consistent within one case.
 */
import { buildTd3 } from '../validation/mrz.js';
import { parseFields } from './parse.js';
import { sleep } from '../../lib/image.js';
import { fixtureText, SYNTHETIC } from '../documents/fixtures.js';
import { scenarioProfile } from '../documents/scenarios.js';

const CLEAN_PASSPORT = { docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1988-04-12', gender: 'F', expiryDate: '2031-06-30' };
// Matches DEMO-WL-0001 in the synthetic demo watchlist (ZZ prefix, ICAO fictional code UTO).
const WATCHLISTED_PASSPORT = { docCode: 'P<', issuingCountry: 'UTO', surname: 'ALPHA', givenNames: 'TEST SUBJECT', documentNumber: 'ZZ0000001', nationality: 'UTO', dateOfBirth: '1990-01-01', gender: 'M', expiryDate: '2024-03-01' };

const dmy = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

function passportText(sc) {
  if (sc === 'expired_watchlisted') {
    const b = WATCHLISTED_PASSPORT;
    const mrz = buildTd3(b);
    return `REPUBLIC OF UTOPIA\nPASSPORT\nType P  Country Code UTO  Passport No. ${b.documentNumber}\nSurname ALPHA\nGiven Names TEST SUBJECT\nNationality UTOPIAN\nSex M  Date of Birth ${dmy(b.dateOfBirth)}\nDate of Expiry ${dmy(b.expiryDate)}\n${mrz.lines.join('\n')}`;
  }
  const b = { ...CLEAN_PASSPORT };
  if (sc === 'suspicious') b.expiryDate = '2024-01-31';
  if (sc === 'inconsistent_dates') b.dateOfBirth = '2030-04-12';
  const mrz = buildTd3(b);
  // Altered document: the printed number and the MRZ check digit disagree.
  if (sc === 'suspicious') mrz.lines[1] = mrz.lines[1].slice(0, 9) + '7' + mrz.lines[1].slice(10);
  // Tampered DOB: the MRZ keeps the true date, the printed date of birth was changed.
  const printedDob = sc === 'dob_mismatch' ? '1998-04-12' : b.dateOfBirth;
  const printedNumber = sc === 'suspicious' ? 'M8412346' : b.documentNumber;
  return `REPUBLIC OF INDIA\nPASSPORT\nType P  Country Code IND  Passport No. ${printedNumber}\nSurname SHARMA\nGiven Names ANITA\nNationality INDIAN\nSex F  Date of Birth ${dmy(printedDob)}\nDate of Expiry ${dmy(b.expiryDate)}\n${mrz.lines.join('\n')}`;
}

const SAMPLES = {
  passport: passportText,
  visa: (sc) => `VISA\nIndia Bureau of Immigration\nVisa No. VS2298811  Type TOURIST\nSurname ROY\nGiven Names DIPAK\nNationality BANGLADESHI\nDate of Birth 03 MAR 1979  Sex M\nEntries MULTIPLE  Duration of stay 90 days\nValid From 01/02/2026  Valid Until ${sc === 'suspicious' ? '01/08/2026' : '31/01/2027'}\n${buildTd3({ docCode: 'V<', issuingCountry: 'IND', surname: 'ROY', givenNames: 'DIPAK', documentNumber: 'VS2298811', nationality: 'BGD', dateOfBirth: '1979-03-03', gender: 'M', expiryDate: sc === 'suspicious' ? '2026-08-01' : '2027-01-31' }).lines.join('\n')}`,
  national_id: (sc) => `GOVERNMENT OF NEPAL\nNATIONAL IDENTITY CARD\nID No. 4471-2209-118\nSurname THAPA\nGiven Names SUNITA\nDate of Birth 1995-11-08  Sex F\nNationality NPL\nDate of Expiry ${sc === 'suspicious' ? '2025-01-01' : '2032-11-08'}`,
  driving_license: (sc) => `DRIVING LICENCE\nDL No. MH12 20110012345\nName RAHUL VERMA\nDate of Birth 21-07-1990\nValid Till ${sc === 'suspicious' ? '20-07-2025' : '20-07-2030'}\nBlood Group O+`,
  permit: (sc) => `DEMO DISTRICT ADMINISTRATION\nBORDER AREA PERMIT\nPermit No. BAP-2026-00918\nName TENZIN DEMO DORJI\nNationality BTN\nValid From 01/01/2026\nValid Until ${sc === 'suspicious' ? '15/03/2026' : '31/12/2026'}\nIssuing Authority District Magistrate\nJurisdiction SECTOR 4`,
};

const garble = (s) => s.replace(/[AEIOU]/g, (c, i) => (i % 3 === 0 ? '#' : c)).replace(/0/g, 'O').replace(/1/g, 'l');

/** Synthetic recognised text for any document type + scenario. */
export function sampleText(documentType, scenario = 'clean') {
  const sc = scenarioProfile(scenario).ocr;
  if (sc === 'unknown') return fixtureText('unknown', 'unknown');
  // Unreadable capture: characters are recognised but nothing parses into a field.
  if (sc === 'unreadable') return '### ####  ##\n#   #\n.. ,,  ;;\n##########\n#  ##   #';
  const legacy = SAMPLES[documentType];
  if (!legacy) return fixtureText(documentType, scenario);
  let text = legacy(sc);
  if (sc === 'missing_fields') text = text.split('\n').filter((l) => !/^(Surname|Given Names|Name|Passport No|ID No|DL No|Permit No)/i.test(l) && !/<<+/.test(l)).join('\n');
  if (sc === 'poor_ocr') text = garble(text);
  return text;
}

/** @returns {Promise<import('../types.js').OcrResult>} */
export async function extract({ documentType = 'passport', scenario = 'clean', mockDocument, onProgress }) {
  const t0 = performance.now();
  for (let p = 0.1; p <= 1; p += 0.3) { onProgress?.(p, 'Recognising text'); await sleep(180); }
  const sc = scenarioProfile(scenario).ocr;
  // `mockDocument` is what was *presented*; `documentType` is what the officer *selected*.
  // The presented document always wins, so selecting Passport and presenting an Aadhaar
  // produces Aadhaar text — which is exactly what the preflight type check must catch.
  const type = mockDocument || (documentType === 'auto' || !documentType ? 'passport' : documentType);
  const rawText = sampleText(type, scenario);
  const { fields, vizFields, mrz, printedDates } = parseFields(rawText, SAMPLES[type] ? type : 'generic');
  const confidence = sc === 'unreadable' ? 0.16 : sc === 'poor_ocr' ? 0.42 : 0.93;
  const fieldConfidence = Object.fromEntries(Object.keys(fields).map((k) => [k, confidence]));
  return { fields, vizFields, printedDates, fieldConfidence, confidence, rawText, mrz, provider: 'mock', synthetic: SYNTHETIC, durationMs: Math.round(performance.now() - t0) };
}
