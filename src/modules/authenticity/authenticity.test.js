/**
 * AUTHENTICITY / TAMPERING DETECTION — behaviour tests.
 *
 * All fixtures are synthetic. The DOB regression case reproduces the scenario
 * reported against a real pair of passport images — an original showing
 * 03/11/2006 and an altered copy showing 05/11/2006, with the machine readable
 * zone still encoding 03/11/2006 — using invented names and numbers. No real
 * personal data appears here, and no value below is referenced by production
 * detection logic: the engine compares whatever it is given.
 */
import { describe, it, expect } from 'vitest';
import { determineAuthenticity, AUTHENTICITY, INDICATOR, CATEGORY, SEVERITY, INDICATOR_STATUS, compareRepresentations, AUTH } from './index.js';
import { checksumIndicators, recoverFromCheckDigit } from './consistency.js';
import { tamperChecklist, tamperRegions, finalVerdict, VERDICT, CHECK_STATUS, TAMPER_CHECKS } from './report.js';
import { analysePixels } from '../tampering/analysis.js';
import { toGray, copyMove, aspectAnomaly, outliers, tile, noiseResidual } from '../tampering/forensics.js';
import { buildTd3, parseMrz, extractMrzLines, normaliseMrzLine } from '../validation/mrz.js';
import { runIssuerVerification, issuerStatusLabel } from '../issuer/index.js';
import { runScreening } from '../../services/screeningPipeline.js';

