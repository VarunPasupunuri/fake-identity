import { describe, it, expect } from 'vitest';
import { runWatchlistCheck, WATCHLIST_PROVIDERS, DEMO_WATCHLIST, DEMO_WATCHLIST_SOURCE, subjectFromFields, screenSubject, compareRecord, nameSimilarity } from './index.js';
import { fuseEvidence, DECISION } from '../fusion/index.js';
import { buildTd3, parseMrz } from '../validation/mrz.js';
import { validateDocument } from '../validation/index.js';

const demo = (fields, documentType = 'passport') => runWatchlistCheck({ provider: 'demo', fields, documentType });

describe('synthetic fixture', () => {
  it('contains only clearly synthetic records', () => {
    for (const r of DEMO_WATCHLIST) {
      expect(r.recordId).toMatch(/^DEMO-WL-\d{4}$/);
      if (r.documentNumber) expect(r.documentNumber).toMatch(/^ZZ\d{7}$/);
      if (r.fullName) expect(r.fullName).toMatch(/^(TEST SUBJECT|DEMO PERSON) /);
      if (r.nationality) expect(['UTO', 'XXX']).toContain(r.nationality);
      expect(r.note).toMatch(/^Synthetic/);
    }
    expect(DEMO_WATCHLIST_SOURCE).toMatch(/not a government database/);
  });
});

describe('demo provider matching', () => {
  it('clear synthetic subject', async () => {
    const r = await demo({ fullName: 'ANITA SHARMA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1988-04-12' });
    expect(r).toMatchObject({ status: 'clear', provider: 'demo', synthetic: true, confidence: 1, matches: [] });
    expect(r.fieldsUsed).toEqual(['documentNumber', 'fullName', 'dateOfBirth', 'nationality']);
    expect(r.source).toBe(DEMO_WATCHLIST_SOURCE);
  });

  it('exact synthetic identifier match with corroboration → confirmed_match', async () => {
    const r = await demo({ fullName: 'TEST SUBJECT FOXTROT', documentNumber: 'zz-0000007', nationality: 'UTO', dateOfBirth: '2000-02-29' });
    expect(r.status).toBe('confirmed_match');
    expect(r.matches[0]).toMatchObject({ recordId: 'DEMO-WL-0007', matchType: 'document_number', confidence: 0.95, synthetic: true, listType: 'alert' });
    expect(r.matches[0].matchedFields).toEqual(expect.arrayContaining(['documentNumber', 'dateOfBirth', 'nationality', 'fullName']));
    expect(r.explanation).toMatch(/matches record DEMO-WL-0007/);
  });

  it('identifier match with a contradicting attribute is only a possible match', async () => {
    const r = await demo({ fullName: 'TEST SUBJECT FOXTROT', documentNumber: 'ZZ0000007', nationality: 'IND', dateOfBirth: '1999-01-01' });
    expect(r.status).toBe('possible_match');
    expect(r.matches[0]).toMatchObject({ matchType: 'document_number', confidence: 0.45 });
    expect(r.matches[0].contradictions).toEqual(expect.arrayContaining(['dateOfBirth', 'nationality']));
  });

  it('identifier-only record (no name/DOB on file) → possible match, never confirmed', async () => {
    const r = await demo({ documentNumber: 'ZZ0000005', fullName: 'SOMEBODY ELSE', nationality: 'IND' }, 'national_id');
    expect(r.status).toBe('possible_match');
    expect(r.matches[0]).toMatchObject({ recordId: 'DEMO-WL-0005', matchType: 'document_number' });
    expect(r.matches[0].confidence).toBeLessThan(0.9);
  });

  it('possible name-only match is weak and clearly explained', async () => {
    const r = await demo({ fullName: 'Demo Person Delta', documentNumber: 'AB1234567', nationality: 'IND' });
    expect(r.status).toBe('possible_match');
    expect(r.matches[0]).toMatchObject({ recordId: 'DEMO-WL-0004', matchType: 'name_only', confidence: 0.3 });
    expect(r.explanation).toMatch(/requires officer review/);
    expect(r.explanation).toMatch(/name-only/);
  });

  it('name + DOB → possible match with higher confidence than name-only', async () => {
    const r = await demo({ fullName: 'CHARLIE DEMO PERSON', dateOfBirth: '1978-12-24', nationality: 'XXX' });
    expect(r.status).toBe('possible_match');
    expect(r.matches[0]).toMatchObject({ recordId: 'DEMO-WL-0003', matchType: 'name_dob', confidence: 0.8 });
  });

  it('mismatch / no match on similar-but-different identifiers', async () => {
    const r = await demo({ fullName: 'TEST SUBJECT ALPHA', documentNumber: 'ZZ0000009', nationality: 'IND', dateOfBirth: '1991-01-01' });
    expect(r.status).toBe('clear');
    expect(r.matches).toEqual([]);
  });

  it('false-positive prevention: a partially similar name never matches, and a name can never confirm', async () => {
    expect((await demo({ fullName: 'TEST SUBJECT', nationality: 'UTO' })).status).toBe('clear');
    expect((await demo({ fullName: 'ALPHA', dateOfBirth: '1990-01-01', nationality: 'UTO' })).status).toBe('clear');
    // name + DOB + nationality identical to record 0001 but a different document number: still not "confirmed"
    const r = await demo({ fullName: 'TEST SUBJECT ALPHA', dateOfBirth: '1990-01-01', nationality: 'UTO', documentNumber: 'AA1111111' });
    expect(r.status).toBe('possible_match');
    expect(r.matches[0].matchType).toBe('name_dob');
    for (const m of r.matches) expect(m.matchType).not.toBe('document_number');
  });

  it('returns unavailable when no usable identifiers were extracted', async () => {
    const r = await demo({});
    expect(r.status).toBe('unavailable');
    expect(r.fieldsUsed).toEqual([]);
    expect(r.matches).toEqual([]);
  });

  it('is deterministic', async () => {
    const a = await demo({ fullName: 'TEST SUBJECT BRAVO', documentNumber: 'ZZ0000002', nationality: 'UTO' });
    const b = await demo({ fullName: 'TEST SUBJECT BRAVO', documentNumber: 'ZZ0000002', nationality: 'UTO' });
    expect({ ...a, durationMs: 0 }).toEqual({ ...b, durationMs: 0 });
  });
});

