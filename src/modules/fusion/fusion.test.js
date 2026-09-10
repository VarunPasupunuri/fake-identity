import { describe, it, expect } from 'vitest';
import { fuseEvidence, DECISION, fromLegacyDecision, toLegacyDecision, normaliseDecision } from './index.js';
import { buildTd3, parseMrz } from '../validation/mrz.js';
import { validateDocument } from '../validation/index.js';
import { computeRisk } from '../risk/index.js';

// ---------- fixtures (all synthetic) ----------
const NOW = new Date('2026-09-10T00:00:00Z');
const REAL = { ocr: 'tesseract', tamper: 'local', face: 'faceapi' };
const BASE = { docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1997-03-12', gender: 'F', expiryDate: '2031-06-30' };

function mkOcr(over = {}, { viz = {}, confidence = 0.92, provider = 'tesseract' } = {}) {
  const mrz = buildTd3({ ...BASE, ...over });
  const fields = parseMrz(mrz).fields;
  return { fields, vizFields: { ...fields, ...viz }, mrz, confidence, provider, fieldConfidence: Object.fromEntries(Object.keys(fields).map((k) => [k, confidence])), rawText: '' };
}
const mkValidation = (ocr, type = 'passport') => validateDocument(type, ocr, { now: NOW });
const clean = (provider = 'local-ela') => ({ score: 4, flags: [], evidence: {}, provider });
const tamperFlag = ({ id = 'ela_0', type = 'text_manipulation', severity = 'medium', field, region = { x: 0.5, y: 0.5, w: 0.2, h: 0.1 }, label = 'Inconsistent compression in text area' } = {}) => ({ id, type, severity, label, detail: 'ELA 3.4σ above average', region, field });
const mkTamper = (score, flags = [], provider = 'local-ela') => ({ score, flags, evidence: {}, provider });
const mkFace = (confidence, { docFound = true, liveFound = true, provider = 'face-api.js' } = {}) => ({ confidence, match: confidence >= 60, distance: +(1 - confidence / 100).toFixed(2), documentFaceFound: docFound, liveFaceFound: liveFound, provider });

function fuse(parts, { type = 'passport', providers = REAL, ...rest } = {}) {
  const ocr = parts.ocr === undefined ? mkOcr() : parts.ocr;
  const validation = parts.validation === undefined ? (ocr ? mkValidation(ocr, type) : null) : parts.validation;
  return fuseEvidence({ documentType: type, ocr, validation, tampering: parts.tampering === undefined ? clean() : parts.tampering, face: parts.face === undefined ? mkFace(91) : parts.face, providers, ...rest });
}
const ids = (r) => r.evidence.map((e) => e.id);
const failing = (r) => r.evidence.filter((e) => e.status === 'fail').map((e) => e.id);

// ---------- 1. completely valid ----------
describe('1. completely valid document', () => {
  const r = fuse({});
  it('approves with low risk and high confidence', () => {
    expect(r.decision).toBe(DECISION.APPROVE);
    expect(r.risk.score).toBeLessThan(30);
    expect(r.confidence.score).toBeGreaterThanOrEqual(90);
    expect(failing(r)).toEqual([]);
  });
  it('produces a supporting identity-consistency correlation only', () => {
    expect(r.correlations.map((c) => c.id)).toEqual(['corr:identity_consistent']);
    expect(r.correlations[0].riskContribution).toBe(0);
  });
  it('trust profile has every dimension available', () => {
    for (const k of ['identityConsistency', 'documentValidity', 'documentIntegrity', 'biometricConsistency', 'extractionConfidence', 'overall']) expect(r.trust[k].available).toBe(true);
    expect(r.trust.documentValidity.score).toBe(100);
    expect(r.trust.identityConsistency.score).toBe(100);
  });
  it('rationale names what passed', () => {
    expect(r.rationale).toMatch(/MRZ checks passed/);
    expect(r.rationale).toMatch(/Face verification passed/);
    expect(r.rationale).not.toMatch(/AI detected/i);
  });
  it('is deterministic', () => { expect(JSON.stringify(fuse({}))).toBe(JSON.stringify(r)); });
});

// ---------- 2. expired ----------
describe('2. expired document', () => {
  const r = fuse({ ocr: mkOcr({ expiryDate: '2024-01-31' }) });
  it('rejects on critical expiry evidence with a chain entry', () => {
    expect(r.decision).toBe(DECISION.REJECT);
    expect(r.gates).toContain('critical_evidence');
    expect(r.reasons).toContain('validation:expiry_not_passed');
    const link = r.chain.find((c) => c.evidenceId === 'validation:expiry_not_passed');
    expect(link.points).toBe(25);
    expect(link.steps.some((s) => /Validation rule: expiry_not_passed/.test(s.label))).toBe(true);
  });
  it('keeps confidence high — an expired document is a confident finding', () => { expect(r.confidence.score).toBeGreaterThanOrEqual(90); });
  it('counterfactual: clearing the expiry finding would allow approval', () => {
    expect(r.counterfactual.potentialDecision).toBe(DECISION.APPROVE);
    expect(r.counterfactual.pivotal.map((p) => p.id)).toContain('validation:expiry_not_passed');
  });
});

// ---------- 3. MRZ mismatch ----------
describe('3. MRZ vs visual mismatch (no tampering)', () => {
  const r = fuse({ ocr: mkOcr({}, { viz: { dateOfBirth: '1998-03-12' } }) });
  it('carries both observed values on the evidence item', () => {
    const e = r.evidence.find((x) => x.id === 'validation:mrz_viz_dateOfBirth');
    expect(e.status).toBe('fail');
    expect(e.value).toEqual({ visual: '1998-03-12', mrz: '1997-03-12' });
    expect(e.field).toBe('dateOfBirth');
  });
  it('decides REVIEW (Case 3: inconsistency alone is not conclusive) with no tampering correlation', () => {
    expect(r.decision).toBe(DECISION.REVIEW);
    expect(r.gates).toContain('failing_evidence');
    expect(r.correlations.filter((c) => c.kind === 'aggravating')).toEqual([]);
  });
  it('chain shows printed vs MRZ values and the rule', () => {
    const link = r.chain.find((c) => c.evidenceId === 'validation:mrz_viz_dateOfBirth');
    expect(link.steps.map((s) => s.label)).toEqual(expect.arrayContaining(['MRZ inconsistency', 'Printed value: 1998-03-12', 'MRZ value: 1997-03-12', 'Validation rule: mrz_viz_dateOfBirth']));
  });
});

// ---------- 4. tampering only ----------
describe('4. tampering signal only', () => {
  const r = fuse({ tampering: mkTamper(62, [tamperFlag({ severity: 'high', type: 'photo_replacement', field: 'photo', label: 'Possible photo replacement' })]) });
  it('goes to REVIEW (face matches, so the photo anomaly is conflicting, not critical)', () => {
    expect(r.decision).toBe(DECISION.REVIEW);
    expect(r.correlations.map((c) => c.id)).toContain('corr:photo_face_conflict');
    expect(r.correlations.find((c) => c.id === 'corr:photo_face_conflict').riskContribution).toBe(0);
  });
  it('integrity trust drops while validity stays 100', () => {
    expect(r.trust.documentIntegrity.score).toBeLessThan(40);
    expect(r.trust.documentValidity.score).toBe(100);
  });
});

// ---------- 5. face mismatch ----------
describe('5. face mismatch', () => {
  const r = fuse({ face: mkFace(38) });
  it('marks biometric evidence as mismatch with high severity', () => {
    const f = r.evidence.find((e) => e.id === 'face:match');
    expect(f.value.state).toBe('mismatch');
    expect(f.status).toBe('fail');
    expect(f.riskContribution).toBe(Math.round(((100 - 38) / 100) * 35) + 10);
  });
  it('rejects on a clear biometric mismatch (Case 5)', () => {
    expect(r.decision).toBe(DECISION.REJECT);
    expect(r.gates).toContain('biometric_mismatch');
    expect(r.trust.biometricConsistency).toEqual(expect.objectContaining({ available: true, score: 38 }));
    expect(r.rationale).toMatch(/does not match the document photo/);
  });
});

// ---------- 6 & 7. multi-signal, high risk / high confidence ----------
describe('6/7. multiple simultaneous signals — high risk, high confidence', () => {
  const r = fuse({
    ocr: mkOcr({}, { viz: { dateOfBirth: '1998-03-12' } }),
    tampering: mkTamper(70, [tamperFlag({ id: 'ela_0', type: 'photo_replacement', severity: 'high', field: 'photo', label: 'Possible photo replacement' }), tamperFlag({ id: 'ela_1', field: 'dateOfBirth' }), { id: 'meta_editor', type: 'metadata', severity: 'high', label: 'Edited with GIMP 2.10', detail: 'editor in metadata' }]),
    face: mkFace(35),
  });
  it('rejects with high risk and still high confidence', () => {
    expect(r.decision).toBe(DECISION.REJECT);
    expect(r.risk.level).toBe('high');
    expect(r.risk.score).toBeGreaterThanOrEqual(60);
    expect(r.confidence.score).toBeGreaterThanOrEqual(80);
  });
  it('detects three distinct correlations', () => {
    expect(r.correlations.map((c) => c.id)).toEqual(expect.arrayContaining(['corr:mrz_field_tamper:dateOfBirth', 'corr:photo_face', 'corr:metadata_ela']));
  });
  it('caps correlation points and never exceeds 100', () => {
    expect(r.risk.correlationPoints).toBeLessThanOrEqual(30);
    expect(r.risk.score).toBeLessThanOrEqual(100);
  });
  it('every chain entry references an existing evidence or correlation id', () => {
    const all = new Set([...ids(r), ...r.correlations.map((c) => c.id)]);
    for (const link of r.chain) { expect(all.has(link.evidenceId)).toBe(true); for (const s of link.steps) expect(all.has(s.evidenceId)).toBe(true); }
    expect(r.chain.reduce((s, c) => s + c.points, 0)).toBeGreaterThanOrEqual(r.risk.score);
  });
});

// ---------- 8. high risk / low confidence ----------
describe('8. high risk but low confidence → INSUFFICIENT_EVIDENCE', () => {
  // Expired + MRZ mismatch + biometric mismatch, but reported by mock providers with weak OCR and no forensics:
  // very suspicious, yet the analysis itself cannot be stood behind.
  const r = fuse({ ocr: mkOcr({ expiryDate: '2024-01-31' }, { viz: { dateOfBirth: '1998-03-12' }, confidence: 0.55, provider: 'mock' }), tampering: null, face: mkFace(35, { provider: 'mock' }) }, { providers: { ocr: 'mock', tamper: 'mock', face: 'mock' } });
  it('does not reject when the analysis cannot be stood behind', () => {
    expect(r.risk.score).toBeGreaterThanOrEqual(60);
    expect(r.confidence.score).toBeLessThan(60);
    expect(r.decision).toBe(DECISION.INSUFFICIENT);
    expect(r.gates).toContain('high_risk_low_confidence');
  });
  it('risk and confidence are reported independently', () => {
    expect(r.risk.score).not.toBe(r.confidence.score);
    expect(r.rationale).toMatch(/confidence is \d+%/);
  });
});

// ---------- 9. missing face ----------
describe('9. missing face evidence', () => {
  const skipped = fuse({ face: null });
  const notFound = fuse({ face: mkFace(0, { docFound: false }) });
  it('face absence is unavailable evidence, not a failure, and adds no risk', () => {
    for (const r of [skipped, notFound]) {
      const f = r.evidence.find((e) => e.source === 'face');
      expect(f.status).toBe('unavailable');
      expect(f.riskContribution).toBe(0);
      expect(r.risk.contributions.some((c) => c.source === 'face')).toBe(false);
      expect(r.trust.biometricConsistency.available).toBe(false);
      expect(r.trust.biometricConsistency.score).toBeNull();
    }
  });
  it('lowers confidence and blocks APPROVE because a core module is unavailable', () => {
    expect(skipped.confidence.score).toBeLessThan(fuse({}).confidence.score);
    expect(skipped.decision).toBe(DECISION.REVIEW);
    expect(skipped.gates).toContain('core_analysis_unavailable');
    expect(notFound.decision).toBe(DECISION.REVIEW);
  });
});

// ---------- 10. tampering provider failure ----------
describe('10. tampering provider failure', () => {
  const r = fuse({ tampering: null });
  it('is reported as unavailable with zero risk and an unavailable integrity dimension', () => {
    const t = r.evidence.find((e) => e.id === 'tampering:unavailable');
    expect(t.status).toBe('unavailable');
    expect(r.risk.bySource.tampering).toBeUndefined();
    expect(r.trust.documentIntegrity.available).toBe(false);
    expect(r.rationale).toMatch(/Forensic analysis was unavailable/);
  });
  it('does not become fraud: decision is REVIEW, not REJECT', () => { expect(r.decision).toBe(DECISION.REVIEW); expect(r.gates).toContain('core_analysis_unavailable'); });
});

// ---------- 11. OCR uncertainty ----------
describe('11. OCR uncertainty', () => {
  const r = fuse({ ocr: mkOcr({}, { confidence: 0.42 }) });
  it('adds the documented low-confidence risk and drags confidence down', () => {
    const o = r.evidence.find((e) => e.id === 'ocr:confidence');
    expect(o.status).toBe('fail');
    expect(o.riskContribution).toBe(6);
    expect(r.confidence.components.find((c) => c.id === 'ocr').points).toBe(Math.round(30 * 0.42));
    expect(r.trust.extractionConfidence.score).toBe(42);
  });
});

// ---------- 12. insufficient evidence ----------
describe('12. insufficient evidence (OCR failed)', () => {
  const r = fuse({ ocr: null, validation: null, tampering: null, face: null });
  it('returns INSUFFICIENT_EVIDENCE with zero risk and no fabricated evidence', () => {
    expect(r.decision).toBe(DECISION.INSUFFICIENT);
    expect(r.risk.score).toBe(0);
    expect(r.evidence.every((e) => e.status === 'unavailable')).toBe(true);
    expect(r.trust.overall.available).toBe(false);
    expect(r.counterfactual.potentialDecision).toBeNull();
    expect(r.counterfactual.requires.length).toBeGreaterThan(0);
  });
  it('mock providers alone cap confidence and block APPROVE', () => {
    const m = fuse({ ocr: mkOcr({}, { provider: 'mock' }), tampering: clean('mock'), face: mkFace(91, { provider: 'mock' }) }, { providers: { ocr: 'mock', tamper: 'mock', face: 'mock' } });
    expect(m.confidence.usesMockProviders).toBe(true);
    expect(m.confidence.components.find((c) => c.id === 'providers').points).toBe(0);
    expect(m.rationale).toMatch(/demo providers/);
  });
});

// ---------- 13. correlated MRZ + tampering ----------
describe('13. correlated MRZ inconsistency + DOB-region tampering', () => {
  const r = fuse({ ocr: mkOcr({}, { viz: { dateOfBirth: '1998-03-12' } }), tampering: mkTamper(45, [tamperFlag({ field: 'dateOfBirth' })]) });
  it('creates the critical correlation referencing both evidence ids', () => {
    const c = r.correlations.find((x) => x.id === 'corr:mrz_field_tamper:dateOfBirth');
    expect(c).toBeDefined();
    expect(c.refs).toEqual(['validation:mrz_viz_dateOfBirth', 'tampering:ela_0']);
    expect(c.riskContribution).toBe(12);
    expect(c.explanation).toMatch(/1998-03-12/);
    expect(c.explanation).toMatch(/1997-03-12/);
  });
  it('is stronger than either signal alone', () => {
    const mrzOnly = fuse({ ocr: mkOcr({}, { viz: { dateOfBirth: '1998-03-12' } }) });
    const tamperOnly = fuse({ tampering: mkTamper(45, [tamperFlag({ field: 'dateOfBirth' })]) });
    expect(r.risk.score).toBeGreaterThan(mrzOnly.risk.score);
    expect(r.risk.score).toBeGreaterThan(tamperOnly.risk.score);
    expect(r.rationale).toMatch(/Correlated evidence: mrz inconsistency overlaps a tampering signal on date of birth/i);
  });
});

// ---------- 14. no false correlation ----------
describe('14. no false correlation', () => {
  it('a tampering flag on a different field does not correlate with a DOB mismatch', () => {
    const r = fuse({ ocr: mkOcr({}, { viz: { dateOfBirth: '1998-03-12' } }), tampering: mkTamper(45, [tamperFlag({ field: 'expiryDate' })]) });
    expect(r.correlations.filter((c) => c.kind === 'aggravating')).toEqual([]);
  });
  it('an untagged region never correlates with anything', () => {
    const r = fuse({ ocr: mkOcr({}, { viz: { dateOfBirth: '1998-03-12' } }), tampering: mkTamper(45, [tamperFlag({ field: undefined })]) });
    expect(r.correlations.filter((c) => c.kind === 'aggravating')).toEqual([]);
  });
  it('photo flag with no face result yields no photo correlation', () => {
    const r = fuse({ tampering: mkTamper(50, [tamperFlag({ type: 'photo_replacement', field: 'photo', severity: 'high' })]), face: null });
    expect(r.correlations.some((c) => c.id.startsWith('corr:photo'))).toBe(false);
  });
});

// ---------- 15. counterfactual ----------
describe('15. counterfactual generation', () => {
  it('REVIEW → APPROVE when the cited findings are verified', () => {
    const r = fuse({ tampering: mkTamper(30, [tamperFlag({ severity: 'medium' })]) });
    expect(r.decision).toBe(DECISION.REVIEW);
    expect(r.counterfactual.current).toBe(DECISION.REVIEW);
    expect(r.counterfactual.potentialDecision).toBe(DECISION.APPROVE);
    expect(r.counterfactual.resolution).toMatch(/could move to APPROVE/);
    expect(r.counterfactual.reasons.map((x) => x.id)).toEqual(expect.arrayContaining(['tampering:ela_0']));
  });
  it('REJECT with two findings: clearing one is pivotal to REVIEW, clearing all reaches APPROVE', () => {
    const r = fuse({ ocr: mkOcr({ expiryDate: '2024-01-31' }, { viz: { dateOfBirth: '1998-03-12' } }) });
    expect(r.decision).toBe(DECISION.REJECT);
    const expiry = r.counterfactual.pivotal.find((p) => p.id === 'validation:expiry_not_passed');
    expect(expiry.decisionIfCleared).toBe(DECISION.REVIEW); // MRZ mismatch still needs review
    expect(r.counterfactual.potentialDecision).toBe(DECISION.APPROVE); // clearing everything cited → APPROVE
  });
  it('APPROVE explains what would change it, with no potential decision', () => {
    const r = fuse({});
    expect(r.counterfactual.potentialDecision).toBeNull();
    expect(r.counterfactual.resolution).toMatch(/REVIEW or REJECT/);
  });
});

// ---------- 16. evidence chain traceability ----------
describe('16. evidence chain traceability', () => {
  const r = fuse({ face: mkFace(41) });
  it('face risk traces to the similarity value and detector', () => {
    const link = r.chain.find((c) => c.evidenceId === 'face:match');
    expect(link.points).toBeGreaterThan(0);
    expect(link.steps.map((s) => s.label)).toEqual(expect.arrayContaining([expect.stringMatching(/Face similarity: 41%/), 'Detector: face-api.js']));
  });
  it('chain totals equal the risk contributions list', () => {
    expect(r.chain.map((c) => c.points)).toEqual(r.risk.contributions.map((c) => c.points));
  });
});

// ---------- invariants ----------
describe('invariants', () => {
  it('no evidence is fabricated: every id maps to a real module output', () => {
    const r = fuse({});
    expect(ids(r).filter((i) => i.startsWith('watchlist') || i.startsWith('identity') || i.startsWith('classification'))).toEqual([]);
    for (const e of r.evidence) expect(['ocr', 'validation', 'tampering', 'face']).toContain(e.source);
  });
  it('missing evidence never becomes fake evidence or fake trust', () => {
    const r = fuse({ tampering: null, face: null });
    expect(r.evidence.filter((e) => e.status === 'unavailable').map((e) => e.id)).toEqual(['tampering:unavailable', 'face:unavailable']);
    expect(r.trust.documentIntegrity.score).toBeNull();
    expect(r.trust.biometricConsistency.score).toBeNull();
    expect(r.trust.overall.available).toBe(true); // three dimensions remain
  });
  it('provider failures do not automatically mean fraud', () => {
    const r = fuse({ tampering: null, face: null });
    expect(r.risk.score).toBe(0);
    expect(r.decision).not.toBe(DECISION.REJECT);
  });
  it('risk and confidence move independently', () => {
    const cleanReal = fuse({});
    const cleanMock = fuse({ ocr: mkOcr({}, { provider: 'mock' }) }, { providers: { ocr: 'mock', tamper: 'mock', face: 'mock' } });
    const fraudReal = fuse({ ocr: mkOcr({ expiryDate: '2024-01-31' }), face: mkFace(30) });
    expect(cleanReal.risk.score).toBe(cleanMock.risk.score);
    expect(cleanMock.confidence.score).toBeLessThan(cleanReal.confidence.score);
    expect(fraudReal.confidence.score).toBe(cleanReal.confidence.score);
    expect(fraudReal.risk.score).toBeGreaterThan(cleanReal.risk.score);
  });
  it('fusion risk stays within the legacy engine bands for identical evidence', () => {
    const ocr = mkOcr({ expiryDate: '2024-01-31' });
    const validation = mkValidation(ocr);
    const tampering = mkTamper(40, []);
    const face = mkFace(88);
    const legacy = computeRisk({ validation, tampering, face, ocr });
    const fused = fuseEvidence({ documentType: 'passport', ocr, validation, tampering, face, providers: REAL });
    expect(Math.abs(legacy.score - fused.risk.score)).toBeLessThanOrEqual(5);
    expect(fused.legacyDecision).toBe(toLegacyDecision(fused.decision));
  });
  it('optional future modules are consumed but never invented', () => {
    const r = fuse({}, { watchlist: { status: 'possible', matches: [{ ref: 'DEMO-1' }], source: 'Demo Watchlist' }, identity: { links: [{ screeningId: 'X', similarity: 0.87 }] } });
    expect(ids(r)).toEqual(expect.arrayContaining(['watchlist:result', 'identity:links']));
    expect(r.decision).toBe(DECISION.REVIEW);
    expect(r.gates).toEqual(expect.arrayContaining(['identity_link', 'watchlist_possible']));
    const hit = fuse({}, { watchlist: { status: 'match', source: 'Demo Watchlist' } });
    expect(hit.decision).toBe(DECISION.REJECT);
    expect(hit.correlations.map((c) => c.id)).toContain('corr:watchlist_face');
  });
  it('handles null / empty input without throwing', () => {
    expect(() => fuseEvidence(null)).not.toThrow();
    expect(fuseEvidence({}).decision).toBe(DECISION.INSUFFICIENT);
  });
});

describe('compatibility layer', () => {
  it('maps legacy and fusion vocabularies both ways', () => {
    expect(fromLegacyDecision('accept')).toBe('approve');
    expect(fromLegacyDecision('flag')).toBe('review');
    expect(fromLegacyDecision('reject')).toBe('reject');
    expect(fromLegacyDecision('review')).toBe('review');
    expect(fromLegacyDecision(null)).toBeNull();
    expect(fromLegacyDecision('bogus')).toBeNull();
    expect(toLegacyDecision('approve')).toBe('accept');
    expect(toLegacyDecision('insufficient_evidence')).toBe('flag');
    expect(toLegacyDecision('flag')).toBe('flag');
    expect(normaliseDecision('accept')).toBe('approve');
  });
});
