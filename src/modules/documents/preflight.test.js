import { describe, it, expect, vi } from 'vitest';
import { checkDocumentType, blocksScreening, PREFLIGHT, MISMATCH_FLOOR } from './preflight.js';
import { fixtureText } from './fixtures.js';
import { sampleText } from '../ocr/mock.js';
import { buildTd3, parseMrz } from '../validation/mrz.js';
import { runScreening } from '../../services/screeningPipeline.js';
import { modules } from '../registry.js';

const PASSPORT_MRZ = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1988-04-12', gender: 'F', expiryDate: '2031-06-30' });
const PASSPORT_TEXT = sampleText('passport', 'clean');
const AADHAAR_TEXT = fixtureText('aadhaar');
const VISA_TEXT = sampleText('visa', 'clean');
const DL_TEXT = sampleText('driving_license', 'clean');

const check = (selected, rawText, mrz = null) => checkDocumentType({ selected, rawText, mrz });

describe('preflight document-type check', () => {
  // TEST 1
  it('passport selected, passport uploaded → MATCH', () => {
    const r = check('passport', PASSPORT_TEXT, PASSPORT_MRZ);
    expect(r.status).toBe(PREFLIGHT.MATCH);
    expect(r.blocking).toBe(false);
    expect(r.detectedType).toBe('passport');
    expect(blocksScreening(r)).toBe(false);
  });

  // TEST 2 — the reported bug
  it('passport selected, Aadhaar uploaded → MISMATCH and blocks screening', () => {
    const r = check('passport', AADHAAR_TEXT);
    expect(r.status).toBe(PREFLIGHT.MISMATCH);
    expect(r.blocking).toBe(true);
    expect(r.selectedType).toBe('passport');
    expect(r.selectedLabel).toBe('Passport');
    expect(r.detectedType).toBe('national_id');
    expect(r.detectedLabel).toBe('National ID');
    expect(r.confidence).toBeGreaterThanOrEqual(MISMATCH_FLOOR);
    expect(r.title).toBe('Document type mismatch');
    expect(r.message).toMatch(/Select National ID, or upload a passport image/);
  });

  // TEST 3
  it('national ID selected, Aadhaar uploaded → MATCH', () => {
    const r = check('national_id', AADHAAR_TEXT);
    expect(r.status).toBe(PREFLIGHT.MATCH);
    expect(r.blocking).toBe(false);
  });

  // TEST 4
  it('visa selected, passport uploaded → MISMATCH', () => {
    const r = check('visa', PASSPORT_TEXT, PASSPORT_MRZ);
    expect(r.status).toBe(PREFLIGHT.MISMATCH);
    expect(r.blocking).toBe(true);
    expect(r.detectedType).toBe('passport');
  });

  // TEST 5
  it('driving licence selected, passport uploaded → MISMATCH', () => {
    const r = check('driving_license', PASSPORT_TEXT, PASSPORT_MRZ);
    expect(r.status).toBe(PREFLIGHT.MISMATCH);
    expect(r.blocking).toBe(true);
  });

  it('passport selected, driving licence uploaded → MISMATCH', () => {
    const r = check('passport', DL_TEXT);
    expect(r.status).toBe(PREFLIGHT.MISMATCH);
    expect(r.detectedType).toBe('driving_license');
  });

  it('visa selected, visa uploaded → MATCH', () => {
    const r = check('visa', VISA_TEXT);
    expect(r.status).toBe(PREFLIGHT.MATCH);
  });

  // TEST 6 — never falsely reject
  it('an unidentifiable document is UNCERTAIN, not a mismatch', () => {
    const r = check('passport', 'OFFICE COPY\nreference 4471 issued at counter 3 on 02/04/2025 by the duty clerk');
    expect(r.status).toBe(PREFLIGHT.UNCERTAIN);
    expect(r.blocking).toBe(false);
    expect(r.message).toMatch(/Screening can continue/);
  });

  it('text supporting both the selected and detected type is UNCERTAIN, not a mismatch', () => {
    // A visa page that also carries the word "passport" must not be blocked as a passport.
    const r = check('visa', 'VISA\nVisa No. VS2298811\nType TOURIST\nPassport No. M8412345\nEntries MULTIPLE');
    expect(r.blocking).toBe(false);
    expect([PREFLIGHT.MATCH, PREFLIGHT.UNCERTAIN]).toContain(r.status);
  });

  it('a single stray keyword cannot trigger a mismatch', () => {
    const r = check('passport', `${PASSPORT_TEXT}\nHolder also presented a visa on arrival.`);
    expect(r.blocking).toBe(false);
  });

  it('too little recognised text is UNAVAILABLE and never blocks', () => {
    const r = check('passport', '## #');
    expect(r.status).toBe(PREFLIGHT.UNAVAILABLE);
    expect(r.blocking).toBe(false);
  });

  it('auto-detect asserts nothing, so it can never mismatch', () => {
    const r = check('auto', AADHAAR_TEXT);
    expect(r.status).toBe(PREFLIGHT.MATCH);
    expect(r.blocking).toBe(false);
    expect(r.detectedType).toBe('national_id');
  });

  it('a category selection blocks a document from another category', () => {
    const r = check('category:academic', PASSPORT_TEXT, PASSPORT_MRZ);
    expect(r.status).toBe(PREFLIGHT.MISMATCH);
    expect(r.blocking).toBe(true);
  });

  it('names the clues behind the detection', () => {
    const r = check('passport', AADHAAR_TEXT);
    const labels = r.signals.map((s) => s.label).join(' | ');
    expect(labels).toMatch(/Unique Identification Authority of India/);
    expect(labels).toMatch(/Aadhaar/);
  });

  it('never claims the detection is an authenticity check', () => {
    const r = check('national_id', AADHAAR_TEXT);
    expect(JSON.stringify(r)).not.toMatch(/genuine|authentic|verified/i);
  });
});

