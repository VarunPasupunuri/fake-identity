import { describe, it, expect, vi } from 'vitest';
import { runScreening, STEP_IDS, initialSteps } from './screeningPipeline.js';
import { modules } from '../modules/registry.js';
import { DECISION } from '../modules/fusion/index.js';

// Node has no <canvas>/<img>; the mock providers do not touch them, but they call performance.now — present in Node 22.
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const MOCK = { useMock: true };

/** Collect every onUpdate call per step so status/message sequences can be asserted. */
function recorder() {
  const steps = initialSteps();
  const events = [];
  const onUpdate = (id, patch) => { steps[id] = { ...steps[id], ...patch }; events.push({ id, ...patch }); };
  return { steps, events, onUpdate };
}

describe('screening pipeline → evidence fusion integration', () => {
  it('runs OCR → validation → tampering ∥ face → fusion with mock providers (genuine document)', async () => {
    const rec = recorder();
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK, scenario: 'clean' } }, { onUpdate: rec.onUpdate, log: () => {} });
    expect(out).not.toBeNull();
    for (const id of STEP_IDS) expect(rec.steps[id].status).toBe('done');
    expect(out.ocr.provider).toBe('mock');
    expect(out.fusion.version).toBe(1);
    expect(out.fusion.decision).toBe(DECISION.APPROVE);
    expect(out.decision).toBe(DECISION.APPROVE);
    expect(typeof out.durationMs).toBe('number');
  });

  it('forged scenario reaches REJECT with correlations and passes regions/fields through to evidence', async () => {
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK, scenario: 'suspicious' } }, { log: () => {} });
    expect(out.fusion.decision).toBe(DECISION.REJECT);
    expect(out.fusion.risk.level).toBe('high');
    const photo = out.fusion.evidence.find((e) => e.id === 'tampering:ela_0');
    expect(photo.region).toEqual(out.tampering.flags[0].region);
    expect(photo.field).toBe('photo');
    const text = out.fusion.evidence.find((e) => e.id === 'tampering:ela_1');
    expect(text.field).toBe('expiryDate');
    expect(out.fusion.correlations.map((c) => c.id)).toContain('corr:photo_face'); // photo flag + biometric mismatch
    expect(out.fusion.correlations.map((c) => c.id)).toContain('corr:metadata_ela');
    const face = out.fusion.evidence.find((e) => e.id === 'face:match');
    expect(face.region).toEqual(out.face.documentFaceBox);
  });

  it('projects the fusion result onto the legacy risk shape the UI already consumes (single engine)', async () => {
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK, scenario: 'suspicious' } }, { log: () => {} });
    expect(out.risk).toMatchObject({ engine: 'fusion', score: out.fusion.risk.score, level: out.fusion.risk.level, decision: out.fusion.decision, confidence: out.fusion.confidence.score });
    expect(['accept', 'flag', 'reject']).toContain(out.risk.recommendation);
    expect(out.risk.recommendation).toBe('reject');
    expect(Array.isArray(out.risk.factors)).toBe(true);
    for (const f of out.risk.factors) expect(f).toEqual(expect.objectContaining({ id: expect.any(String), label: expect.any(String), points: expect.any(Number), source: expect.any(String) }));
    expect(out.risk.summary).toMatch(/^Driven by: /);
    expect(out.confidence).toBe(out.fusion.confidence.score);
  });

  it('keeps risk and confidence separate: mock providers lower confidence without changing risk', async () => {
    const clean = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK, scenario: 'clean' } }, { log: () => {} });
    expect(clean.fusion.confidence.usesMockProviders).toBe(true);
    expect(clean.fusion.confidence.components.find((c) => c.id === 'providers').points).toBe(0);
    expect(clean.fusion.risk.score).toBeLessThan(30);
    expect(clean.fusion.rationale).toMatch(/demo providers/);
  });

  it('no live photo: face step is skipped, evidence is unavailable, nothing crashes', async () => {
    const rec = recorder();
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: null, options: { ...MOCK, scenario: 'clean' } }, { onUpdate: rec.onUpdate, log: () => {} });
    expect(rec.steps.face.status).toBe('skipped');
    expect(rec.steps.face.message).toMatch(/no live photo/i);
    expect(out.face).toBeNull();
    const f = out.fusion.evidence.find((e) => e.source === 'face');
    expect(f.status).toBe('unavailable');
    expect(f.riskContribution).toBe(0);
    expect(out.fusion.decision).toBe(DECISION.REVIEW);
    expect(out.fusion.gates).toContain('core_analysis_unavailable');
    expect(out.risk.recommendation).toBe('flag');
  });

  it('tampering provider failure → error step, unavailable evidence, decision is not REJECT', async () => {
    const rec = recorder();
    const failing = { ...modules, tampering: async () => { throw new Error('ELA engine crashed'); } };
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK } }, { modules: failing, onUpdate: rec.onUpdate, log: () => {} });
    expect(rec.steps.tampering.status).toBe('error');
    expect(rec.steps.tampering.error).toBe('ELA engine crashed');
    expect(out.tampering).toBeNull();
    expect(out.fusion.evidence.find((e) => e.id === 'tampering:unavailable').status).toBe('unavailable');
    expect(out.fusion.trust.documentIntegrity.available).toBe(false);
    expect(out.fusion.decision).toBe(DECISION.REVIEW);
    expect(out.fusion.rationale).toMatch(/Forensic analysis was unavailable/);
  });

  it('OCR provider failure → validation cannot run, fusion returns INSUFFICIENT_EVIDENCE, results still returned', async () => {
    const rec = recorder();
    const failing = { ...modules, ocr: async () => { throw new Error('OCR worker failed to load'); } };
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK } }, { modules: failing, onUpdate: rec.onUpdate, log: () => {} });
    expect(out).not.toBeNull();
    expect(rec.steps.ocr.status).toBe('error');
    expect(rec.steps.validation.status).toBe('error');
    expect(rec.steps.risk.status).toBe('done');
    expect(out.fusion.decision).toBe(DECISION.INSUFFICIENT);
    expect(out.fusion.risk.score).toBeLessThan(30); // only the residual from modules that did run (mock forensics/face)
    expect(out.risk).toMatchObject({ recommendation: 'flag', decision: DECISION.INSUFFICIENT });
    expect(out.fusion.evidence.filter((e) => e.status === 'fail')).toEqual([]); // failure is not fraud
  });

  it('records per-step progress messages, including the fusion phases on the risk step', async () => {
    const rec = recorder();
    await runScreening({ documentType: 'visa', documentImage: IMG, liveImage: IMG, options: { ...MOCK } }, { onUpdate: rec.onUpdate, log: () => {} });
    const riskMsgs = rec.events.filter((e) => e.id === 'risk').map((e) => e.message);
    expect(riskMsgs).toEqual(expect.arrayContaining(['Starting', 'Normalising evidence', 'Correlating verification evidence', 'Calculating risk assessment', 'Complete']));
    // Face is skipped for a document without a live photo; every other stage reports progress.
    for (const id of STEP_IDS.filter((x) => x !== 'face')) expect(rec.events.some((e) => e.id === id && e.status === 'running')).toBe(true);
  });

  it('runs the watchlist step in parallel and feeds its result to fusion; record carries it', async () => {
    const rec = recorder();
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK } }, { onUpdate: rec.onUpdate, log: () => {} });
    expect(STEP_IDS).toContain('watchlist');
    expect(rec.steps.watchlist.status).toBe('done');
    expect(out.watchlist).toMatchObject({ provider: 'demo', status: 'clear', synthetic: true });
    expect(out.watchlist.fieldsUsed).toEqual(expect.arrayContaining(['documentNumber', 'fullName']));
    expect(out.fusion.evidence.find((e) => e.id === 'watchlist:result')).toMatchObject({ status: 'pass', riskContribution: 0 });
    expect(out.providers.watchlist).toBe('demo');
  });

  it('watchlist provider failure → error step, unavailable evidence, decision unchanged in kind', async () => {
    const rec = recorder();
    const failing = { ...modules, watchlist: async () => { throw new Error('watchlist service timeout'); } };
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK } }, { modules: failing, onUpdate: rec.onUpdate, log: () => {} });
    expect(rec.steps.watchlist.status).toBe('error');
    expect(out.watchlist).toBeNull();
    expect(out.fusion.evidence.some((e) => e.source === 'watchlist')).toBe(false); // null input → nothing fabricated
    expect(out.fusion.decision).toBe(DECISION.APPROVE);
  });

  it('watchlist "off" provider reports unavailable evidence with zero risk', async () => {
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK, providers: { watchlist: 'off' } } }, { log: () => {} });
    expect(out.watchlist.status).toBe('unavailable');
    expect(out.fusion.evidence.find((e) => e.id === 'watchlist:unavailable')).toMatchObject({ status: 'unavailable', riskContribution: 0 });
  });

  it('honours cancellation between stages', async () => {
    let calls = 0;
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK } }, { isCancelled: () => ++calls >= 1, log: () => {} });
    expect(out).toBeNull();
  });

  it('never fabricates evidence: only sources that ran appear', async () => {
    const out = await runScreening({ documentType: 'driving_license', documentImage: IMG, liveImage: null, options: { ...MOCK } }, { log: () => {} });
    const sources = new Set(out.fusion.evidence.map((e) => e.source));
    expect([...sources].sort()).toEqual(['barcode', 'classification', 'face', 'identity', 'issuer', 'ocr', 'tampering', 'validation', 'watchlist']);
    // Modules that could not produce a result say so instead of passing or failing.
    expect(out.fusion.evidence.find((e) => e.source === 'face')).toMatchObject({ status: 'unavailable', riskContribution: 0 });
    expect(out.fusion.evidence.find((e) => e.source === 'issuer')).toMatchObject({ id: 'issuer:unavailable', status: 'unavailable', riskContribution: 0 });
    expect(out.fusion.evidence.find((e) => e.source === 'identity')).toMatchObject({ status: 'pass', riskContribution: 0 });
  });

  it('a module whose provider is missing contributes no evidence at all', async () => {
    const noBarcode = { ...modules, barcode: async () => null };
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { ...MOCK } }, { modules: noBarcode, log: () => {} });
    expect(out.fusion.evidence.some((e) => e.source === 'barcode')).toBe(false);
  });
});

