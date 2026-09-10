import { describe, it, expect } from 'vitest';
import { buildTd3, parseMrz, checkDigit, extractMrzLines, mrzDateToIso } from './validation/mrz.js';
import { validateDocument } from './validation/index.js';
import { computeRisk } from './risk/index.js';
import { parseFields, parseDate } from './ocr/parse.js';
import { analyseElaCells } from './tampering/ela.js';
import { analyseMetadata } from './tampering/metadata.js';

const sample = { docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1988-04-12', gender: 'F', expiryDate: '2031-06-30' };

describe('MRZ', () => {
  it('computes ICAO check digits (spec example)', () => {
    // ICAO 9303 part 3 example: "L898902C3" -> 6 ; "740812" -> 2 ; "120415" -> 9
    expect(checkDigit('L898902C3')).toBe(6);
    expect(checkDigit('740812')).toBe(2);
    expect(checkDigit('120415')).toBe(9);
  });

  it('round-trips a TD3 MRZ and passes all checksums', () => {
    const mrz = buildTd3(sample);
    expect(mrz.lines[0]).toHaveLength(44);
    expect(mrz.lines[1]).toHaveLength(44);
    const parsed = parseMrz(mrz);
    expect(parsed.fields.documentNumber).toBe('M8412345');
    expect(parsed.fields.surname).toBe('SHARMA');
    expect(parsed.fields.givenNames).toBe('ANITA');
    expect(parsed.fields.dateOfBirth).toBe('1988-04-12');
    expect(parsed.fields.expiryDate).toBe('2031-06-30');
    expect(parsed.checks.every((c) => c.ok)).toBe(true);
  });

  it('detects a corrupted check digit', () => {
    const mrz = buildTd3(sample);
    mrz.lines[1] = mrz.lines[1].slice(0, 9) + '0' + mrz.lines[1].slice(10);
    const parsed = parseMrz(mrz);
    const doc = parsed.checks.find((c) => c.id === 'mrz_doc_number');
    expect(doc.ok).toBe(false);
  });

  it('extracts MRZ lines from noisy OCR text', () => {
    const mrz = buildTd3(sample);
    const noisy = `REPUBLIC OF INDIA\nsome text\n${mrz.lines[0].replace(/<</, '« ')}\n${mrz.lines[1]}\n`;
    const found = extractMrzLines(noisy);
    expect(found?.format).toBe('TD3');
    expect(parseMrz(found).fields.documentNumber).toBe('M8412345');
  });

  it('repairs Tesseract filler confusions (K/L/I runs) in MRZ line 1', () => {
    const text = 'P<INDSHARMA<<ANITA<<KKKKLKLKLLILKLKLKLKLILKLKLKLKLKILKLKLKLKLKLKS\nM8412345<1IND8804123F3106305<<<<<<<<<<<<<<08';
    const found = extractMrzLines(text);
    expect(found?.format).toBe('TD3');
    const parsed = parseMrz(found);
    expect(parsed.fields.surname).toBe('SHARMA');
    expect(parsed.fields.givenNames).toBe('ANITA');
    expect(parsed.checks.every((c) => c.ok)).toBe(true);
  });

  it('parses a real-world TD1 layout', () => {
    const lines = ['I<UTOD231458907<<<<<<<<<<<<<<<', '7408122F1204159UTO<<<<<<<<<<<6', 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'];
    const parsed = parseMrz({ format: 'TD1', lines });
    expect(parsed.fields.documentNumber).toBe('D23145890');
    expect(parsed.fields.surname).toBe('ERIKSSON');
    expect(parsed.fields.givenNames).toBe('ANNA MARIA');
    expect(parsed.checks.every((c) => c.ok)).toBe(true);
  });

  it('pivots MRZ dates sensibly', () => {
    expect(mrzDateToIso('880412')).toBe('1988-04-12');
    expect(mrzDateToIso('310630', { future: true })).toBe('2031-06-30');
  });
});

describe('OCR field parsing', () => {
  it('parses common date formats', () => {
    expect(parseDate('12/04/1988')).toBe('1988-04-12');
    expect(parseDate('03 MAR 1979')).toBe('1979-03-03');
    expect(parseDate('1995-11-08')).toBe('1995-11-08');
    expect(parseDate('21-07-1990')).toBe('1990-07-21');
  });

  it('extracts visa fields from printed text', () => {
    const text = 'VISA\nVisa No. VS2298811 Type TOURIST\nSurname ROY\nGiven Names DIPAK\nNationality BANGLADESHI\nDate of Birth 03 MAR 1979 Sex M\nEntries MULTIPLE Duration of stay 90 days\nValid From 01/02/2026 Valid Until 31/01/2027';
    const { fields } = parseFields(text, 'visa');
    expect(fields.visaNumber).toBe('VS2298811');
    expect(fields.visaType).toMatch(/TOURIST/);
    expect(fields.entries).toBe('MULTIPLE');
    expect(fields.stayDuration).toBe('90 days');
    expect(fields.validFrom).toBe('2026-02-01');
    expect(fields.validUntil).toBe('2027-01-31');
    expect(fields.nationality).toBe('BGD');
    expect(fields.dateOfBirth).toBe('1979-03-03');
  });

  it('prefers MRZ over the visual zone when both exist', () => {
    const mrz = buildTd3(sample);
    const text = `Passport No. M8412346\nSurname SHARMA\n${mrz.lines.join('\n')}`;
    const { fields, vizFields } = parseFields(text, 'passport');
    expect(fields.documentNumber).toBe('M8412345');
    expect(vizFields.documentNumber).toBe('M8412346');
  });
});

describe('Validation', () => {
  const now = new Date('2026-09-10T00:00:00Z');
  it('passes a clean passport', () => {
    const mrz = buildTd3(sample);
    const ocr = { fields: parseMrz(mrz).fields, mrz, confidence: 0.95 };
    const v = validateDocument('passport', ocr, { now });
    expect(v.failed).toBe(0);
    expect(v.ok).toBe(true);
  });

  it('fails an expired passport and MRZ/visual mismatch', () => {
    const mrz = buildTd3({ ...sample, expiryDate: '2024-01-31' });
    const ocr = { fields: parseMrz(mrz).fields, vizFields: { documentNumber: 'M8412346' }, mrz, confidence: 0.9 };
    const v = validateDocument('passport', ocr, { now });
    expect(v.checks.find((c) => c.id === 'expiry_not_passed').status).toBe('fail');
    expect(v.checks.find((c) => c.id === 'mrz_viz_documentNumber').status).toBe('fail');
    expect(v.ok).toBe(false);
  });

  it('flags missing required fields', () => {
    const v = validateDocument('passport', { fields: { fullName: 'X' }, confidence: 0.3 }, { now });
    expect(v.checks.find((c) => c.id === 'required_documentNumber').status).toBe('fail');
  });
});

describe('Risk scoring', () => {
  it('is low for a clean screening', () => {
    const mrz = buildTd3(sample);
    const ocr = { fields: parseMrz(mrz).fields, mrz, confidence: 0.95 };
    const validation = validateDocument('passport', ocr, { now: new Date('2026-09-10') });
    const r = computeRisk({ validation, tampering: { score: 5, flags: [] }, face: { confidence: 92, match: true, documentFaceFound: true, liveFaceFound: true }, ocr });
    expect(r.level).toBe('low');
    expect(r.recommendation).toBe('accept');
  });

  it('is high when tampered + face mismatch + expired', () => {
    const mrz = buildTd3({ ...sample, expiryDate: '2024-01-31' });
    const ocr = { fields: parseMrz(mrz).fields, mrz, confidence: 0.9 };
    const validation = validateDocument('passport', ocr, { now: new Date('2026-09-10') });
    const r = computeRisk({ validation, tampering: { score: 75, flags: [{ id: 'x', severity: 'high', label: 'Photo replaced', detail: '' }] }, face: { confidence: 35, match: false, documentFaceFound: true, liveFaceFound: true }, ocr });
    expect(r.level).toBe('high');
    expect(r.factors.length).toBeGreaterThan(2);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('Risk scoring with failed modules', () => {
  it('never reports low risk when OCR failed', () => {
    const r = computeRisk({ validation: null, tampering: { score: 3, flags: [] }, face: null, ocr: null });
    expect(r.level).not.toBe('low');
    expect(r.factors.map((f) => f.id)).toContain('missing_ocr');
    expect(r.factors.map((f) => f.id)).toContain('missing_face');
  });
});

describe('Tampering heuristics', () => {
  it('flags an outlier ELA region in the photo zone', () => {
    const grid = 10;
    const cells = Array.from({ length: grid }, () => Array(grid).fill(1));
    for (let y = 3; y < 6; y++) for (let x = 0; x < 3; x++) cells[y][x] = 12;
    const flat = cells.flat();
    const mean = flat.reduce((a, b) => a + b) / flat.length;
    const std = Math.sqrt(flat.reduce((a, b) => a + (b - mean) ** 2, 0) / flat.length);
    const res = analyseElaCells({ cells, mean, std }, 'passport');
    expect(res.flags.length).toBeGreaterThan(0);
    expect(res.flags[0].type).toBe('photo_replacement');
    expect(res.score).toBeGreaterThan(30);
  });

  it('returns no flags on uniform error levels', () => {
    const cells = Array.from({ length: 10 }, () => Array(10).fill(2));
    expect(analyseElaCells({ cells, mean: 2, std: 0 }, 'passport').flags).toHaveLength(0);
  });

  it('flags editor software in metadata', () => {
    const res = analyseMetadata({ Software: 'Adobe Photoshop 25.0', DateTimeOriginal: new Date('2026-01-01T10:00:00Z'), ModifyDate: new Date('2026-01-03T10:00:00Z') });
    expect(res.flags.map((f) => f.id)).toContain('meta_editor');
    expect(res.flags.map((f) => f.id)).toContain('meta_modified');
  });
});