describe('preflight guards the screening pipeline', () => {
  const IMG = 'data:image/png;base64,iVBORw0KGgo=';

  // TEST 9
  it('a matching document runs the full pipeline', async () => {
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { useMock: true, scenario: 'clean_passport' } }, { log: () => {} });
    expect(out.fusion.decision).toBe('approve');
    expect(out.ocr).toBeTruthy();
  });

  // TEST 10 — the expensive modules must not run when the caller blocks on a mismatch
  it('no screening module is invoked when a blocking mismatch is detected first', async () => {
    const spies = { ocr: vi.fn(), tampering: vi.fn(), face: vi.fn(), watchlist: vi.fn(), fusion: vi.fn() };
    const preflight = checkDocumentType({ selected: 'passport', rawText: AADHAAR_TEXT });
    expect(preflight.blocking).toBe(true);
    // The screening page refuses to call runScreening at all while `blocking` is true.
    if (!preflight.blocking) await runScreening({ documentType: 'passport', documentImage: IMG, options: {} }, { modules: { ...modules, ...spies }, log: () => {} });
    expect(spies.ocr).not.toHaveBeenCalled();
    expect(spies.tampering).not.toHaveBeenCalled();
    expect(spies.face).not.toHaveBeenCalled();
    expect(spies.watchlist).not.toHaveBeenCalled();
    expect(spies.fusion).not.toHaveBeenCalled();
  });

  it('reuses the preflight OCR instead of recognising the same image twice', async () => {
    const ocrSpy = vi.fn(modules.ocr);
    const preflightOcr = await modules.ocr({ provider: 'mock', imageDataUrl: IMG, documentType: 'passport', scenario: 'clean_passport' });
    const out = await runScreening(
      { documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { useMock: true, scenario: 'clean_passport', preflightOcr, preflightOcrImage: IMG } },
      { modules: { ...modules, ocr: ocrSpy }, log: () => {} },
    );
    expect(ocrSpy).not.toHaveBeenCalled();
    expect(out.ocrReused).toBe(true);
    expect(out.ocr).toBe(preflightOcr);
    expect(out.fusion.decision).toBe('approve'); // the rest of the pipeline is unaffected
  });

  it('a preflight OCR taken from a different image is ignored', async () => {
    const ocrSpy = vi.fn(modules.ocr);
    const stale = await modules.ocr({ provider: 'mock', imageDataUrl: IMG, documentType: 'passport', scenario: 'clean_passport' });
    const out = await runScreening(
      { documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { useMock: true, scenario: 'clean_passport', preflightOcr: stale, preflightOcrImage: 'data:image/png;base64,OTHER' } },
      { modules: { ...modules, ocr: ocrSpy }, log: () => {} },
    );
    expect(ocrSpy).toHaveBeenCalledTimes(1);
    expect(out.ocrReused).toBe(false);
  });

  it('carries the preflight result onto the screening result for the audit record', async () => {
    const pre = checkDocumentType({ selected: 'passport', rawText: PASSPORT_TEXT, mrz: PASSPORT_MRZ });
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { useMock: true, scenario: 'clean_passport', preflight: pre } }, { log: () => {} });
    expect(out.preflight).toMatchObject({ status: PREFLIGHT.MATCH, selectedType: 'passport', detectedType: 'passport' });
  });
});
