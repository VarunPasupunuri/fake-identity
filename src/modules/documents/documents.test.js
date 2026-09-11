import { describe, it, expect } from 'vitest';
import { classifyDocument, scoreProfile, CLASSIFICATION_FLOOR } from './classify.js';
import { extractFields, extractMarksTable, extractDates, extractIdentifiers, extractOrganizations, grabLabelled } from './extract.js';
import { validateWithProfile, barcodeChecks, applyRule } from './validate.js';
import { getProfile, listProfiles, resolveSelection, expectedFieldKeys, LEGACY_TYPES, AUTO_DETECT, GENERIC_DOCUMENT } from './registry.js';
import { fixtureText, fixtureBarcode, DEMO_DOCUMENTS, SCENARIO_OPTIONS } from './fixtures.js';
import { validateDocument } from '../validation/index.js';
import { buildTd3, parseMrz } from '../validation/mrz.js';
import { classifyDecodedContent, contentMatchesIdentifiers, encodedIdentifiers } from '../barcode/decode.js';
import { correlateIdentity } from '../identity/index.js';
import { verify as verifySynthetic } from '../issuer/synthetic.js';
import { verify as verifyUnavailable } from '../issuer/unavailable.js';
import { fuseEvidence, DECISION } from '../fusion/index.js';

const NOW = new Date('2026-09-11T00:00:00Z');

/** Run the real classify → extract → validate chain over a synthetic fixture. */
function screen(type, scenario = 'clean', { hint = {}, barcode } = {}) {
  const rawText = fixtureText(type, scenario);
  const cls = classifyDocument({ rawText, hint });
  const profile = getProfile(cls.type);
  const ex = extractFields(rawText, profile, { baseConfidence: scenario === 'poor_ocr' ? 0.42 : 0.9 });
  const ocr = { fields: ex.fields, fieldConfidence: ex.fieldConfidence, confidence: scenario === 'poor_ocr' ? 0.42 : 0.9, rawText, mrz: null, provider: 'mock' };
  const bc = barcode === undefined ? fixtureBarcode(type, scenario) : barcode;
  const validation = validateWithProfile(profile, ocr, { now: NOW, barcode: bc });
  return { rawText, cls, profile, ocr, validation, barcode: bc };
}

/* ------------------------------------------------------------------ */
describe('document-type registry', () => {
  it('exposes a profile for every registered type and falls back to generic for unknown ids', () => {
    for (const p of listProfiles()) {
      expect(getProfile(p.id).id).toBe(p.id);
      expect(typeof p.label).toBe('string');
      expect(['travel', 'identity', 'civil', 'academic', 'employment', 'certificate', 'generic']).toContain(p.category);
      expect(['required', 'optional', 'not_applicable']).toContain(p.face);
      expect(p.fields.length).toBeGreaterThan(0);
    }
    expect(getProfile('no_such_type').id).toBe(GENERIC_DOCUMENT);
    expect(getProfile(undefined).id).toBe(GENERIC_DOCUMENT);
  });

  it('keeps the original travel/identity types on the legacy rule engine', () => {
    expect(LEGACY_TYPES).toEqual(['passport', 'visa', 'national_id', 'driving_license', 'permit']);
  });

  it('resolves selector values into a type, a category, or auto-detect', () => {
    expect(resolveSelection(AUTO_DETECT)).toEqual({ type: null, category: null, auto: true });
    expect(resolveSelection('category:academic')).toEqual({ type: null, category: 'academic', auto: true });
    expect(resolveSelection('birth_certificate')).toEqual({ type: 'birth_certificate', category: null, auto: false });
    expect(resolveSelection('nonsense').type).toBe(GENERIC_DOCUMENT);
  });

  it('orders expected fields with the required ones first', () => {
    const keys = expectedFieldKeys('birth_certificate');
    expect(keys.slice(0, 4)).toEqual(['childName', 'dateOfBirth', 'placeOfBirth', 'registrationNumber']);
  });
});