/* ------------------------------------------------------------------ */
/* Synthetic passport fixtures                                          */
/* ------------------------------------------------------------------ */
const BIO = { docCode: 'P<', issuingCountry: 'IND', surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-03', gender: 'F', expiryDate: '2031-06-30' };
const MRZ = buildTd3(BIO);

/** A passport OCR result whose PRINTED values can be varied independently of the MRZ. */
function passportOcr(overrides = {}, { confidence = 0.93, mrz = MRZ } = {}) {
  const printed = {
    fullName: 'ANITA DEMO', documentNumber: BIO.documentNumber, nationality: 'IND',
    dateOfBirth: BIO.dateOfBirth, expiryDate: BIO.expiryDate, gender: 'F', ...overrides,
  };
  return { confidence, rawText: 'REPUBLIC OF DEMOLAND PASSPORT '.repeat(10), fields: printed, vizFields: { ...printed }, mrz, provider: 'mock' };
}

const CLEAN_IMAGE = { score: 6, flags: [], evidence: { stats: {} }, provider: 'local-ela' };
const FACE_MATCH = { similarity: 0.88, match: true, status: 'match' };
const elaFlag = (region, severity = 'medium') => ({ score: 42, provider: 'local-ela', evidence: {}, flags: [{ id: 'ela_0', type: 'text_manipulation', severity, label: 'Inconsistent compression', detail: '3.4σ above the document average', region }] });

const analyse = (ocr, extra = {}) => determineAuthenticity({ documentType: 'passport', ocr, tampering: CLEAN_IMAGE, face: FACE_MATCH, ...extra });

/* ------------------------------------------------------------------ */
describe('an unaltered passport', () => {
  it('is reported as ORIGINAL with a high authenticity score', () => {
    const r = analyse(passportOcr());
    expect(r.status).toBe(AUTHENTICITY.ORIGINAL);
    expect(r.score).toBeGreaterThanOrEqual(AUTH.ORIGINAL_SCORE);
    expect(r.severity).toBe(SEVERITY.NONE);
    expect(r.detectedCount).toBe(0);
  });

  it('never claims a perfect score, because an image cannot prove genuineness', () => {
    expect(analyse(passportOcr()).score).toBeLessThanOrEqual(AUTH.MAX_SCORE);
    expect(AUTH.MAX_SCORE).toBeLessThan(100);
  });

  it('states the physical-security and issuer limitations even when nothing is wrong', () => {
    const r = analyse(passportOcr());
    expect(r.limitations.join(' ')).toMatch(/holograms, watermarks/i);
    expect(r.limitations.join(' ')).toMatch(/not verification with the issuing authority/i);
  });

  it('records which checks actually ran', () => {
    const r = analyse(passportOcr());
    expect(r.coverageDetail).toMatchObject({ fieldCrossCheck: true, mrzIntegrity: true, imageForensics: true, textLegible: true });
    expect(r.coverage).toBeGreaterThan(0.9);
  });
});

/* ------------------------------------------------------------------ */
describe('REGRESSION: the reported date-of-birth alteration', () => {
  // Original shows 03/11/2006; the altered copy shows 05/11/2006; the MRZ still says 03/11/2006.
  const ORIGINAL_DOB = '2006-11-03';
  const ALTERED_DOB = '2006-11-05';

  it('reports the original of the pair as showing no tampering', () => {
    const r = analyse(passportOcr({ dateOfBirth: ORIGINAL_DOB }));
    expect(r.status).toBe(AUTHENTICITY.ORIGINAL);
  });

  it('reports the altered copy as TAMPERED', () => {
    const r = analyse(passportOcr({ dateOfBirth: ALTERED_DOB }));
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
  });

  it('raises VISUAL_MRZ_DOB_MISMATCH at HIGH severity, against the dateOfBirth field', () => {
    const r = analyse(passportOcr({ dateOfBirth: ALTERED_DOB }));
    const hit = r.indicators.find((i) => i.id === INDICATOR.VISUAL_MRZ_DOB_MISMATCH);
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe(SEVERITY.HIGH);
    expect(hit.status).toBe(INDICATOR_STATUS.DETECTED);
    expect(hit.category).toBe(CATEGORY.FIELD);
    expect(hit.field).toBe('dateOfBirth');
    expect(hit.region).toBeTruthy();
  });

  it('explains the finding in terms of the conflict, naming both values', () => {
    const r = analyse(passportOcr({ dateOfBirth: ALTERED_DOB }));
    const hit = r.indicators.find((i) => i.id === INDICATOR.VISUAL_MRZ_DOB_MISMATCH);
    expect(hit.explanation).toMatch(/Date of birth differs/i);
    expect(hit.explanation).toMatch(/machine readable zone/i);
    expect(hit.explanation).toContain(ALTERED_DOB);
    expect(hit.explanation).toContain(ORIGINAL_DOB);
    expect(hit.explanation).toMatch(/field-level modification/i);
  });

  it('carries both values as structured evidence, not only as prose', () => {
    const r = analyse(passportOcr({ dateOfBirth: ALTERED_DOB }));
    const hit = r.indicators.find((i) => i.id === INDICATOR.VISUAL_MRZ_DOB_MISMATCH);
    expect(hit.evidence.representations).toEqual(
      expect.arrayContaining([
        { source: 'visual', value: ALTERED_DOB },
        { source: 'mrz', value: ORIGINAL_DOB },
      ]),
    );
  });

  it('puts the authenticity score in the substantial-evidence band', () => {
    expect(analyse(passportOcr({ dateOfBirth: ALTERED_DOB })).score).toBeLessThan(50);
  });

  it('shows the comparison table, including the fields that agreed', () => {
    const r = analyse(passportOcr({ dateOfBirth: ALTERED_DOB }));
    const byField = Object.fromEntries(r.compared.map((c) => [c.field, c.status]));
    expect(byField.dateOfBirth).toBe('disagree');
    expect(byField.documentNumber).toBe('agree');
    expect(byField.fullName).toBe('agree');
  });
});

/* ------------------------------------------------------------------ */
describe('other field-level alterations', () => {
  it('detects a changed passport number', () => {
    const r = analyse(passportOcr({ documentNumber: 'X7654321' }));
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
    const hit = r.indicators.find((i) => i.id === INDICATOR.VISUAL_MRZ_PASSPORT_NUMBER_MISMATCH);
    expect(hit.severity).toBe(SEVERITY.HIGH);
  });

  it('detects a changed expiry date', () => {
    const r = analyse(passportOcr({ expiryDate: '2035-06-30' }));
    expect(r.indicators.some((i) => i.id === INDICATOR.VISUAL_MRZ_EXPIRY_MISMATCH)).toBe(true);
  });

  it('detects a changed name', () => {
    const r = analyse(passportOcr({ fullName: 'PRIYA DEMO' }));
    expect(r.indicators.some((i) => i.id === INDICATOR.VISUAL_MRZ_NAME_MISMATCH)).toBe(true);
  });

  it('treats sex and nationality mismatches as medium, since OCR confuses those characters', () => {
    const r = analyse(passportOcr({ gender: 'M' }));
    const hit = r.indicators.find((i) => i.id === INDICATOR.VISUAL_MRZ_SEX_MISMATCH);
    expect(hit.severity).toBe(SEVERITY.MEDIUM);
  });

  it('accumulates: several altered fields score lower than one', () => {
    const one = analyse(passportOcr({ dateOfBirth: '2006-11-05' })).score;
    const many = analyse(passportOcr({ dateOfBirth: '2006-11-05', documentNumber: 'X7654321', expiryDate: '2035-06-30' })).score;
    expect(many).toBeLessThan(one);
  });

  it('does not mind an abbreviated name appearing in only one representation', () => {
    const r = analyse(passportOcr({ fullName: 'ANITA K DEMO' }));
    expect(r.indicators.some((i) => i.id === INDICATOR.VISUAL_MRZ_NAME_MISMATCH)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
describe('MRZ integrity', () => {
  it('reports a checksum failure, and says a valid MRZ is only one piece of evidence', () => {
    const broken = { ...MRZ, lines: [MRZ.lines[0], `${MRZ.lines[1].slice(0, 9)}9${MRZ.lines[1].slice(10)}`] };
    const out = checksumIndicators(parseMrz(broken), 0.93);
    expect(out[0].id).toBe(INDICATOR.MRZ_CHECKSUM_FAILURE);
    expect(out[0].status).toBe(INDICATOR_STATUS.DETECTED);
  });

  it('a clean MRZ is reported as evidence, explicitly not as proof of genuineness', () => {
    const out = checksumIndicators(parseMrz(MRZ), 0.93);
    expect(out[0].status).toBe(INDICATOR_STATUS.CLEAR);
    expect(out[0].explanation).toMatch(/does not establish that the document is genuine/i);
  });

  it('a single failing check digit is weaker evidence than several', () => {
    const one = checksumIndicators({ checks: [{ id: 'a', label: 'A', ok: false }, { id: 'b', label: 'B', ok: true }] }, 1)[0];
    const many = checksumIndicators({ checks: [{ id: 'a', label: 'A', ok: false }, { id: 'b', label: 'B', ok: false }] }, 1)[0];
    expect(many.riskContribution).toBeGreaterThan(one.riskContribution);
    expect(one.severity).toBe(SEVERITY.MEDIUM);
    expect(many.severity).toBe(SEVERITY.HIGH);
  });

  it('a passport with no readable MRZ is not called tampered for it', () => {
    const r = analyse(passportOcr({}, { mrz: null }));
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
    expect(r.indicators.some((i) => i.id === INDICATOR.MRZ_ABSENT)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
describe('correlation between independent methods', () => {
  const DOB_REGION = { x: 0.4, y: 0.44, w: 0.2, h: 0.08 };

  it('a forensic anomaly over a field that already disagrees is materially stronger', () => {
    const fieldOnly = analyse(passportOcr({ dateOfBirth: '2006-11-05' }));
    const both = analyse(passportOcr({ dateOfBirth: '2006-11-05' }), { tampering: elaFlag(DOB_REGION) });
    expect(both.correlations.length).toBe(1);
    expect(both.score).toBeLessThan(fieldOnly.score);
    expect(both.correlations[0].explanation).toMatch(/two unrelated methods/i);
  });

  it('a forensic anomaly somewhere unrelated is not correlated with the field', () => {
    const elsewhere = analyse(passportOcr({ dateOfBirth: '2006-11-05' }), { tampering: elaFlag({ x: 0.02, y: 0.02, w: 0.08, h: 0.06 }) });
    expect(elsewhere.correlations).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
describe('no false positives', () => {
  it('image forensics alone never reaches TAMPERED', () => {
    const r = analyse(passportOcr(), { tampering: elaFlag({ x: 0.4, y: 0.44, w: 0.2, h: 0.08 }, 'high') });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
    const hit = r.indicators.find((i) => i.category === CATEGORY.FORENSICS && i.status === INDICATOR_STATUS.DETECTED);
    expect(hit.severity).not.toBe(SEVERITY.HIGH);
  });

  it('metadata alone never reaches TAMPERED, and is capped at low severity', () => {
    const meta = { score: 45, provider: 'local-ela', evidence: {}, flags: [{ id: 'meta_editor', type: 'metadata', severity: 'high', label: 'Edited with Photoshop', detail: 'Software tag present' }] };
    const r = analyse(passportOcr(), { tampering: meta });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
    expect(r.indicators.find((i) => i.id === INDICATOR.METADATA_EDITOR_INDICATOR).severity).toBe(SEVERITY.LOW);
  });

  it('poor OCR is never tampering — the comparison is skipped, not failed', () => {
    const r = analyse(passportOcr({}, { confidence: 0.2 }));
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
    // The printed values are too poorly recognised to be worth comparing, so nothing
    // is cross-checked. That is reported as a gap in the analysis, never as a finding.
    expect(r.compared.every((c) => c.status === 'not_compared')).toBe(true);
    expect(JSON.stringify(r.reasons)).toMatch(/too unreliable|too few checks|nothing could be cross-checked/i);
  });

  it('a zone that verifies its own check digits counts as read, whatever the page confidence', () => {
    // Recognition reports one confidence for the whole page, and a document
    // photographed on a patterned surface drags that average down however cleanly
    // the zone came out. Discarding the zone for that reason throws away the only
    // evidence that can be checked against itself.
    const r = analyse(passportOcr({}, { confidence: 0.2 }));
    expect(r.coverageDetail.textLegible).toBe(true);
    expect(r.status).not.toBe(AUTHENTICITY.INSUFFICIENT);
  });

  it('but a page with no readable zone at all is still insufficient', () => {
    const r = determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.2, rawText: '###', fields: {}, vizFields: {}, mrz: null }, tampering: CLEAN_IMAGE });
    expect(r.coverageDetail.textLegible).toBe(false);
    expect(r.status).toBe(AUTHENTICITY.INSUFFICIENT);
  });

  it('a face mismatch alone is not evidence that the DOCUMENT was altered', () => {
    const r = analyse(passportOcr(), { face: { similarity: 0.31, match: false, status: 'no_match' } });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
    const hit = r.indicators.find((i) => i.id === INDICATOR.BIOMETRIC_MISMATCH);
    expect(hit.explanation).toMatch(/not evidence that the document was altered/i);
  });

  it('missing fields are reported as a poor capture, not as an alteration', () => {
    const r = determineAuthenticity({ documentType: 'passport', ocr: { ...passportOcr(), fields: {} }, tampering: CLEAN_IMAGE, face: FACE_MATCH });
    const hit = r.indicators.find((i) => i.id === INDICATOR.DOCUMENT_LAYOUT_ANOMALY);
    expect(hit.explanation).toMatch(/incomplete or unclear capture/i);
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
  });

  it('an incomplete analysis is never mistaken for evidence against the document', () => {
    // Nothing ran except a clean image check: low score, but no finding.
    const r = determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.1, rawText: '##', fields: {}, vizFields: {}, mrz: null }, tampering: CLEAN_IMAGE });
    expect(r.status).toBe(AUTHENTICITY.INSUFFICIENT);
    expect(r.score).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
describe('insufficient evidence', () => {
  it('produces no score at all rather than a manufactured one', () => {
    const r = determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.12, rawText: '#', fields: {}, vizFields: {}, mrz: null }, tampering: null });
    expect(r.status).toBe(AUTHENTICITY.INSUFFICIENT);
    expect(r.score).toBeNull();
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('says which checks could not run', () => {
    const r = determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.12, rawText: '#', fields: {}, vizFields: {}, mrz: null }, tampering: null });
    expect(r.reasons.join(' ')).toMatch(/Image forensics did not run/i);
    expect(r.coverageDetail.imageForensics).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
describe('ORIGINAL is a claim, and is only made when earned', () => {
  it('a clean document whose analysis was incomplete is NO_INDICATORS, not ORIGINAL', () => {
    const r = analyse(passportOcr({}, { mrz: null }));
    expect(r.status).toBe(AUTHENTICITY.NO_INDICATORS);
    expect(r.reasons.join(' ')).toMatch(/rather than as positive evidence/i);
  });

  it('the two states are worded differently, so they cannot be confused', () => {
    const original = analyse(passportOcr()).label;
    const nothingFound = analyse(passportOcr({}, { mrz: null })).label;
    expect(original).not.toBe(nothingFound);
    expect(nothingFound).toMatch(/No tampering indicators/i);
  });
});

/* ------------------------------------------------------------------ */
describe('image forensics primitives', () => {
  const noisy = (seed, edit) => {
    const width = 128; const height = 96;
    const data = new Uint8ClampedArray(width * height * 4);
    let s = seed * 97;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < width * height; i += 1) { const v = 100 + rnd() * 100; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    if (edit) for (let y = 56; y < 88; y += 1) for (let x = 76; x < 114; x += 1) { const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 140; }
    return { data, width, height };
  };

  it('raises no flag on twenty clean images', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(`seed ${seed}: ${analysePixels(noisy(seed, false)).flags.length}`).toBe(`seed ${seed}: 0`);
    }
  });

  it('flags a pasted region whose noise does not match the document', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const flags = analysePixels(noisy(seed, true)).flags;
      expect(`seed ${seed}: ${flags.length > 0}`).toBe(`seed ${seed}: true`);
      expect(flags[0].region).toBeTruthy();
    }
  });

  it('ignores an isolated outlier cell, which random noise produces by itself', () => {
    const cells = Array.from({ length: 100 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10), value: i === 42 ? 100 : 10 }));
    const hot = outliers(cells, 2.8).hot;
    expect(hot).toHaveLength(1);           // it IS an outlier
    expect(analysePixels(noisy(3, false)).flags).toHaveLength(0); // but not reported alone
  });

  it('finds content duplicated from one place to another', () => {
    const width = 128; const height = 128;
    const data = new Uint8ClampedArray(width * height * 4);
    let s = 5;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < width * height; i += 1) { const v = 60 + rnd() * 160; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    // copy a 32x32 patch to a distant location
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
      const from = ((8 + y) * width + (8 + x)) * 4;
      const to = ((80 + y) * width + (88 + x)) * 4;
      data[to] = data[from]; data[to + 1] = data[from + 1]; data[to + 2] = data[from + 2]; data[to + 3] = 255;
    }
    const pairs = copyMove(toGray({ data, width, height }), width, height);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].distance).toBeGreaterThanOrEqual(48);
  });

  it('does not pair adjacent blocks of the same flat background', () => {
    const width = 96; const height = 96;
    const data = new Uint8ClampedArray(width * height * 4).fill(200);
    expect(copyMove(toGray({ data, width, height }), width, height)).toHaveLength(0);
  });

  it('measures aspect deviation without calling an angled photograph a forgery', () => {
    expect(aspectAnomaly(1250, 880, 1.42).anomalous).toBe(false);
    expect(aspectAnomaly(1250, 800, 1.42).anomalous).toBe(false);   // mild perspective
    expect(aspectAnomaly(1250, 400, 1.42).anomalous).toBe(true);    // not this document
  });

  it('computes noise residual over a tile without reading outside it', () => {
    const width = 32; const height = 32;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);
    const cells = tile(toGray({ data, width, height }), width, height, 4, noiseResidual);
    expect(cells).toHaveLength(16);
    expect(cells.every((c) => c.value === 0)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
describe('the pipeline produces an authenticity result for every scenario', () => {
  const IMG = 'data:image/png;base64,iVBORw0KGgo=';
  const run = (scenario, documentType = 'passport') => runScreening({ documentType, documentImage: IMG, liveImage: IMG, options: { useMock: true, scenario } }, { log: () => {} });

  it('clean passport → no tampering, officer may approve', async () => {
    const out = await run('clean_passport');
    expect(out.authenticity.status).not.toBe(AUTHENTICITY.TAMPERED);
    expect(out.fusion.decision).toBe('approve');
  }, 30000);

  it('tampered date of birth → TAMPERED, with the DOB indicator', async () => {
    const out = await run('tampered_dob');
    expect(out.authenticity.status).toBe(AUTHENTICITY.TAMPERED);
    expect(out.authenticity.indicators.some((i) => i.id === INDICATOR.VISUAL_MRZ_DOB_MISMATCH)).toBe(true);
    expect(out.authenticity.score).toBeLessThan(50);
  }, 30000);

  it('unreadable capture → insufficient evidence, no score', async () => {
    const out = await run('insufficient_evidence');
    expect(out.authenticity.status).toBe(AUTHENTICITY.INSUFFICIENT);
    expect(out.authenticity.score).toBeNull();
  }, 30000);

  it('authenticity is not a restatement of risk or of confidence', async () => {
    const out = await run('tampered_dob');
    expect(out.authenticity.score).not.toBe(100 - out.fusion.risk.score);
    expect(out.authenticity.score).not.toBe(out.fusion.confidence.score);
  }, 30000);

  it('a document type with no MRZ still gets an authenticity result', async () => {
    const out = await runScreening({ documentType: 'driving_license', documentImage: IMG, options: { useMock: true, scenario: 'clean', mockDocument: 'driving_license' } }, { log: () => {} });
    expect(out.authenticity).toBeTruthy();
    expect([AUTHENTICITY.ORIGINAL, AUTHENTICITY.NO_INDICATORS, AUTHENTICITY.INSUFFICIENT]).toContain(out.authenticity.status);
  }, 30000);
});

/* ------------------------------------------------------------------ */
describe('one document, one screening, whichever way it arrived', () => {
  const IMG = 'data:image/png;base64,iVBORw0KGgo=';
  const run = (opts) => runScreening({ documentType: 'passport', documentImage: IMG, options: { useMock: true, scenario: 'clean_passport', ...opts } }, { log: () => {} });

  it('camera and file upload produce the same analysis of the same document', async () => {
    const camera = await run({ inputSource: 'camera' });
    const upload = await run({ inputSource: 'upload' });
    expect(camera.authenticity.status).toBe(upload.authenticity.status);
    expect(camera.authenticity.score).toBe(upload.authenticity.score);
    expect(camera.fusion.decision).toBe(upload.fusion.decision);
    // Only the recorded input method differs.
    expect(camera.inputSource).toBe('camera');
    expect(upload.inputSource).toBe('upload');
  }, 30000);

  it('runs the whole pipeline with no photo of the person at all', async () => {
    const out = await run({});
    expect(out.ocr).toBeTruthy();
    expect(out.classification).toBeTruthy();
    expect(out.validation).toBeTruthy();
    expect(out.tampering).toBeTruthy();
    expect(out.authenticity).toBeTruthy();
    expect(out.fusion.decision).toBeTruthy();
    // The face check reports itself as skipped, not as a failure.
    expect(out.steps.face.status).toBe('skipped');
  }, 30000);

  it('a tampered document is still detected without a photo of the person', async () => {
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, options: { useMock: true, scenario: 'tampered_dob' } }, { log: () => {} });
    expect(out.authenticity.status).toBe(AUTHENTICITY.TAMPERED);
    expect(out.fusion.decision).toBe('reject');
  }, 30000);
});

/* ------------------------------------------------------------------ */
describe('the verdict sentence names the finding', () => {
  it('names the altered field rather than restating the status', () => {
    expect(analyse(passportOcr({ dateOfBirth: '2006-11-05' })).summary)
      .toBe('Date of birth was altered: the printed value conflicts with the machine readable zone.');
    expect(analyse(passportOcr({ documentNumber: 'X7654321' })).summary)
      .toMatch(/^Document number was altered/);
  });

  it('is a single sentence for an unaltered document', () => {
    expect(analyse(passportOcr()).summary)
      .toBe('Document fields are consistent and no significant manipulation indicators were detected.');
  });

  it('says plainly when there is not enough to go on', () => {
    const r = determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.1, rawText: '#', fields: {}, vizFields: {}, mrz: null }, tampering: null });
    expect(r.summary).toMatch(/^Insufficient reliable evidence to determine document authenticity/);
  });

  it('does not call a document original when the analysis was incomplete', () => {
    expect(analyse(passportOcr({}, { mrz: null })).summary).toMatch(/could not be read, so the printed fields could not be cross-checked/);
  });
});

/* ------------------------------------------------------------------ */
describe('coverage is measured against what the document type allows', () => {
  it('a document type with no MRZ is not held down for lacking one', () => {
    const r = determineAuthenticity({
      documentType: 'birth_certificate',
      ocr: { confidence: 0.9, rawText: 'BIRTH CERTIFICATE '.repeat(12), fields: { fullName: 'AARAV DEMO', registrationNumber: 'BR-DEMO-1', dateOfBirth: '2016-05-20', documentNumber: 'BR-DEMO-1' }, vizFields: {}, mrz: null },
      tampering: CLEAN_IMAGE,
      barcode: { status: 'detected', codes: [{ rawValue: JSON.stringify({ registrationNumber: 'BR-DEMO-1', name: 'AARAV DEMO', dob: '2016-05-20' }) }] },
    });
    expect(r.coverageApplicable.mrzIntegrity).toBe(false);
    expect(r.coverage).toBeGreaterThan(0.9);
    expect(r.status).toBe(AUTHENTICITY.ORIGINAL);
  });

  it('cross-checks a QR payload against the printed fields', () => {
    const r = determineAuthenticity({
      documentType: 'birth_certificate',
      ocr: { confidence: 0.9, rawText: 'BIRTH CERTIFICATE '.repeat(12), fields: { fullName: 'AARAV DEMO', dateOfBirth: '2016-05-20', documentNumber: 'BR-DEMO-1' }, vizFields: {}, mrz: null },
      tampering: CLEAN_IMAGE,
      // The code disagrees with the printed date of birth.
      barcode: { status: 'detected', codes: [{ rawValue: JSON.stringify({ registrationNumber: 'BR-DEMO-1', name: 'AARAV DEMO', dob: '2016-05-22' }) }] },
    });
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
    expect(r.summary).toMatch(/conflicts with the QR \/ barcode/);
  });

  it('a free-text QR payload carries no comparable fields and never creates a mismatch', () => {
    const r = determineAuthenticity({
      documentType: 'birth_certificate',
      ocr: { confidence: 0.9, rawText: 'BIRTH CERTIFICATE '.repeat(12), fields: { fullName: 'AARAV DEMO', dateOfBirth: '2016-05-20', documentNumber: 'BR-DEMO-1' }, vizFields: {}, mrz: null },
      tampering: CLEAN_IMAGE,
      barcode: { status: 'detected', codes: [{ rawValue: 'https://verify.example/record/BR-DEMO-1' }] },
    });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
  });
});

/* ------------------------------------------------------------------ */
describe('the system decision follows the authenticity finding', () => {
  const IMG = 'data:image/png;base64,iVBORw0KGgo=';

  it('TAMPERED → REJECT', async () => {
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { useMock: true, scenario: 'tampered_dob' } }, { log: () => {} });
    expect(out.authenticity.status).toBe(AUTHENTICITY.TAMPERED);
    expect(out.fusion.decision).toBe('reject');
    expect(out.fusion.gates).toContain('document_tampered');
  }, 30000);

  it('INSUFFICIENT EVIDENCE → never approve', async () => {
    const out = await runScreening({ documentType: 'passport', documentImage: IMG, liveImage: IMG, options: { useMock: true, scenario: 'insufficient_evidence' } }, { log: () => {} });
    expect(out.authenticity.status).toBe(AUTHENTICITY.INSUFFICIENT);
    expect(out.fusion.decision).not.toBe('approve');
  }, 30000);

  it('nothing found but an incomplete analysis is never an automatic approval', () => {
    // no_indicators must not be waved through: the gate exists for exactly this case.
    const r = analyse(passportOcr({}, { mrz: null }));
    expect(r.status).toBe(AUTHENTICITY.NO_INDICATORS);
  });
});

/* ------------------------------------------------------------------ */
describe('photo replacement needs two independent methods', () => {
  const PHOTO = { x: 0.05, y: 0.2, w: 0.28, h: 0.5 };
  const photoFlag = { score: 40, provider: 'local-ela', evidence: {}, flags: [{ id: 'ela_0', type: 'photo_replacement', severity: 'medium', label: 'Possible photo replacement', detail: '3.6σ above average', region: PHOTO }] };
  const NO_MATCH = { similarity: 0.29, match: false, status: 'no_match' };

  it('forensics on the portrait alone is not enough', () => {
    const r = analyse(passportOcr(), { tampering: photoFlag });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
  });

  it('a face mismatch alone is not enough', () => {
    const r = analyse(passportOcr(), { face: NO_MATCH });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
  });

  it('both together are photo replacement', () => {
    const r = analyse(passportOcr(), { tampering: photoFlag, face: NO_MATCH });
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
    expect(r.correlations.some((c) => c.field === 'photo')).toBe(true);
    expect(r.summary).toMatch(/portrait appears to have been replaced/i);
  });
});

describe('an unreadable document is never called clean', () => {
  it('cannot claim "no tampering indicators" when no text could be read', () => {
    const r = determineAuthenticity({
      documentType: 'generic_document',
      ocr: { confidence: 0.16, rawText: '### ####  ##\n#   #\n.. ,,  ;;\n##########\n#  ##   #', fields: {}, vizFields: {}, mrz: null },
      tampering: CLEAN_IMAGE,
    });
    expect(r.status).toBe(AUTHENTICITY.INSUFFICIENT);
    expect(r.score).toBeNull();
  });

  it('and is not called tampered either', () => {
    const r = determineAuthenticity({
      documentType: 'generic_document',
      ocr: { confidence: 0.16, rawText: '#'.repeat(40), fields: {}, vizFields: {}, mrz: null },
      tampering: CLEAN_IMAGE,
    });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
  });
});

/* ------------------------------------------------------------------ */
describe('the SIH tampering checklist', () => {
  const rows = (r) => Object.fromEntries(tamperChecklist(r).map((c) => [c.id, c.status]));

  it('names every check the problem statement asks for', () => {
    expect(TAMPER_CHECKS.map((c) => c.id)).toEqual([
      'photo_replacement', 'text_manipulation', 'date_modification', 'field_modification',
      'stamp_forgery', 'image_forensics', 'metadata', 'code_consistency', 'structure',
    ]);
  });

  it('a clean passport passes every applicable check', () => {
    const r = rows(analyse(passportOcr()));
    expect(Object.values(r).every((s) => s === CHECK_STATUS.PASS)).toBe(true);
  });

  it('an altered date of birth fails only the date check', () => {
    const r = rows(analyse(passportOcr({ dateOfBirth: '2006-11-05' })));
    expect(r.date_modification).toBe(CHECK_STATUS.FAIL);
    expect(r.photo_replacement).toBe(CHECK_STATUS.PASS);
    expect(r.field_modification).toBe(CHECK_STATUS.PASS);
    expect(r.metadata).toBe(CHECK_STATUS.PASS);
  });

  it('an altered document number fails only the identity-field check', () => {
    const r = rows(analyse(passportOcr({ documentNumber: 'X7654321' })));
    expect(r.field_modification).toBe(CHECK_STATUS.FAIL);
    expect(r.date_modification).toBe(CHECK_STATUS.PASS);
  });

  it('a localised text anomaly fails the text-manipulation check alone', () => {
    const r = rows(analyse(passportOcr(), { tampering: elaFlag({ x: 0.5, y: 0.1, w: 0.2, h: 0.1 }) }));
    expect(r.text_manipulation).toBe(CHECK_STATUS.FAIL);
    expect(r.date_modification).toBe(CHECK_STATUS.PASS);
  });

  it('a metadata editor tag fails only the metadata check', () => {
    const meta = { score: 45, provider: 'local-ela', evidence: {}, flags: [{ id: 'meta_editor', type: 'metadata', severity: 'high', label: 'Edited with an image editor', detail: 'Software tag present' }] };
    const r = rows(analyse(passportOcr(), { tampering: meta }));
    expect(r.metadata).toBe(CHECK_STATUS.FAIL);
    expect(r.image_forensics).toBe(CHECK_STATUS.PASS);
  });

  it('distinguishes "could not look" from "looked and found nothing"', () => {
    // No image forensics at all: the image-based rows are not applicable, not passing.
    const r = rows(determineAuthenticity({ documentType: 'passport', ocr: passportOcr(), tampering: null, face: FACE_MATCH }));
    expect(r.image_forensics).toBe(CHECK_STATUS.NOT_APPLICABLE);
    expect(r.photo_replacement).toBe(CHECK_STATUS.NOT_APPLICABLE);
    // Field comparison still ran, so those rows are real passes.
    expect(r.date_modification).toBe(CHECK_STATUS.PASS);
  });

  it('a poor-quality image compares nothing and passes nothing', () => {
    const r = rows(determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.2, rawText: '#'.repeat(40), fields: {}, vizFields: {}, mrz: null }, tampering: CLEAN_IMAGE }));
    expect(r.date_modification).toBe(CHECK_STATUS.NOT_APPLICABLE);
    expect(r.field_modification).toBe(CHECK_STATUS.NOT_APPLICABLE);
    // and nothing is reported as a failure either
    expect(Object.values(r)).not.toContain(CHECK_STATUS.FAIL);
  });
});