describe('provider abstraction', () => {
  it('api placeholder and off both report unavailable, never a match, and never claim a government source', async () => {
    for (const p of ['api', 'off']) {
      const r = await runWatchlistCheck({ provider: p, fields: { documentNumber: 'ZZ0000001', fullName: 'TEST SUBJECT ALPHA' } });
      expect(r.status).toBe('unavailable');
      expect(r.matches).toEqual([]);
      expect(r.source).not.toMatch(/interpol|police|immigration|government watchlist/i);
    }
  });
  it('unknown provider falls back to off (unavailable) instead of throwing', async () => {
    expect((await runWatchlistCheck({ provider: 'nope', fields: { documentNumber: 'ZZ0000001' } })).status).toBe('unavailable');
    expect(Object.keys(WATCHLIST_PROVIDERS).sort()).toEqual(['api', 'demo', 'off']);
  });
});

describe('matching primitives', () => {
  it('nameSimilarity tolerates token order and case', () => {
    expect(nameSimilarity('Anita Sharma', 'SHARMA ANITA')).toBe(1);
    expect(nameSimilarity('ANITA SHARMA', 'ANITA SHARMAA')).toBeGreaterThan(0.9);
    expect(nameSimilarity('ANITA SHARMA', 'RAHUL VERMA')).toBeLessThan(0.5);
  });
  it('subjectFromFields uses visa number and composes names', () => {
    expect(subjectFromFields({ visaNumber: 'vs-22988 11', givenNames: 'Dipak', surname: 'Roy', nationality: 'bgd', dateOfBirth: '1979-03-03' }, 'visa')).toEqual({ documentNumber: 'VS2298811', fullName: 'DIPAK ROY', dateOfBirth: '1979-03-03', nationality: 'BGD', documentType: 'visa' });
  });
  it('compareRecord returns null when nothing aligns', () => {
    expect(compareRecord(subjectFromFields({ fullName: 'X Y', documentNumber: 'Q1' }), DEMO_WATCHLIST[0])).toBeNull();
  });
  it('screenSubject ranks the strongest candidate first', () => {
    const r = screenSubject(subjectFromFields({ documentNumber: 'ZZ0000001', fullName: 'TEST SUBJECT ALPHA', nationality: 'UTO' }), DEMO_WATCHLIST);
    expect(r.status).toBe('confirmed_match');
    expect(r.matches[0].recordId).toBe('DEMO-WL-0001');
  });
});

// ---------- fusion integration ----------
const NOW = new Date('2026-09-10T00:00:00Z');
const REAL = { ocr: 'tesseract', tamper: 'local', face: 'faceapi', watchlist: 'demo' };
function mkOcr(over = {}) {
  const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'UTO', surname: 'FOXTROT', givenNames: 'TEST SUBJECT', documentNumber: 'ZZ0000007', nationality: 'UTO', dateOfBirth: '2000-02-29', gender: 'X', expiryDate: '2031-06-30', ...over });
  const fields = parseMrz(mrz).fields;
  return { fields, vizFields: fields, mrz, confidence: 0.92, provider: 'tesseract', fieldConfidence: {}, rawText: '' };
}
const face = (c) => ({ confidence: c, match: c >= 60, distance: 0.3, documentFaceFound: true, liveFaceFound: true, provider: 'face-api.js' });
const clean = { score: 4, flags: [], evidence: {}, provider: 'local-ela' };
async function fuseWith(ocr, watchlist, f = face(91)) {
  return fuseEvidence({ documentType: 'passport', ocr, validation: validateDocument('passport', ocr, { now: NOW }), tampering: clean, face: f, watchlist, providers: REAL });
}