/* ------------------------------------------------------------------ */
describe('document classification', () => {
  it('classifies every demo document type from its synthetic text', () => {
    const expected = {
      birth_certificate: 'birth_certificate', death_certificate: 'death_certificate', marks_memo: 'marks_memo',
      degree_certificate: 'degree_certificate', transcript: 'transcript', transfer_certificate: 'transfer_certificate',
      employment_certificate: 'employment_certificate', salary_certificate: 'salary_certificate',
      official_certificate: 'official_certificate', voter_id: 'voter_id',
    };
    for (const [fixture, type] of Object.entries(expected)) {
      const cls = classifyDocument({ rawText: fixtureText(fixture) });
      expect(`${fixture}→${cls.type}`).toBe(`${fixture}→${type}`);
      expect(cls.confidence).toBeGreaterThanOrEqual(CLASSIFICATION_FLOOR);
    }
  });

  it('uses the MRZ document code as the decisive signal for travel documents', () => {
    const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1988-04-12', gender: 'F', expiryDate: '2031-06-30' });
    const cls = classifyDocument({ rawText: `SOME HEADER\n${mrz.lines.join('\n')}`, mrz });
    expect(cls.type).toBe('passport');
    expect(cls.basis).toBe('mrz');
    expect(cls.confidence).toBeGreaterThan(0.8);
  });

  it('falls back to a generic official document instead of forcing a wrong type', () => {
    const cls = classifyDocument({ rawText: fixtureText('unknown', 'unknown') });
    expect(cls.type).toBe(GENERIC_DOCUMENT);
    expect(cls.basis).toBe('fallback');
    expect(cls.confidence).toBeLessThan(CLASSIFICATION_FLOOR);
    expect(cls.explanation).toMatch(/generic screening/i);
  });

  it('an officer-selected type overrides detection and is marked as such', () => {
    const cls = classifyDocument({ rawText: fixtureText('marks_memo'), hint: { type: 'degree_certificate' } });
    expect(cls.type).toBe('degree_certificate');
    expect(cls.overridden).toBe(true);
    expect(cls.basis).toBe('officer');
    expect(cls.confidence).toBe(1);
  });

  it('a category hint narrows detection to that category', () => {
    const cls = classifyDocument({ rawText: fixtureText('degree_certificate'), hint: { category: 'academic' } });
    expect(getProfile(cls.type).category).toBe('academic');
    expect(cls.candidates.every((c) => getProfile(c.type).category === 'academic')).toBe(true);
  });

  it('scores profiles only on signals that actually appear in the text', () => {
    expect(scoreProfile(getProfile('birth_certificate'), 'BIRTH CERTIFICATE NAME OF THE CHILD')).toBeGreaterThan(0.5);
    expect(scoreProfile(getProfile('birth_certificate'), 'INVOICE 4471')).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe('field extraction', () => {
  it('extracts labelled values by kind and never invents missing ones', () => {
    const text = 'NAME OF CHILD: AARAV DEMO KUMAR\nDATE OF BIRTH: 2016-05-20\nREGISTRATION NO.: BR-DEMO-2016-00417';
    expect(grabLabelled(text, ['NAME OF CHILD'], 'name').value).toBe('AARAV DEMO KUMAR');
    expect(grabLabelled(text, ['DATE OF BIRTH'], 'date').value).toBe('2016-05-20');
    expect(grabLabelled(text, ['PLACE OF DEATH'], 'text')).toBeNull();
  });

  it('extracts birth-certificate fields from the synthetic fixture', () => {
    const { ocr } = screen('birth_certificate');
    expect(ocr.fields.childName).toBe('AARAV DEMO KUMAR');
    expect(ocr.fields.dateOfBirth).toBe('2016-05-20');
    expect(ocr.fields.registrationNumber).toBe('BR-DEMO-2016-00417');
    expect(ocr.fields.registrationDate).toBe('2016-06-02');
    expect(ocr.fields.fullName).toBe('AARAV DEMO KUMAR'); // subject mapped for history / watchlist
  });

  it('extracts death-certificate fields including both dates', () => {
    const { ocr } = screen('death_certificate');
    expect(ocr.fields.deceasedName).toBe('MOHAN DEMO VERMA');
    expect(ocr.fields.dateOfDeath).toBe('2024-11-02');
    expect(ocr.fields.dateOfBirth).toBe('1941-03-14');
    expect(ocr.fields.registrationNumber).toBe('DR-DEMO-2024-01932');
  });

  it('reads an academic marks table with subjects, marks, maxima and grades', () => {
    const rows = extractMarksTable('ENGINEERING MATHEMATICS-III 78 100 A\nDATA STRUCTURES 62 100 B\nTOTAL MARKS 335\nROLL NO 21DEMO0512');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'ENGINEERING MATHEMATICS-III', marks: 78, max: 100, grade: 'A' });
    expect(rows.some((r) => /TOTAL|ROLL/.test(r.name))).toBe(false);
  });

  it('extracts marks-memo identity and table fields', () => {
    const { ocr } = screen('marks_memo');
    expect(ocr.fields.studentName).toBe('NEHA DEMO REDDY');
    expect(ocr.fields.rollNumber).toBe('21DEMO0512');
    expect(ocr.fields.marks).toHaveLength(5);
    expect(ocr.fields.totalMarks).toBe(335);
  });

  it('extracts employment fields', () => {
    const { ocr } = screen('employment_certificate');
    expect(ocr.fields.employeeName).toBe('ROHAN DEMO IYER');
    expect(ocr.fields.employeeId).toBe('DEMO-EMP-2210');
    expect(ocr.fields.joiningDate).toBe('2021-06-01');
    expect(ocr.fields.leavingDate).toBe('2025-03-28');
  });

  it('generic documents fall back to dates, identifiers, organisations and a title', () => {
    const { cls, ocr } = screen('generic_document');
    expect(cls.type).toBe(GENERIC_DOCUMENT);
    expect(ocr.fields.title).toMatch(/ACKNOWLEDGEMENT/);
    expect(ocr.fields.dates).toContain('2025-04-02');
    expect(ocr.fields.identifiers.length).toBeGreaterThan(0);
    expect(ocr.fields.organizations.length).toBeGreaterThan(0);
  });

  it('token scanners ignore dates when collecting identifiers', () => {
    expect(extractDates('ISSUED 02/04/2025 AND 2024-01-15')).toEqual(['2025-04-02', '2024-01-15']);
    expect(extractIdentifiers('REF DEMO-HO-2025-88213 ON 02/04/2025')).toContain('DEMO-HO-2025-88213');
    expect(extractIdentifiers('02/04/2025')).toEqual([]);
    expect(extractOrganizations('SAMPLE CITY MUNICIPAL CORPORATION ISSUED THIS')[0]).toMatch(/MUNICIPAL CORPORATION/);
  });
});

/* ------------------------------------------------------------------ */
describe('profile validation rules', () => {
  it('passes a clean birth certificate', () => {
    const { validation } = screen('birth_certificate');
    expect(validation.failed).toBe(0);
    expect(validation.checks.find((c) => c.id === 'required_childName').status).toBe('pass');
    expect(validation.checks.find((c) => c.id === 'rule_dateOfBirth_before_registrationDate').status).toBe('pass');
  });

  it('fails a birth certificate registered before the birth', () => {
    const { validation } = screen('birth_certificate', 'inconsistent_dates');
    const check = validation.checks.find((c) => c.id === 'rule_dateOfBirth_before_registrationDate');
    expect(check.status).toBe('fail');
    expect(check.detail).toMatch(/contradict/);
  });

  it('fails a death certificate whose death precedes the birth', () => {
    const { validation } = screen('death_certificate', 'inconsistent_dates');
    const order = validation.checks.find((c) => c.id === 'rule_dateOfBirth_before_dateOfDeath');
    expect(order.status).toBe('fail');
    expect(order.severity).toBe('critical');
  });

  it('reports missing required fields without inventing values', () => {
    const { ocr, validation } = screen('birth_certificate', 'missing_fields');
    expect(ocr.fields.childName).toBeUndefined();
    const req = validation.checks.find((c) => c.id === 'required_childName');
    expect(req.status).toBe('fail');
    expect(req.severity).toBe('critical');
    expect(req.detail).toMatch(/could not be read/);
  });

  it('detects an altered marks memo whose subject marks no longer add up', () => {
    const { validation } = screen('marks_memo', 'suspicious');
    const total = validation.checks.find((c) => c.id === 'marks_total_consistent');
    expect(total.status).toBe('fail');
    expect(total.severity).toBe('critical');
    expect(total.detail).toMatch(/sum to 355 but the printed total is 335/);
  });

  it('accepts a marks memo whose totals reconcile', () => {
    const { validation } = screen('marks_memo');
    expect(validation.checks.find((c) => c.id === 'marks_total_consistent').status).toBe('pass');
  });

  it('rejects an out-of-range CGPA on a degree certificate', () => {
    const { validation } = screen('degree_certificate', 'suspicious');
    expect(validation.checks.find((c) => c.id === 'rule_range_cgpa').status).toBe('fail');
  });

  it('flags an employment certificate issued before the employee joined', () => {
    const { validation } = screen('employment_certificate', 'inconsistent_dates');
    expect(validation.checks.find((c) => c.id === 'rule_joiningDate_before_leavingDate').status).toBe('fail');
  });

  it('generic documents are screened without a document-specific rule set and are not failed for it', () => {
    const { validation } = screen('generic_document');
    expect(validation.failed).toBe(0);
    expect(validation.checks.some((c) => c.id === 'issuer_present')).toBe(true);
  });

  it('rule interpreters are pure and skip when their fields are absent', () => {
    const ctx = { now: NOW, today: '2026-09-11', has: (k) => ({ a: '2020-01-01' })[k] !== undefined };
    expect(applyRule({ type: 'date_order', earlier: 'a', later: 'b' }, { a: '2020-01-01' }, ctx)).toBeNull();
    expect(applyRule({ type: 'numeric_range', field: 'x', min: 0, max: 10 }, {}, { ...ctx, has: () => false })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
describe('QR / barcode handling', () => {
  it('classifies decoded payloads and flags unusual links without opening them', () => {
    expect(classifyDecodedContent('https://verify.demoland.example/rc/1')).toMatchObject({ kind: 'url', host: 'verify.demoland.example', suspicious: false });
    expect(classifyDecodedContent('http://bit.ly/x')).toMatchObject({ kind: 'url', suspicious: true });
    expect(classifyDecodedContent('{"a":1}').kind).toBe('json');
    expect(classifyDecodedContent('').kind).toBe('empty');
  });

  it('compares encoded content with the printed identifiers', () => {
    const raw = JSON.stringify({ registrationNumber: 'BR-DEMO-2016-00417', name: 'AARAV DEMO KUMAR' });
    expect(contentMatchesIdentifiers(raw, { identifiers: ['BR-DEMO-2016-00417'] }).matched.length).toBe(1);
    const mismatch = contentMatchesIdentifiers(raw, { identifiers: ['BR-DEMO-2016-0098'] });
    expect(mismatch.matched).toEqual([]);
    expect(mismatch.comparable).toBe(true);
    expect(encodedIdentifiers(raw)).toContain('BR-DEMO-2016-00417');
  });

  it('a decoded code never asserts authenticity, only consistency', () => {
    const { validation } = screen('official_certificate');
    const url = validation.checks.find((c) => /^barcode_url/.test(c.id));
    expect(url.detail).toMatch(/not proof of authenticity|only proves what it encodes/i);
    expect(validation.checks.every((c) => !/officially verified/i.test(c.detail))).toBe(true);
  });

  it('detects a printed identifier that disagrees with the encoded one', () => {
    const { validation } = screen('birth_certificate', 'suspicious');
    const cons = validation.checks.find((c) => c.id === 'barcode_consistency');
    expect(cons.status).toBe('fail');
    expect(cons.detail).toMatch(/do not match the printed/);
  });

  it('an unreadable code warns rather than failing', () => {
    const checks = barcodeChecks({ status: 'unreadable', codes: [] }, {}, getProfile('birth_certificate'));
    expect(checks[0]).toMatchObject({ id: 'barcode_readable', status: 'warn' });
  });

  it('no code detected is informational, never a failure', () => {
    const checks = barcodeChecks({ status: 'not_found', codes: [] }, {}, getProfile('birth_certificate'));
    expect(checks[0]).toMatchObject({ id: 'barcode_present', status: 'skip' });
  });

  it('adds barcode checks to legacy travel documents too', () => {
    const mrz = buildTd3({ docCode: 'P<', issuingCountry: 'IND', surname: 'SHARMA', givenNames: 'ANITA', documentNumber: 'M8412345', nationality: 'IND', dateOfBirth: '1988-04-12', gender: 'F', expiryDate: '2031-06-30' });
    const ocr = { fields: parseMrz(mrz).fields, mrz, confidence: 0.95 };
    const v = validateDocument('passport', ocr, { now: NOW, barcode: { status: 'detected', codes: [{ format: 'qr_code', rawValue: 'M8412345' }] } });
    expect(v.checks.find((c) => c.id === 'barcode_consistency').status).toBe('pass');
    expect(v.checks.find((c) => c.id === 'mrz_doc_number').status).toBe('pass'); // legacy rules intact
  });
});

/* ------------------------------------------------------------------ */
describe('identity correlation', () => {
  const history = [
    { id: 'A1', subjectName: 'AARAV DEMO KUMAR', documentNumber: 'BR-DEMO-2016-00417', documentType: 'birth_certificate', createdAt: '2026-01-02T00:00:00Z', decision: 'accept', ocr: { fields: { dateOfBirth: '2016-05-20' } } },
    { id: 'B2', subjectName: 'AARAV DEMO KUMAR', documentNumber: 'P9988776', documentType: 'passport', createdAt: '2026-02-02T00:00:00Z', ocr: { fields: { dateOfBirth: '2011-05-20' } } },
  ];

  it('reports a repeated document without claiming it is the same person', () => {
    const r = correlateIdentity({ fields: { fullName: 'AARAV DEMO KUMAR', documentNumber: 'BR-DEMO-2016-00417', dateOfBirth: '2016-05-20' }, documentType: 'birth_certificate', history });
    const link = r.links.find((l) => l.screeningId === 'A1');
    expect(link.kind).toBe('repeat_document');
    expect(r.explanation).toMatch(/requires officer review/);
    expect(JSON.stringify(r)).not.toMatch(/same person/i);
  });

  it('flags a conflicting identity when the same name carries a different date of birth', () => {
    const r = correlateIdentity({ fields: { fullName: 'AARAV DEMO KUMAR', documentNumber: 'X1', dateOfBirth: '2016-05-20' }, documentType: 'passport', history });
    const link = r.links.find((l) => l.screeningId === 'B2');
    expect(link.kind).toBe('conflicting_identity');
    expect(link.conflicts).toContain('dateOfBirth');
  });

  it('is unavailable rather than empty when nothing identifiable was extracted', () => {
    expect(correlateIdentity({ fields: {}, history }).status).toBe('unavailable');
  });

  it('reports no correlations when the history is empty', () => {
    const r = correlateIdentity({ fields: { fullName: 'SOMEONE ELSE' }, history: [] });
    expect(r).toMatchObject({ status: 'ok', links: [] });
  });
});

/* ------------------------------------------------------------------ */
describe('issuer verification', () => {
  it('defaults to unavailable and never fabricates a verification', async () => {
    const r = await verifyUnavailable();
    expect(r.status).toBe('unavailable');
    expect(r.explanation).toMatch(/no authorised external data source/i);
  });

  it('the synthetic register verifies a fixture record and labels itself synthetic', async () => {
    const r = await verifySynthetic({ fields: { registrationNumber: 'BR-DEMO-2016-00417', fullName: 'AARAV DEMO KUMAR', dateOfBirth: '2016-05-20' }, documentType: 'birth_certificate' });
    expect(r.status).toBe('verified');
    expect(r.synthetic).toBe(true);
    expect(r.source).toMatch(/synthetic/i);
  });

  it('absence from the register is not treated as proof of forgery', async () => {
    const r = await verifySynthetic({ fields: { registrationNumber: 'BR-DEMO-9999-99999' }, documentType: 'birth_certificate' });
    expect(r.status).toBe('not_found');
    expect(r.explanation).toMatch(/not proof of forgery/i);
  });

  it('a contradicting register record is a mismatch', async () => {
    const r = await verifySynthetic({ fields: { registrationNumber: 'BR-DEMO-2016-00417', fullName: 'SOMEONE ELSE' }, documentType: 'birth_certificate' });
    expect(r.status).toBe('mismatch');
    expect(r.conflicts).toContain('name');
  });
});

/* ------------------------------------------------------------------ */
describe('evidence fusion over non-travel documents', () => {
  const fuse = (type, scenario, extra = {}) => {
    const s = screen(type, scenario);
    return fuseEvidence({ documentType: s.profile.id, ocr: s.ocr, validation: s.validation, tampering: { score: 4, flags: [], evidence: {}, provider: 'local-ela' }, face: null, barcode: s.barcode, classification: s.cls, providers: { ocr: 'tesseract', tamper: 'local' }, ...extra });
  };

  it('a clean birth certificate is LIKELY AUTHENTIC and face comparison is not applicable', () => {
    const f = fuse('birth_certificate', 'clean');
    expect(f.decision).toBe(DECISION.APPROVE);
    const face = f.evidence.find((e) => e.source === 'face');
    expect(face).toMatchObject({ id: 'face:not_applicable', status: 'info', riskContribution: 0 });
    expect(f.trust.biometricConsistency).toMatchObject({ available: false, notApplicable: true });
    expect(f.confidence.components.find((c) => c.id === 'face').points).toBeGreaterThan(0);
  });

  it('contradictory dates on a death certificate reach REVIEW or SUSPICIOUS with a traceable reason', () => {
    const f = fuse('death_certificate', 'inconsistent_dates');
    expect([DECISION.REVIEW, DECISION.REJECT]).toContain(f.decision);
    expect(f.evidence.some((e) => e.id === 'validation:rule_dateOfBirth_before_dateOfDeath' && e.status === 'fail')).toBe(true);
    expect(f.chain.some((c) => c.evidenceId === 'validation:rule_dateOfBirth_before_dateOfDeath')).toBe(true);
  });

  it('an altered marks memo is not approved and cites the marks inconsistency', () => {
    const f = fuse('marks_memo', 'suspicious');
    expect(f.decision).not.toBe(DECISION.APPROVE);
    expect(f.rationale).toMatch(/subject marks add up to the printed total|marks/i);
  });

  it('an unknown document is screened generically and never rejected for being unknown', () => {
    const f = fuse('generic_document', 'clean');
    expect(f.documentType).toBe(GENERIC_DOCUMENT);
    expect(f.decision).not.toBe(DECISION.REJECT);
    expect(f.evidence.some((e) => e.id === 'classification:type')).toBe(true);
  });

  it('poor OCR lowers confidence and yields INSUFFICIENT EVIDENCE rather than a verdict', () => {
    const s = screen('birth_certificate', 'poor_ocr');
    const f = fuseEvidence({ documentType: s.profile.id, ocr: s.ocr, validation: s.validation, tampering: null, face: null, barcode: s.barcode, classification: s.cls, providers: {} });
    expect(f.confidence.score).toBeLessThan(70);
    expect([DECISION.INSUFFICIENT, DECISION.REVIEW]).toContain(f.decision);
    expect(f.evidence.filter((e) => e.status === 'fail').every((e) => !/unavailable/i.test(e.label))).toBe(true);
  });

  it('VERIFIED is only produced when an issuer source actually confirms the record', () => {
    const confirmed = fuse('birth_certificate', 'clean', { issuer: { status: 'verified', provider: 'synthetic', source: 'Synthetic demo issuer register', synthetic: true, matchedFields: ['identifier'], conflicts: [], explanation: 'Record found.' } });
    expect(confirmed.decision).toBe(DECISION.VERIFIED);
    const unknownIssuer = fuse('birth_certificate', 'clean', { issuer: { status: 'unavailable', provider: 'unavailable', source: 'none', explanation: 'not performed' } });
    expect(unknownIssuer.decision).toBe(DECISION.APPROVE);
    expect(unknownIssuer.decision).not.toBe(DECISION.VERIFIED);
  });

  it('an issuer contradiction is conclusive', () => {
    const f = fuse('birth_certificate', 'clean', { issuer: { status: 'mismatch', provider: 'synthetic', source: 'Synthetic demo issuer register', synthetic: true, matchedFields: ['identifier'], conflicts: ['name'], explanation: 'Register disagrees.' } });
    expect(f.decision).toBe(DECISION.REJECT);
  });

  it('QR evidence carries no risk of its own — consistency is scored by the validation rules', () => {
    const f = fuse('birth_certificate', 'clean');
    expect(f.evidence.find((e) => e.source === 'barcode').riskContribution).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe('synthetic fixtures', () => {
  it('are clearly marked as demo data and reference no real person', () => {
    for (const d of DEMO_DOCUMENTS) {
      const text = fixtureText(d.value);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(20);
    }
    const civil = `${fixtureText('birth_certificate')}${fixtureText('death_certificate')}${fixtureText('marks_memo')}`;
    expect(civil).toMatch(/DEMO/);
  });

  it('offer a scenario for every documented failure mode', () => {
    expect(SCENARIO_OPTIONS.map((s) => s.value)).toEqual(['clean', 'suspicious', 'missing_fields', 'inconsistent_dates', 'poor_ocr', 'unreadable_qr', 'unknown']);
  });
});