describe('tamper location', () => {

  it('points at the date of birth when the date of birth was altered', () => {
    const boxes = tamperRegions(analyse(passportOcr({ dateOfBirth: '2006-11-05' })));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].label).toBe('DOB field — suspected modification');
    expect(boxes[0].tone).toBe('high');
    for (const k of ['x', 'y', 'w', 'h']) expect(typeof boxes[0][k]).toBe('number');
  });

  it('points at the portrait when the portrait was replaced', () => {
    const PHOTO = { x: 0.05, y: 0.2, w: 0.28, h: 0.5 };
    const r = analyse(passportOcr(), {
      tampering: { score: 40, provider: 'local-ela', evidence: {}, flags: [{ id: 'ela_0', type: 'photo_replacement', severity: 'medium', label: 'Possible photo replacement', detail: '3.6σ', region: PHOTO }] },
      face: { confidence: 29, match: false, documentFaceFound: true, liveFaceFound: true },
    });
    expect(tamperRegions(r).some((b) => /Portrait/.test(b.label))).toBe(true);
  });

  it('draws nothing when nothing was detected', () => {
    expect(tamperRegions(analyse(passportOcr()))).toHaveLength(0);
  });

  it('does not draw the same region twice', () => {
    const REGION = { x: 0.4, y: 0.44, w: 0.2, h: 0.08 };
    const r = analyse(passportOcr({ dateOfBirth: '2006-11-05' }), { tampering: elaFlag(REGION) });
    const labels = tamperRegions(r).map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

/* ------------------------------------------------------------------ */
/* SIH PS-26188 — one named regression per case the result must handle. */
/*                                                                      */
/* Each case asserts the two things an evaluator reads: which of the    */
/* three outcomes was reached, and which checklist rows carry it. A row */
/* that fails must be the row that matches the evidence — a finding     */
/* that smears across unrelated rows is as wrong as a missed one.       */
/* ------------------------------------------------------------------ */
describe('SIH regression cases', () => {
  const rows = (r) => Object.fromEntries(tamperChecklist(r).map((c) => [c.id, c.status]));
  const failing = (r) => tamperChecklist(r).filter((c) => c.status === CHECK_STATUS.FAIL).map((c) => c.id);

  const DOB_REGION = { x: 0.4, y: 0.44, w: 0.2, h: 0.08 };
  const PHOTO_REGION = { x: 0.06, y: 0.25, w: 0.24, h: 0.42 };
  const photoFlag = { score: 40, provider: 'local-ela', evidence: {}, flags: [{ id: 'ela_0', type: 'photo_replacement', severity: 'medium', label: 'Possible photo replacement', detail: 'above the document average', region: PHOTO_REGION, field: 'photo' }] };
  const FACE_MISMATCH = { similarity: 0.29, match: false, status: 'no_match' };

  it('ORIGINAL: an unaltered document passes every applicable check and highlights nothing', () => {
    const r = analyse(passportOcr());
    expect(r.status).toBe(AUTHENTICITY.ORIGINAL);
    expect(failing(r)).toEqual([]);
    expect(tamperRegions(r)).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(AUTH.ORIGINAL_SCORE);
  });

  it('TAMPERED — date of birth: only the date row fails, and the box is on the DOB', () => {
    const r = analyse(passportOcr({ dateOfBirth: '2006-11-05' }), { tampering: elaFlag(DOB_REGION) });
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
    expect(failing(r)).toContain('date_modification');
    expect(failing(r)).not.toContain('field_modification');
    expect(tamperRegions(r).some((b) => b.label === 'DOB field — suspected modification')).toBe(true);
  });

  it('TAMPERED — text: a localised edit fails the text row without touching the field rows', () => {
    const r = analyse(passportOcr({ dateOfBirth: '2006-11-05' }), { tampering: elaFlag({ x: 0.5, y: 0.12, w: 0.2, h: 0.09 }) });
    const f = failing(r);
    expect(f).toContain('text_manipulation');
    expect(f).not.toContain('metadata');
    expect(f).not.toContain('stamp_forgery');
  });

  it('TAMPERED — photograph: the verdict needs two independent methods, the row reports one', () => {
    const severity = (r) => tamperChecklist(r).find((c) => c.id === 'photo_replacement').severity;

    // Forensics over the portrait is a real observation, so the row reports it —
    // but at MEDIUM, and it does not on its own move the document to TAMPERED.
    const alone = analyse(passportOcr(), { tampering: photoFlag });
    expect(failing(alone)).toContain('photo_replacement');
    expect(severity(alone)).toBe(SEVERITY.MEDIUM);
    expect(alone.status).not.toBe(AUTHENTICITY.TAMPERED);
    expect(alone.indicators.some((i) => i.id === INDICATOR.PHOTO_REPLACEMENT_CORROBORATED)).toBe(false);

    // The face check agreeing with it is the second method: now it is a finding.
    const both = analyse(passportOcr(), { tampering: photoFlag, face: FACE_MISMATCH });
    expect(both.status).toBe(AUTHENTICITY.TAMPERED);
    expect(severity(both)).toBe(SEVERITY.HIGH);
    expect(both.indicators.some((i) => i.id === INDICATOR.PHOTO_REPLACEMENT_CORROBORATED)).toBe(true);
    expect(tamperRegions(both).some((b) => /Portrait/.test(b.label))).toBe(true);
  });

  it('MRZ mismatch: a failing check digit fails the code-consistency row alone', () => {
    const broken = { ...MRZ, lines: [MRZ.lines[0], `${MRZ.lines[1].slice(0, 9)}9${MRZ.lines[1].slice(10)}`] };
    const r = analyse(passportOcr({}, { mrz: broken }));
    expect(rows(r).code_consistency).toBe(CHECK_STATUS.FAIL);
    expect(rows(r).image_forensics).toBe(CHECK_STATUS.PASS);
    expect(rows(r).metadata).toBe(CHECK_STATUS.PASS);
  });

  it('document-number mismatch: fails the identity-field row, not the date row', () => {
    const r = analyse(passportOcr({ documentNumber: 'X7654321' }));
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
    expect(failing(r)).toEqual(['field_modification']);
    expect(tamperRegions(r).some((b) => b.label === 'Document number — suspected modification')).toBe(true);
  });

  it('poor-quality image: nothing is claimed in either direction', () => {
    const r = determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.18, rawText: '#'.repeat(40), fields: {}, vizFields: {}, mrz: null }, tampering: CLEAN_IMAGE });
    expect(r.status).toBe(AUTHENTICITY.INSUFFICIENT);
    expect(r.score).toBeNull();
    expect(failing(r)).toEqual([]);
    expect(tamperRegions(r)).toEqual([]);
    // Blur is not an accusation: the read-dependent rows abstain rather than fail.
    expect(rows(r).code_consistency).toBe(CHECK_STATUS.NOT_APPLICABLE);
    expect(rows(r).structure).toBe(CHECK_STATUS.NOT_APPLICABLE);
  });

  it('insufficient evidence: no score is manufactured when too little ran', () => {
    const r = determineAuthenticity({ documentType: 'passport', ocr: null, tampering: null, face: null });
    expect(r.status).toBe(AUTHENTICITY.INSUFFICIENT);
    expect(r.score).toBeNull();
    expect(failing(r)).toEqual([]);
  });

  it('the checklist never reports a failure the indicators did not produce', () => {
    for (const r of [analyse(passportOcr()), analyse(passportOcr({ dateOfBirth: '2006-11-05' })), determineAuthenticity({ documentType: 'passport', ocr: null, tampering: null })]) {
      const detected = new Set((r.indicators || []).filter((i) => i.status === INDICATOR_STATUS.DETECTED).map((i) => i.id));
      for (const row of tamperChecklist(r)) {
        if (row.status === CHECK_STATUS.FAIL) {
          expect(TAMPER_CHECKS.find((c) => c.id === row.id).ids.some((id) => detected.has(id))).toBe(true);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ */
describe('issuer verification is only ever claimed when it was performed', () => {
  it('says plainly that nothing was verified when no source is configured', async () => {
    const label = issuerStatusLabel(await runIssuerVerification({ provider: 'unavailable' }));
    expect(label).toMatch(/not verified with the issuing authority/i);
    expect(label).not.toMatch(/confirmed/i);
  });

  it('a synthetic demo match never reads as an authorised confirmation', async () => {
    const out = await runIssuerVerification({ provider: 'synthetic', documentType: 'passport', fields: { documentNumber: 'M8412345', fullName: 'ANITA SHARMA', dateOfBirth: '1988-04-12' } });
    expect(out.status).toBe('verified');
    expect(out.synthetic).toBe(true);
    expect(issuerStatusLabel(out)).toMatch(/synthetic demonstration register/i);
    // It must read as a denial of authorised verification, never as one.
    expect(issuerStatusLabel(out)).toMatch(/not an authorised issuer source/i);
    expect(issuerStatusLabel(out)).not.toMatch(/^Confirmed/);
  });

  it('absence from a register is reported as absence, not as forgery', async () => {
    const label = issuerStatusLabel(await runIssuerVerification({ provider: 'synthetic', documentType: 'passport', fields: { documentNumber: 'NOSUCH99' } }));
    expect(label).toMatch(/no matching record/i);
    expect(label).toMatch(/not evidence of forgery/i);
  });

  it('the external placeholder claims nothing, because it is not connected', async () => {
    const out = await runIssuerVerification({ provider: 'external', documentType: 'passport', fields: { documentNumber: 'X1234567' } });
    expect(out.status).toBe('unavailable');
    expect(issuerStatusLabel(out)).not.toMatch(/confirmed/i);
  });

  it('a missing issuer result is not silently treated as a pass', () => {
    expect(issuerStatusLabel(null)).toMatch(/not verified/i);
    expect(issuerStatusLabel(undefined)).toMatch(/not verified/i);
  });
});

/* ------------------------------------------------------------------ */
/* The final screen shows two outcomes and one sentence.                */
/* ------------------------------------------------------------------ */
describe('the final verdict is binary', () => {
  const PHOTO_REGION = { x: 0.06, y: 0.25, w: 0.24, h: 0.42 };
  const photoFlag = { score: 40, provider: 'local-ela', evidence: {}, flags: [{ id: 'ela_0', type: 'photo_replacement', severity: 'medium', label: 'Possible photo replacement', detail: 'x', region: PHOTO_REGION, field: 'photo' }] };

  it('an unaltered document is ORIGINAL / REAL with no boxes drawn', () => {
    const v = finalVerdict(analyse(passportOcr()));
    expect(v.headline).toBe(VERDICT.ORIGINAL);
    expect(v.tampered).toBe(false);
    expect(v.regions).toEqual([]);
  });

  it('an altered document is TAMPERED / FAKE and boxes the region it found', () => {
    const v = finalVerdict(analyse(passportOcr({ dateOfBirth: '2006-11-05' })));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.regions.length).toBeGreaterThan(0);
    for (const b of v.regions) for (const k of ['x', 'y', 'w', 'h']) expect(typeof b[k]).toBe('number');
  });

  it('every box is red, whatever severity the indicator carried', () => {
    const cases = [
      analyse(passportOcr({ dateOfBirth: '2006-11-05' })),
      analyse(passportOcr({ documentNumber: 'X7654321' })),
      analyse(passportOcr(), { tampering: photoFlag, face: { similarity: 0.29, match: false, status: 'no_match' } }),
    ];
    for (const r of cases) {
      const v = finalVerdict(r);
      expect(v.regions.length).toBeGreaterThan(0);
      expect(v.regions.every((b) => b.tone === 'high')).toBe(true);
    }
  });

  it('every state lands on exactly one of the three, and on the right one', () => {
    const cases = [
      [analyse(passportOcr()), VERDICT.ORIGINAL],
      [analyse(passportOcr({ dateOfBirth: '2006-11-05' })), VERDICT.TAMPERED],
      // Examined, nothing found, but not every check could run — still not an accusation.
      [determineAuthenticity({ documentType: 'passport', ocr: passportOcr(), tampering: null }), VERDICT.ORIGINAL],
      // Nothing could be examined at all: neither genuine nor fake is claimed.
      [determineAuthenticity({ documentType: 'passport', ocr: null, tampering: null }), VERDICT.UNREADABLE],
    ];
    for (const [r, expected] of cases) expect(finalVerdict(r).headline).toBe(expected);
  });

  it('only a positive tampering finding produces TAMPERED / FAKE', () => {
    // An unreadable capture is not an accusation, but it is not a clean bill of
    // health either: it says so, rather than claiming the document is genuine.
    const blur = determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.18, rawText: '#'.repeat(40), fields: {}, vizFields: {}, mrz: null }, tampering: CLEAN_IMAGE });
    const v = finalVerdict(blur);
    expect(v.headline).toBe(VERDICT.UNREADABLE);
    expect(v.regions).toEqual([]);
    expect(v.reason).toMatch(/insufficient|could not be read/i);
    expect(v.reason).not.toMatch(/no significant manipulation indicators were detected\.$/);

    // Forensics or metadata on their own likewise never reach the tampered screen.
    for (const weak of [{ tampering: elaFlag({ x: 0.4, y: 0.44, w: 0.2, h: 0.08 }, 'high') }, { tampering: photoFlag }]) {
      expect(finalVerdict(analyse(passportOcr(), weak)).headline).toBe(VERDICT.ORIGINAL);
    }
  });

  it('the reason is a single sentence', () => {
    for (const r of [analyse(passportOcr()), analyse(passportOcr({ dateOfBirth: '2006-11-05' })), determineAuthenticity({ documentType: 'passport', ocr: null, tampering: null })]) {
      const { reason } = finalVerdict(r);
      expect(reason.trim()).toMatch(/\.$/);
      expect(reason.trim().replace(/\.$/, '').split('. ')).toHaveLength(1);
    }
  });

  it('carries no score, no risk and no field data', () => {
    const v = finalVerdict(analyse(passportOcr({ dateOfBirth: '2006-11-05' })));
    expect(Object.keys(v).sort()).toEqual(['headline', 'reason', 'regions', 'tampered', 'unreadable']);
  });
});

/* ------------------------------------------------------------------ */
/* A forgery that edited the zone to match the printed page.            */
/*                                                                      */
/* Changing only what is printed leaves the zone to contradict it. The  */
/* harder case changes both — and then the check digits, which the      */
/* forger did not recompute, still hold the original.                   */
/* ------------------------------------------------------------------ */
describe('an edited machine readable zone betrayed by its own check digit', () => {
  // Date of birth encoded as 06-11-05, but followed by the check digit 9,
  // which is the digit for 06-11-03. Every other check digit still verifies.
  const EDITED = { format: 'TD3', lines: ['P<INDDEMO<<ANITA<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AM630833<1IND0611059M36010731066100677725<02'] };
  const GENUINE = { format: 'TD3', lines: ['P<INDDEMO<<ANITA<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AM630833<1IND0611039M36010731066100677725<02'] };
  const printed = (dob) => ({ fullName: 'ANITA DEMO', documentNumber: 'AM630833', nationality: 'IND', dateOfBirth: dob, expiryDate: '2036-01-07', gender: 'M' });
  const ocr = (dob, mrz) => ({ confidence: 0.82, rawText: 'REPUBLIC OF DEMOLAND PASSPORT '.repeat(10), fields: printed(dob), vizFields: printed(dob), mrz, provider: 'tesseract' });
  const run = (dob, mrz) => determineAuthenticity({ documentType: 'passport', ocr: ocr(dob, mrz), tampering: CLEAN_IMAGE });

  it('the check digit still present is the one for the original value', () => {
    const r = recoverFromCheckDigit({ id: 'mrz_dob', ok: false, value: '061105', expected: 1, actual: '9' });
    expect(r.field).toBe('dateOfBirth');
    expect(r.candidates).toContain('061103');
  });

  it('reports TAMPERED even though the printed page and the zone agree', () => {
    const r = run('2006-11-05', EDITED);
    const byField = Object.fromEntries(r.compared.map((c) => [c.field, c.status]));
    expect(byField.dateOfBirth).toBe('agree');       // nothing to find by comparison alone
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);    // but the arithmetic still gives it away
  });

  it('names the date of birth and boxes it', () => {
    const v = finalVerdict(run('2006-11-05', EDITED));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.reason).toMatch(/date of birth/i);
    expect(v.reason).toMatch(/check digit/i);
    expect(v.regions).toHaveLength(1);
    expect(v.regions[0].label).toBe('DOB field — suspected modification');
  });

  it('rests on the printed page agreeing, which a misreading could not produce', () => {
    const hit = run('2006-11-05', EDITED).indicators.find((i) => i.id === INDICATOR.MRZ_FIELD_RECONSTRUCTED);
    expect(hit.severity).toBe(SEVERITY.HIGH);
    expect(hit.evidence.printedAgreesWithZone).toBe(true);
    expect(hit.evidence.checkDigitPresent).toBe('9');
    expect(hit.evidence.checkDigitRequired).toBe(1);
  });

  it('is weaker when the printed value does not agree, because that is what a misread zone looks like', () => {
    const hit = run('2006-11-03', EDITED).indicators.find((i) => i.id === INDICATOR.MRZ_FIELD_RECONSTRUCTED);
    expect(hit.severity).toBe(SEVERITY.MEDIUM);
    expect(hit.evidence.printedAgreesWithZone).toBe(false);
  });

  it('says nothing at all about a zone whose check digits verify', () => {
    const r = run('2006-11-03', GENUINE);
    expect(r.indicators.some((i) => i.id === INDICATOR.MRZ_FIELD_RECONSTRUCTED)).toBe(false);
    expect(finalVerdict(r).headline).toBe(VERDICT.ORIGINAL);
  });
});