describe('fusion integration', () => {
  it('confirmed synthetic match → critical evidence, REJECT, and the watchlist+face correlation', async () => {
    const ocr = mkOcr();
    const wl = await demo(ocr.fields);
    expect(wl.status).toBe('confirmed_match');
    const r = await fuseWith(ocr, wl);
    const e = r.evidence.find((x) => x.id === 'watchlist:result');
    expect(e).toMatchObject({ status: 'fail', severity: 'critical', riskContribution: 30 });
    expect(e.value).toMatchObject({ status: 'match', matchType: 'document_number', recordId: 'DEMO-WL-0007', synthetic: true });
    expect(e.explanation).toMatch(/DEMO-WL-0007/);
    expect(r.decision).toBe(DECISION.REJECT);
    expect(r.gates).toContain('critical_evidence');
    expect(r.correlations.map((c) => c.id)).toContain('corr:watchlist_face');
    expect(r.chain.some((l) => l.evidenceId === 'watchlist:result')).toBe(true);
  });

  it('name-only possible match → weak warning (+5), REVIEW, never REJECT', async () => {
    const ocr = mkOcr({ surname: 'DELTA', givenNames: 'DEMO PERSON', documentNumber: 'AB1234567', nationality: 'IND', issuingCountry: 'IND' });
    const wl = await demo(ocr.fields);
    expect(wl.matches[0].matchType).toBe('name_only');
    const r = await fuseWith(ocr, wl);
    const e = r.evidence.find((x) => x.id === 'watchlist:result');
    expect(e).toMatchObject({ status: 'warn', severity: 'low', riskContribution: 5 });
    expect(r.decision).toBe(DECISION.REVIEW);
    expect(r.gates).toContain('watchlist_possible');
    expect(r.rationale).toMatch(/name-only/);
  });

  it('possible match with corroboration → +15 medium warning', async () => {
    const ocr = mkOcr({ surname: 'CHARLIE', givenNames: 'DEMO PERSON', documentNumber: 'AB7654321', dateOfBirth: '1978-12-24', nationality: 'XXX', issuingCountry: 'XXX' });
    const wl = await demo(ocr.fields);
    expect(wl.matches[0].matchType).toBe('name_dob');
    const r = await fuseWith(ocr, wl);
    expect(r.evidence.find((x) => x.id === 'watchlist:result')).toMatchObject({ status: 'warn', severity: 'medium', riskContribution: 15 });
  });

  it('clear result is passing evidence with zero risk and does not block APPROVE', async () => {
    const ocr = mkOcr({ surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', issuingCountry: 'IND', dateOfBirth: '1988-04-12', gender: 'F' });
    const r = await fuseWith(ocr, await demo(ocr.fields));
    expect(r.evidence.find((x) => x.id === 'watchlist:result')).toMatchObject({ status: 'pass', riskContribution: 0 });
    expect(r.decision).toBe(DECISION.APPROVE);
  });

  it('unavailable provider → unavailable evidence, zero risk, no gate', async () => {
    const ocr = mkOcr();
    const wl = await runWatchlistCheck({ provider: 'api', fields: ocr.fields });
    const r = await fuseWith(ocr, wl);
    const e = r.evidence.find((x) => x.source === 'watchlist');
    expect(e).toMatchObject({ id: 'watchlist:unavailable', status: 'unavailable', riskContribution: 0 });
    expect(r.gates).not.toContain('watchlist_possible');
    expect(r.decision).toBe(DECISION.APPROVE);
  });

  it('legacy record / no watchlist input → no watchlist evidence at all (nothing fabricated)', async () => {
    const ocr = mkOcr();
    const r = fuseEvidence({ documentType: 'passport', ocr, validation: validateDocument('passport', ocr, { now: NOW }), tampering: clean, face: face(91), providers: REAL });
    expect(r.evidence.some((e) => e.source === 'watchlist')).toBe(false);
    // the older fusion contract vocabulary is still accepted
    const old = fuseEvidence({ documentType: 'passport', ocr, validation: validateDocument('passport', ocr, { now: NOW }), tampering: clean, face: face(91), watchlist: { status: 'possible', source: 'Demo Watchlist', matches: [{ ref: 'X' }] }, providers: REAL });
    expect(old.evidence.find((e) => e.id === 'watchlist:result')).toMatchObject({ status: 'warn', riskContribution: 15 });
  });
});
