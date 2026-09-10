// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import ResultsView from './ResultsView.jsx';
import DecisionBar from './DecisionBar.jsx';
import { fuseEvidence, DECISION } from '../../modules/fusion/index.js';
import { toLegacyRisk } from '../../modules/fusion/compat.js';
import { buildTd3, parseMrz } from '../../modules/validation/mrz.js';
import { validateDocument } from '../../modules/validation/index.js';
import { fusionRows, dimensionStatus, DIMENSIONS, topFactors } from './fusionView.js';

afterEach(cleanup);

// ---- synthetic fixtures built through the real engine (no hand-written fusion objects) ----
const NOW = new Date('2026-09-10T00:00:00Z');
const REAL = { ocr: 'tesseract', tamper: 'local', face: 'faceapi' };
const BASE = { docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1997-03-12', gender: 'F', expiryDate: '2031-06-30' };
function mkOcr(over = {}, { viz = {}, confidence = 0.92, provider = 'tesseract' } = {}) {
  const mrz = buildTd3({ ...BASE, ...over });
  const fields = parseMrz(mrz).fields;
  return { fields, vizFields: { ...fields, ...viz }, mrz, confidence, provider, fieldConfidence: {}, rawText: 'RAW' };
}
const face = (c, extra = {}) => ({ confidence: c, match: c >= 60, distance: 0.3, documentFaceFound: true, liveFaceFound: true, provider: 'face-api.js', ...extra });
const tamper = (score, flags = []) => ({ score, flags, evidence: {}, provider: 'local-ela' });
function results({ ocr = mkOcr(), tampering = tamper(4), face: f = face(91), providers = REAL, extra = {} } = {}) {
  const validation = ocr ? validateDocument('passport', ocr, { now: NOW }) : null;
  const fusion = fuseEvidence({ documentType: 'passport', ocr, validation, tampering, face: f, providers, ...extra });
  return { documentType: 'passport', ocr, validation, tampering, face: f, fusion, risk: toLegacyRisk(fusion), providers };
}
const IMG = { document: 'data:image/png;base64,iVBORw0KGgo=', live: 'data:image/png;base64,iVBORw0KGgo=' };

describe('ResultsView — four-way system assessment', () => {
  it('APPROVE: shows the decision, separate risk and confidence, and no risk factors', () => {
    const r = results();
    expect(r.fusion.decision).toBe(DECISION.APPROVE);
    render(<ResultsView results={r} images={IMG} />);
    expect(screen.getByRole('heading', { name: 'APPROVE' })).toBeTruthy();
    expect(screen.getByText('Risk score')).toBeTruthy();
    expect(screen.getByText('Analysis confidence')).toBeTruthy();
    expect(screen.getByText(/How suspicious the evidence is/)).toBeTruthy();
    expect(screen.getByText(/not whether the document is genuine/)).toBeTruthy();
    expect(screen.getByLabelText(`confidence ${r.fusion.confidence.score} out of 100`)).toBeTruthy();
    expect(screen.getByLabelText(`risk ${r.fusion.risk.score} out of 100`)).toBeTruthy();
    expect(screen.getAllByText('System assessment').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Verification status')).toBeTruthy();
    // only residual, low-severity contributions (face 91% → +3, forensics 4% → +2); nothing fails
    const why = screen.getByRole('heading', { name: 'Why this decision?' }).closest('section');
    expect(within(why).queryByText('critical')).toBeNull();
    expect(within(why).queryByText('high')).toBeNull();
    const list = screen.getByRole('table', { name: 'Verification signals' });
    expect(within(list).queryByText('FAIL')).toBeNull();
    expect(within(list).getAllByText('PASS').length).toBe(5);
    expect(screen.queryByRole('heading', { name: 'Conflicting evidence' })).toBeNull();
  });

  it('REVIEW: lists the strongest factors with contribution points and shows correlations only when present', () => {
    const r = results({ ocr: mkOcr({}, { viz: { dateOfBirth: '1998-03-12' } }), tampering: tamper(45, [{ id: 'ela_0', type: 'text_manipulation', severity: 'medium', label: 'Inconsistent compression in text area', detail: 'ELA 3.4σ', region: { x: 0.5, y: 0.5, w: 0.2, h: 0.1 }, field: 'dateOfBirth' }]) });
    expect(r.fusion.decision).toBe(DECISION.REVIEW);
    render(<ResultsView results={r} images={IMG} />);
    expect(screen.getByRole('heading', { name: 'REVIEW' })).toBeTruthy();
    const why = screen.getByRole('heading', { name: 'Why this decision?' }).closest('section');
    expect(within(why).getByText('Date of birth differs from MRZ')).toBeTruthy();
    expect(within(why).getByText('+25')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Conflicting evidence' })).toBeTruthy();
    expect(screen.getAllByText(/MRZ inconsistency overlaps a tampering signal on Date of birth/).length).toBeGreaterThan(0);
    expect(screen.getByText('+12 risk')).toBeTruthy();
  });

  it('REJECT: is visually and textually distinct from insufficient evidence', () => {
    const r = results({ ocr: mkOcr({ expiryDate: '2024-01-31' }), face: face(35) });
    expect(r.fusion.decision).toBe(DECISION.REJECT);
    render(<ResultsView results={r} images={IMG} />);
    expect(screen.getByRole('heading', { name: 'REJECT' })).toBeTruthy();
    expect(screen.getByText(/Strong evidence of invalidity, forgery or identity mismatch/)).toBeTruthy();
    expect(screen.queryByText(/Evidence that could not be obtained/)).toBeNull();
  });

  it('INSUFFICIENT EVIDENCE: names the unavailable evidence and never calls it fraud', () => {
    const r = results({ ocr: null, tampering: null, face: null });
    expect(r.fusion.decision).toBe(DECISION.INSUFFICIENT);
    render(<ResultsView results={r} images={IMG} />);
    expect(screen.getByRole('heading', { name: 'INSUFFICIENT EVIDENCE' })).toBeTruthy();
    expect(screen.getByText(/cannot safely determine authenticity/)).toBeTruthy();
    expect(screen.getByText('Evidence that could not be obtained')).toBeTruthy();
    expect(screen.getByText(/Unavailable evidence is never treated as proof of fraud/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'REJECT' })).toBeNull();
    expect(screen.getAllByText('UNAVAILABLE').length).toBeGreaterThanOrEqual(4);
  });

  it('unavailable dimensions show "Unavailable" rather than a fake 0%', () => {
    const r = results({ tampering: null, face: null });
    render(<ResultsView results={r} images={IMG} />);
    const rows = fusionRows(r.fusion);
    expect(rows.find((x) => x.key === 'documentIntegrity')).toMatchObject({ status: 'unavailable', trust: null });
    expect(rows.find((x) => x.key === 'biometricConsistency')).toMatchObject({ status: 'unavailable', trust: null });
    const list = screen.getByRole('table', { name: 'Verification signals' });
    expect(within(list).getAllByText('Unavailable').length).toBe(2);
    expect(within(list).getAllByText('UNAVAILABLE').length).toBe(3); // integrity, biometric, watchlist (not run)
    expect(within(list).getAllByText('PASS').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/UNAVAILABLE means the check did not run/)).toBeTruthy();
  });

  it('risk and confidence are separate values on screen', () => {
    const mock = results({ ocr: mkOcr({}, { provider: 'mock' }), providers: { ocr: 'mock', tamper: 'mock', face: 'mock' } });
    render(<ResultsView results={mock} images={IMG} />);
    const risk = mock.fusion.risk.score, conf = mock.fusion.confidence.score;
    expect(risk).not.toBe(conf);
    expect(screen.getByLabelText(`confidence ${conf} out of 100`)).toBeTruthy();
    expect(screen.getByLabelText(`risk ${risk} out of 100`)).toBeTruthy();
    expect(screen.getByText('Demo providers — not real analysis')).toBeTruthy();
  });

  it('evidence chain and counterfactual expand with real pivots', () => {
    const r = results({ tampering: tamper(30, [{ id: 'ela_0', type: 'text_manipulation', severity: 'medium', label: 'Inconsistent compression in text area', detail: 'ELA', region: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } }]) });
    render(<ResultsView results={r} images={IMG} />);
    fireEvent.click(screen.getByRole('button', { name: /Expand/ }));
    expect(screen.getByText('Per-contribution trace')).toBeTruthy();
    expect(screen.getAllByText(/Detector:/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /^Show$/ }));
    expect(screen.getByText(/could move to APPROVE/)).toBeTruthy();
    expect(screen.getByText(/Verifying "Inconsistent compression in text area" would move the decision to APPROVE/)).toBeTruthy();
  });

  it('legacy records without fusion still render through the legacy risk panel', () => {
    const r = results();
    const legacy = { ...r, fusion: undefined, risk: { score: 12, level: 'low', factors: [], recommendation: 'accept', summary: 'No issues detected.' } };
    render(<ResultsView results={legacy} images={IMG} />);
    expect(screen.queryAllByText('System assessment').length).toBe(0);
    expect(screen.getByText('Risk assessment')).toBeTruthy();
    expect(screen.getByText('Suggested: accept')).toBeTruthy();
    expect(screen.getByText('Document data')).toBeTruthy();
  });
});