describe('a document that could not be read is not called genuine', () => {
  it('reports that it could not be read, rather than ORIGINAL / REAL', () => {
    const v = finalVerdict(determineAuthenticity({ documentType: 'passport', ocr: { confidence: 0.15, rawText: '#'.repeat(30), fields: {}, vizFields: {}, mrz: null }, tampering: CLEAN_IMAGE }));
    expect(v.headline).toBe(VERDICT.UNREADABLE);
    expect(v.unreadable).toBe(true);
    expect(v.tampered).toBe(false);
    expect(v.regions).toEqual([]);
  });

  it('is not an accusation either', () => {
    const v = finalVerdict(determineAuthenticity({ documentType: 'passport', ocr: null, tampering: null }));
    expect(v.headline).not.toBe(VERDICT.TAMPERED);
    expect(v.headline).toBe(VERDICT.UNREADABLE);
  });

  it('a document that WAS read and is clean still reports ORIGINAL / REAL', () => {
    const v = finalVerdict(analyse(passportOcr()));
    expect(v.headline).toBe(VERDICT.ORIGINAL);
    expect(v.unreadable).toBe(false);
  });
});

describe('the page and the zone telling the same altered story', () => {
  const EDITED = { format: 'TD3', lines: ['P<INDDEMO<<ANITA<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AM630833<1IND0611059M36010731066100677725<02'] };
  const base = { documentNumber: 'AM630833', gender: 'M' };

  it('reads agreement from a date printed anywhere when the label could not be read', () => {
    // Bilingual labels beside Devanagari come back as noise, so the date of birth
    // has nothing to anchor to and is never extracted as a labelled field. The date
    // itself is plain digits and survives — and that it matches the zone is the
    // point, because a misreading of the zone could not also appear on the page.
    const ocr = { confidence: 0.49, rawText: 'X'.repeat(200), fields: base, vizFields: base, printedDates: ['2006-11-05', '2026-01-08', '2036-01-07'], mrz: EDITED, provider: 'tesseract' };
    const r = determineAuthenticity({ documentType: 'passport', ocr, tampering: CLEAN_IMAGE });
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
    const hit = r.indicators.find((i) => i.id === INDICATOR.MRZ_FIELD_RECONSTRUCTED);
    expect(hit.evidence.printedAgreesWithZone).toBe(true);
    expect(hit.evidence.agreementFrom).toBe('date printed on the page');
    expect(finalVerdict(r).regions[0].label).toBe('DOB field — suspected modification');
  });

  it('stays weak when the page prints no such date, because then a misread zone explains it', () => {
    const ocr = { confidence: 0.49, rawText: 'X'.repeat(200), fields: base, vizFields: base, printedDates: ['2026-01-08', '2036-01-07'], mrz: EDITED, provider: 'tesseract' };
    const r = determineAuthenticity({ documentType: 'passport', ocr, tampering: CLEAN_IMAGE });
    const hit = r.indicators.find((i) => i.id === INDICATOR.MRZ_FIELD_RECONSTRUCTED);
    expect(hit.severity).toBe(SEVERITY.MEDIUM);
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
  });

  it('never names a recovered original, because several values satisfy one check digit', () => {
    const ocr = { confidence: 0.49, rawText: 'X'.repeat(200), fields: base, vizFields: base, printedDates: ['2006-11-05'], mrz: EDITED, provider: 'tesseract' };
    const { reason } = finalVerdict(determineAuthenticity({ documentType: 'passport', ocr, tampering: CLEAN_IMAGE }));
    expect(reason).toMatch(/date of birth/i);
    expect(reason).toMatch(/check digit/i);
    expect(reason).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

/* ------------------------------------------------------------------ */
/* The reported capture, verbatim.                                      */
/*                                                                      */
/* The zone below is exactly what recognition returned from the reported */
/* photograph: filler read as S, L and R, and the leading "AM" of the    */
/* second line lost to the edge of the frame. The page-level read was    */
/* poor enough that the printed year came back as 2008 for 2006.         */
/* ------------------------------------------------------------------ */
describe('REGRESSION: the reported photograph, as it was actually read', () => {
  const LINE1 = 'P<INDPASUPUNURI<<VARUNSKUMARS<SLLLLLLLLLLLRL';
  const zone = (line2) => extractMrzLines(`${LINE1}\n${line2}`);
  const screen = (line2, dates) => determineAuthenticity({
    documentType: 'passport',
    ocr: { confidence: 0.31, rawText: 'X'.repeat(200), fields: {}, vizFields: {}, printedDates: dates, mrz: zone(line2), provider: 'tesseract' },
    tampering: CLEAN_IMAGE,
  });

  // Date of birth encoded as 06-11-05, guarded by the digit 9, which belongs to 06-11-03.
  const ALTERED = ' 630833<1IND0611059M36010731066100677725<024<';
  const GENUINE = ' 630833<1IND0611039M36010731066100677725<024<';

  it('puts the second line back on its columns despite the lost characters', () => {
    const p = parseMrz(zone(ALTERED));
    expect(p.fields.dateOfBirth).toBe('2006-11-05');
    expect(p.fields.expiryDate).toBe('2036-01-07');
    expect(p.fields.gender).toBe('M');
  });

  it('does not count the characters lost at the frame edge as an altered field', () => {
    const p = parseMrz(zone(ALTERED));
    const byId = Object.fromEntries(p.checks.map((c) => [c.id, c]));
    expect(byId.mrz_doc_number.ok).toBe(false);          // it was not read
    expect(byId.mrz_doc_number.value).toMatch(/^</);     // and says so
    expect(byId.mrz_expiry.ok).toBe(true);               // the rest verifies
    expect(byId.mrz_optional.ok).toBe(true);
  });

  it('reports TAMPERED and boxes the date of birth', () => {
    const v = finalVerdict(screen(ALTERED, ['2008-11-05', '2036-01-07']));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.reason).toMatch(/date of birth/i);
    expect(v.regions).toHaveLength(1);
    expect(v.regions[0].label).toBe('DOB field — suspected modification');
  });

  it('leaves the same capture of the unaltered passport alone', () => {
    const v = finalVerdict(screen(GENUINE, ['2006-11-03', '2036-01-07']));
    expect(v.headline).toBe(VERDICT.ORIGINAL);
    expect(v.regions).toEqual([]);
  });

  it('does not accuse a genuine document whose zone was merely misread', () => {
    // The check digit fails because recognition got the date wrong, not because
    // anyone changed it — and the page still carries the TRUE date, which is one
    // of the values the digit could have been computed for. That is the tell.
    const v = finalVerdict(screen(GENUINE.replace('0611039', '0611089'), ['2006-11-03', '2036-01-07']));
    expect(v.headline).not.toBe(VERDICT.TAMPERED);
  });

  it('reads runs of filler that came back as letters as filler again', () => {
    // Only K, L, I and 1. A name is worth more than a clean-looking line: S, R, C
    // and E are read for filler too, but they are also ERIC, LESLIE and CLARK, and
    // scrubbing those leaves the zone disagreeing with the printed name.
    expect(zone(ALTERED).lines[0]).toContain('PASUPUNURI');
    expect(zone(ALTERED).lines[0]).toContain('VARUN');
    expect(normaliseMrzLine('P<INDSMITH<<ERIC<<<<<<<<<<<<<<<<<<<<<<<<<<<<')).toContain('ERIC');
    expect(normaliseMrzLine('P<GBRCLARK<<LESLIE<<<<<<<<<<<<<<<<<<<<<<<<<<')).toContain('LESLIE');
    expect(normaliseMrzLine('P<INDDEMO<<ANITA<KKKKKKKKKK<<<<')).toBe('P<INDDEMO<<ANITA<<<<<<<<<<<<<<<');
  });
});

describe('REGRESSION: the unaltered passport, from the same clipped capture', () => {
  // The same photograph of the genuine document lost FIVE characters to the frame
  // ("AM630"), not two. Both must come back on their columns: a realignment that
  // only reaches the shorter clip reports a genuine passport as unreadable.
  const GENUINE = ['P<INDPASUPUNURI<<VARUNSKUMAR<<<<<<<<<<<<<<', '833<1IND0611039M36010731066100677725<02MH<<<'];
  const ALTERED = ['P<INDPASUPUNURI<<VARUNSKUMARS<SLLLLLLLLLLLRL', ' 630833<1IND0611059M36010731066100677725<024<'];
  const read = (lines, dates, confidence) => determineAuthenticity({
    documentType: 'passport',
    ocr: { confidence, rawText: 'X'.repeat(200), fields: {}, vizFields: {}, printedDates: dates, mrz: extractMrzLines(lines.join('\n')), provider: 'tesseract' },
    tampering: CLEAN_IMAGE,
  });

  it('recovers the fields whatever the frame took off the front', () => {
    for (const [lines, dob] of [[GENUINE, '2006-11-03'], [ALTERED, '2006-11-05']]) {
      const p = parseMrz(extractMrzLines(lines.join('\n')));
      expect(p.fields.dateOfBirth).toBe(dob);
      expect(p.fields.expiryDate).toBe('2036-01-07');
      expect(p.fields.gender).toBe('M');
    }
  });

  it('the unaltered passport reports ORIGINAL / REAL', () => {
    const v = finalVerdict(read(GENUINE, ['2020-11-03', '2036-01-07'], 0.29));
    expect(v.headline).toBe(VERDICT.ORIGINAL);
    expect(v.regions).toEqual([]);
  });

  it('its date of birth verifies against its own check digit', () => {
    const byId = Object.fromEntries(parseMrz(extractMrzLines(GENUINE.join('\n'))).checks.map((c) => [c.id, c]));
    expect(byId.mrz_dob.ok).toBe(true);
    expect(byId.mrz_expiry.ok).toBe(true);
  });

  it('and the altered one still reports TAMPERED, boxed on the date', () => {
    const v = finalVerdict(read(ALTERED, ['2008-11-05', '2036-01-07'], 0.31));
    expect(v.headline).toBe(VERDICT.TAMPERED);
    expect(v.regions[0].label).toBe('DOB field — suspected modification');
  });

  it('refuses a shift that would put the wrong shapes in the fields', () => {
    // A country code matched by coincidence is discarded on the structure it implies,
    // not on a guess about how much of the line could have been lost.
    const nonsense = ['P<INDPASUPUNURI<<VARUN<KUMAR<<<<<<<<<<<<<<<<', 'INDINDINDINDINDINDINDINDINDINDINDINDINDINDI'];
    const mrz = extractMrzLines(nonsense.join('\n'));
    if (mrz) expect(parseMrz(mrz).checks.filter((c) => c.ok).length).toBeLessThan(2);
  });
});

describe('a name is the same name however it is written', () => {
  const MRZ_NAME = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-03', gender: 'F', expiryDate: '2031-06-30' });
  const status = (printedName, mrz = MRZ_NAME) => {
    const r = analyse({ ...passportOcr({ fullName: printedName }, { mrz }) });
    return (r.compared.find((c) => c.field === 'fullName') || {}).status;
  };

  it('the zone puts the surname first and the page usually puts it last', () => {
    expect(status('ANITA DEMO')).toBe('agree');
  });

  it('a middle initial in only one of them is not a difference', () => {
    expect(status('ANITA K DEMO')).toBe('agree');
  });

  it('padding that came back stuck to the last word is not a difference', () => {
    // A photographed zone returns ANITA<<<<< as ANITAKK, and the letters stick to
    // the name. Reading that as a changed name accuses a genuine passport.
    const speckled = { ...MRZ_NAME, lines: ['P<INDDEMO<<ANITAKK<K<K<<<<<<<<<<<<<<<<<<<<<<', MRZ_NAME.lines[1]] };
    expect(status('ANITA DEMO', speckled)).toBe('agree');
  });

  it('but one name becoming another still is', () => {
    expect(status('PRIYA DEMO')).toBe('disagree');
    expect(status('ANITA SHARMA')).toBe('disagree');
  });

  it('and a real name is never scrubbed out of the zone as if it were padding', () => {
    for (const line of ['P<INDSMITH<<ERIC<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'P<GBRCLARK<<LESLIE<<<<<<<<<<<<<<<<<<<<<<<<<<']) {
      const kept = normaliseMrzLine(line);
      expect(kept).toBe(line);
    }
  });
});

/* ------------------------------------------------------------------ */
describe('what is strong enough to call a document forged', () => {
  const MRZ = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'DEMO', givenNames: 'ANITA', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-03', gender: 'F', expiryDate: '2031-06-30' });
  const read = (over = {}, mrz = MRZ) => {
    const printed = { fullName: 'ANITA DEMO', documentNumber: 'X1234567', nationality: 'IND', dateOfBirth: '2006-11-03', expiryDate: '2031-06-30', gender: 'F', ...over };
    return { confidence: 0.9, rawText: 'R'.repeat(300), fields: printed, vizFields: { ...printed }, mrz, provider: 'tesseract' };
  };
  const run = (over, mrz, tampering = CLEAN_IMAGE, face) => determineAuthenticity({ documentType: 'passport', ocr: read(over, mrz), tampering, face });

  it('a name that differs is reported but never forged on its own', () => {
    // Nothing corroborates a name: no check digit covers the zone's name line, and
    // it is the field recognition damages most. A genuine document must not be
    // called forged because its name came back transliterated or speckled.
    const r = run({ fullName: 'PRIYA DEMO' });
    expect(r.status).not.toBe(AUTHENTICITY.TAMPERED);
    const hit = r.indicators.find((i) => i.id === INDICATOR.VISUAL_MRZ_NAME_MISMATCH);
    expect(hit.status).toBe(INDICATOR_STATUS.DETECTED);   // still reported
    expect(hit.severity).toBe(SEVERITY.MEDIUM);           // never on its own decisive
  });

  it('nor when the zone returned the padding as letters stuck to the name', () => {
    const speckled = { ...MRZ, lines: ['P<INDDEMO<<ANITAKKCCLKCLC<<<<<<<<<<<<<<<<<<<', MRZ.lines[1]] };
    expect(run({}, speckled).status).not.toBe(AUTHENTICITY.TAMPERED);
  });

  it('nationality or sex alone is likewise not enough', () => {
    expect(run({ nationality: 'USA' }).status).not.toBe(AUTHENTICITY.TAMPERED);
    expect(run({ gender: 'M' }).status).not.toBe(AUTHENTICITY.TAMPERED);
  });

  it('but an altered date of birth, number or expiry still is', () => {
    expect(run({ dateOfBirth: '2006-11-05' }).status).toBe(AUTHENTICITY.TAMPERED);
    expect(run({ documentNumber: 'X7654321' }).status).toBe(AUTHENTICITY.TAMPERED);
    expect(run({ expiryDate: '2035-06-30' }).status).toBe(AUTHENTICITY.TAMPERED);
  });

  it('and so is a portrait that both looks composited and belongs to someone else', () => {
    const photo = { score: 40, provider: 'local-ela', evidence: {}, flags: [{ id: 'ela_0', type: 'photo_replacement', severity: 'medium', label: 'Possible photo replacement', detail: 'x', region: { x: 0.06, y: 0.25, w: 0.24, h: 0.42 }, field: 'photo' }] };
    const r = run({}, MRZ, photo, { similarity: 0.29, match: false, status: 'no_match' });
    expect(r.status).toBe(AUTHENTICITY.TAMPERED);
  });

  it('and a zone whose check digit contradicts the value beside it', () => {
    const edited = { format: 'TD3', lines: ['P<INDDEMO<<ANITA<<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AM630833<1IND0611059M36010731066100677725<02'] };
    const ocr = { confidence: 0.82, rawText: 'R'.repeat(300), fields: {}, vizFields: {}, printedDates: ['2006-11-05'], mrz: edited, provider: 'tesseract' };
    expect(determineAuthenticity({ documentType: 'passport', ocr, tampering: CLEAN_IMAGE }).status).toBe(AUTHENTICITY.TAMPERED);
  });
});
