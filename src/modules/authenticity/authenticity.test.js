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
import { checksumIndicators } from './consistency.js';
import { analysePixels } from '../tampering/analysis.js';
import { toGray, copyMove, aspectAnomaly, outliers, tile, noiseResidual } from '../tampering/forensics.js';
import { buildTd3, parseMrz } from '../validation/mrz.js';
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
    expect(JSON.stringify(r.reasons)).toMatch(/too unreliable|too few checks/i);
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