describe('universal document screening (workflows A–E)', () => {
  const run = (documentType, opts = {}) => runScreening({ documentType, documentImage: IMG, liveImage: opts.live === false ? null : IMG, options: { useMock: true, scenario: opts.scenario || 'clean', mockDocument: opts.mockDocument, history: opts.history || [] } }, { log: () => {}, onUpdate: opts.onUpdate });

  it('A — passport: classification, MRZ, validation, integrity, face, fusion', async () => {
    const out = await run('auto', { mockDocument: 'passport' });
    expect(out.documentType).toBe('passport');
    expect(out.classification).toMatchObject({ type: 'passport', basis: 'mrz' });
    expect(out.ocr.mrz).toBeTruthy();
    expect(out.validation.checks.some((c) => c.id === 'mrz_doc_number')).toBe(true);
    expect(out.face).not.toBeNull();
    expect(out.fusion.decision).toBe(DECISION.APPROVE);
  });

  it('B — birth certificate: classified, validated by its own rules, face not applicable', async () => {
    const rec = recorder();
    const out = await run('auto', { mockDocument: 'birth_certificate', live: false, onUpdate: rec.onUpdate });
    expect(out.documentType).toBe('birth_certificate');
    expect(out.documentCategory).toBe('civil');
    expect(out.ocr.fields.childName).toBe('AARAV DEMO KUMAR');
    expect(out.validation.checks.some((c) => c.id === 'rule_dateOfBirth_before_registrationDate')).toBe(true);
    expect(rec.steps.face.status).toBe('skipped');
    expect(rec.steps.face.message).toMatch(/not applicable/i);
    expect(out.fusion.evidence.find((e) => e.source === 'face').id).toBe('face:not_applicable');
    expect(out.fusion.decision).toBe(DECISION.APPROVE);
    expect(out.barcode.status).toBe('detected');
  });

  it('C — death certificate with contradictory dates is not approved', async () => {
    const out = await run('auto', { mockDocument: 'death_certificate', scenario: 'inconsistent_dates', live: false });
    expect(out.documentType).toBe('death_certificate');
    expect(out.fusion.decision).not.toBe(DECISION.APPROVE);
    expect(out.validation.checks.find((c) => c.id === 'rule_dateOfBirth_before_dateOfDeath').status).toBe('fail');
  });

  it('D — altered marks memo: academic rules catch the arithmetic', async () => {
    const out = await run('auto', { mockDocument: 'marks_memo', scenario: 'suspicious', live: false });
    expect(out.documentType).toBe('marks_memo');
    expect(out.ocr.fields.rollNumber).toBe('21DEMO0512');
    expect(out.validation.checks.find((c) => c.id === 'marks_total_consistent').status).toBe('fail');
    expect(out.fusion.decision).not.toBe(DECISION.APPROVE);
  });

  it('E — unknown document: generic screening, never rejected for being unknown', async () => {
    const out = await run('auto', { mockDocument: 'generic_document', scenario: 'unknown', live: false });
    expect(out.documentType).toBe('generic_document');
    expect(out.classification.basis).toBe('fallback');
    expect(out.fusion.decision).not.toBe(DECISION.REJECT);
    expect(out.validation.failed).toBe(0);
  });

  it('an officer-selected type overrides detection and applies that profile\'s rules', async () => {
    const out = await run('official_certificate', { mockDocument: 'birth_certificate', live: false });
    expect(out.documentType).toBe('official_certificate');
    expect(out.classification.overridden).toBe(true);
  });

  it('a category selection keeps detection inside that category', async () => {
    const out = await run('category:academic', { mockDocument: 'degree_certificate', live: false });
    expect(out.documentCategory).toBe('academic');
  });

  it('feeds prior screenings into identity correlation', async () => {
    const history = [{ id: 'PRIOR1', subjectName: 'ANITA SHARMA', documentNumber: 'M8412345', documentType: 'passport', createdAt: '2026-01-01T00:00:00Z', decision: 'accept', ocr: { fields: { dateOfBirth: '1988-04-12' } } }];
    const out = await run('auto', { mockDocument: 'passport', history });
    expect(out.identity.links.map((l) => l.screeningId)).toContain('PRIOR1');
    expect(out.fusion.evidence.find((e) => e.source === 'identity').status).toBe('warn');
  });

  it('issuer verification stays unavailable unless a provider confirms the record', async () => {
    const out = await run('auto', { mockDocument: 'birth_certificate', live: false });
    expect(out.issuer.status).toBe('unavailable');
    expect(out.fusion.decision).not.toBe('verified');
    const verified = await runScreening({ documentType: 'auto', documentImage: IMG, liveImage: null, options: { useMock: true, mockDocument: 'birth_certificate', providers: { issuer: 'synthetic' } } }, { log: () => {} });
    expect(verified.issuer).toMatchObject({ status: 'verified', synthetic: true });
    expect(verified.fusion.decision).toBe('verified');
  });

  it('only the modules relevant to the profile run (no MRZ or face work for a certificate)', async () => {
    const rec = recorder();
    await run('auto', { mockDocument: 'marks_memo', live: false, onUpdate: rec.onUpdate });
    expect(rec.steps.face.status).toBe('skipped');
    expect(rec.steps.barcode.status).toBe('done');
    expect(rec.steps.classification.status).toBe('done');
  });
});
