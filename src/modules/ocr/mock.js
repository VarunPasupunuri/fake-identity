/**
 * Mock OCR provider. Returns deterministic SYNTHETIC sample text per document
 * type so the whole screening flow can be exercised without any OCR engine.
 * Travel / identity samples live here (they need MRZ construction); every other
 * document category comes from modules/documents/fixtures.js. Scenarios:
 * clean | suspicious | missing_fields | inconsistent_dates | poor_ocr | unreadable_qr | unknown.
 */
import { buildTd3 } from '../validation/mrz.js';
import { parseFields } from './parse.js';
import { sleep } from '../../lib/image.js';
import { fixtureText, SYNTHETIC } from '../documents/fixtures.js';

const SAMPLES = {
  passport: ({ suspicious, inconsistent }) => {
    const base = { docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: inconsistent ? '2030-04-12' : '1988-04-12', gender: 'F', expiryDate: suspicious ? '2024-01-31' : '2031-06-30' };
    const mrz = buildTd3(base);
    if (suspicious) mrz.lines[1] = mrz.lines[1].slice(0, 9) + '7' + mrz.lines[1].slice(10); // corrupt doc-number check digit
    return `REPUBLIC OF INDIA\nPASSPORT\nType P  Country Code IND  Passport No. ${suspicious ? 'M8412346' : base.documentNumber}\nSurname SHARMA\nGiven Names ANITA\nNationality INDIAN\nSex F  Date of Birth ${inconsistent ? '12/04/2030' : '12/04/1988'}\nDate of Expiry ${suspicious ? '31/01/2024' : '30/06/2031'}\n${mrz.lines.join('\n')}`;
  },
  visa: ({ suspicious }) => `VISA\nIndia Bureau of Immigration\nVisa No. VS2298811  Type TOURIST\nSurname ROY\nGiven Names DIPAK\nNationality BANGLADESHI\nDate of Birth 03 MAR 1979  Sex M\nEntries MULTIPLE  Duration of stay 90 days\nValid From 01/02/2026  Valid Until ${suspicious ? '01/08/2026' : '31/01/2027'}\n${buildTd3({ docCode: 'V<', issuingCountry: 'IND', surname: 'ROY', givenNames: 'DIPAK', documentNumber: 'VS2298811', nationality: 'BGD', dateOfBirth: '1979-03-03', gender: 'M', expiryDate: suspicious ? '2026-08-01' : '2027-01-31' }).lines.join('\n')}`,
  national_id: ({ suspicious }) => `GOVERNMENT OF NEPAL\nNATIONAL IDENTITY CARD\nID No. 4471-2209-118\nSurname THAPA\nGiven Names SUNITA\nDate of Birth 1995-11-08  Sex F\nNationality NPL\nDate of Expiry ${suspicious ? '2025-01-01' : '2032-11-08'}`,
  driving_license: ({ suspicious }) => `DRIVING LICENCE\nDL No. MH12 20110012345\nName RAHUL VERMA\nDate of Birth 21-07-1990\nValid Till ${suspicious ? '20-07-2025' : '20-07-2030'}\nBlood Group O+`,
  permit: ({ suspicious }) => `BORDER AREA PERMIT\nPermit No. BAP-2026-00918\nName TENZIN DORJI\nNationality BTN\nValid From 01/01/2026\nValid Until ${suspicious ? '15/03/2026' : '31/12/2026'}`,
};

const garble = (s) => s.replace(/[AEIOU]/g, (c, i) => (i % 3 === 0 ? '#' : c)).replace(/0/g, 'O').replace(/1/g, 'l');

/** Synthetic recognised text for any document type + scenario. */
export function sampleText(documentType, scenario = 'clean') {
  if (scenario === 'unknown') return fixtureText('unknown', 'unknown');
  const legacy = SAMPLES[documentType];
  if (!legacy) return fixtureText(documentType, scenario);
  let text = legacy({ suspicious: scenario === 'suspicious', inconsistent: scenario === 'inconsistent_dates' });
  if (scenario === 'missing_fields') text = text.split('\n').filter((l) => !/^(Surname|Given Names|Name|Passport No|ID No|DL No|Permit No)/i.test(l) && !/<<+/.test(l)).join('\n');
  if (scenario === 'poor_ocr') text = garble(text);
  return text;
}

/** @returns {Promise<import('../types.js').OcrResult>} */
export async function extract({ documentType = 'passport', scenario = 'clean', mockDocument, onProgress }) {
  const t0 = performance.now();
  for (let p = 0.1; p <= 1; p += 0.3) { onProgress?.(p, 'Recognising text'); await sleep(180); }
  // Auto-detect runs the mock with the demo document chosen by the officer (default passport).
  const type = documentType === 'auto' || !documentType ? mockDocument || 'passport' : documentType;
  const rawText = sampleText(mockDocument && documentType === 'auto' ? mockDocument : type, scenario);
  const { fields, vizFields, mrz } = parseFields(rawText, SAMPLES[type] ? type : 'generic');
  const confidence = scenario === 'poor_ocr' ? 0.42 : 0.93;
  const fieldConfidence = Object.fromEntries(Object.keys(fields).map((k) => [k, confidence]));
  return { fields, vizFields, fieldConfidence, confidence, rawText, mrz, provider: 'mock', synthetic: SYNTHETIC, durationMs: Math.round(performance.now() - t0) };
}