describe('DecisionBar — officer decision vs system assessment', () => {
  it('labels the officer controls separately from the system assessment and records the officer choice', async () => {
    const onDecide = vi.fn(async () => {});
    render(<DecisionBar recommendation="flag" aiDecision="review" onDecide={onDecide} sticky={false} />);
    expect(screen.getByText('Officer decision')).toBeTruthy();
    expect(screen.getByText('System: Review')).toBeTruthy();
    expect(screen.getByText('suggested').closest('button').textContent).toMatch(/Review/);
    expect(screen.queryByText(/AI:/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Officer note'), { target: { value: 'Verified against authorized source' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await Promise.resolve();
    expect(onDecide).toHaveBeenCalledWith({ decision: 'accept', note: 'Verified against authorized source' });
  });
});

describe('fusionView helpers', () => {
  it('maps dimension status from evidence, unavailable when nothing ran', () => {
    const r = results({ tampering: null });
    expect(dimensionStatus(r.fusion, DIMENSIONS.find((d) => d.key === 'documentIntegrity'))).toBe('unavailable');
    expect(dimensionStatus(r.fusion, DIMENSIONS.find((d) => d.key === 'documentValidity'))).toBe('pass');
    const bad = results({ ocr: mkOcr({ expiryDate: '2024-01-31' }) });
    expect(dimensionStatus(bad.fusion, DIMENSIONS.find((d) => d.key === 'documentValidity'))).toBe('fail');
    expect(topFactors(bad.fusion)[0]).toMatchObject({ id: 'validation:expiry_not_passed', points: 25, status: 'fail', severity: 'critical' });
  });
});
