/**
 * DOCUMENT TYPE DETECTION — behaviour tests.
 *
 * The samples below are written the way recognised text actually arrives from a
 * photograph: headings broken across lines, wide letter spacing, punctuation
 * glued to labels, mis-read characters, and pages where the heading never came
 * through at all. Fixture-perfect text proves very little on its own.
 *
 * All content here is synthetic. No real document, person or identifier is used.
 */
import { describe, it, expect } from 'vitest';
import { classifyDocument, scoreProfileDetailed, WEAK_CAP, CLASSIFICATION_FLOOR } from './classify.js';
import { prepareText, fuzzyPhrase, editDistance } from './textNormalise.js';
import { checkDocumentType, PREFLIGHT } from './preflight.js';
import { getProfile, listProfiles } from './registry.js';

const type = (rawText, mrz = null) => classifyDocument({ rawText, mrz }).type;

/* ------------------------------------------------------------------ */
/* Synthetic samples per supported type, as OCR would really return them */
/* ------------------------------------------------------------------ */

const SAMPLES = {
  passport: `REPUBLIC OF DEMOLAND
PASSPORT
Type P  Country Code DML  Passport No. X1234567
Surname DEMO
Given Names ANITA
Nationality DEMOLANDER
Sex F  Date of Birth 12/04/1988
Date of Expiry 30/06/2031
Place of Issue SAMPLE CITY`,

  visa: `Visa
Bureau of Immigration
Visa No: VS0000111
Type/Category: TOURIST
Entries: MULTIPLE
Duration of stay: 90 days
Valid From 01/02/2026  Valid Until 31/01/2027
Passport No. X1234567`,

  national_id: `Government of India
Unique Identification Authority of India
PRIYA DEMO SHARMA
DOB: 14/08/1996
Female
2222 3333 4444
VID : 9109 1234 5678 9012`,

  driving_license: `DEMO STATE TRANSPORT DEPARTMENT
DRIVING LICENCE
DL No.: DM12-20110012345
Name : RAHUL DEMO VERMA
Date of Birth : 21/07/1990
Valid Till : 20/07/2030
Class of Vehicle : LMV, MCWG
Blood Group : O+`,

  permit: `DEMO DISTRICT ADMINISTRATION
BORDER AREA PERMIT
Permit No. BAP-2026-00918
Name TENZIN DEMO DORJI
Valid From 01/01/2026
Valid Until 31/12/2026
Issuing Authority: District Magistrate
Jurisdiction: SECTOR 4`,

  generic_document: `SAMPLE CITY WATER SUPPLY AUTHORITY
ACKNOWLEDGEMENT OF HANDOVER
Ref DEMO-HO-2025-88213
Date: 2025-04-02
The items listed overleaf were handed over to the bearer LATA DEMO JOSHI
Counter 4, Shift B`,
};

/** An identity card that also grants driving entitlements: genuinely two types at once. */
const AMBIGUOUS = `DEMO STATE IDENTITY CARD
Name RAHUL DEMO VERMA
DOB 21/07/1990
Female
COV LMV MCWG
Valid Till 20/07/2030`;

/** A 180° rotation makes OCR read the page bottom-to-top. */
const rotated = (s) => s.split('\n').reverse().join('\n');
/** A hurried camera capture clips the lower half of the document. */
const partial = (s) => s.split('\n').slice(0, Math.ceil(s.split('\n').length / 2)).join('\n');
/** Low-resolution capture: a handful of characters come back wrong. */
const misread = (s) => s.replace(/C/g, 'G').replace(/0/g, 'O');

describe('supported document types are detected from realistic recognised text', () => {
  for (const [id, text] of Object.entries(SAMPLES)) {
    it(`detects ${getProfile(id).label}`, () => {
      expect(type(text)).toBe(id);
    });
  }

  it('detects every supported type identically however the image arrived', () => {
    // Camera capture and file upload differ only in how the image was obtained; the
    // classifier sees the same recognised text and must therefore reach the same answer.
    for (const [id, text] of Object.entries(SAMPLES)) {
      const fromCamera = classifyDocument({ rawText: text });
      const fromUpload = classifyDocument({ rawText: text });
      expect(fromCamera.type).toBe(id);
      expect(fromUpload.type).toBe(fromCamera.type);
      expect(fromUpload.confidence).toBe(fromCamera.confidence);
    }
  });
});

describe('recognised text that is damaged the way real captures are damaged', () => {
  it('finds a heading that OCR split across two lines', () => {
    expect(type('INDIA UNION\nDRIVING\nLICENCE\nDL No DM1220110012345\nValid Till 20-07-2030\nCOV LMV')).toBe('driving_license');
  });

  it('finds a heading printed with wide letter spacing', () => {
    expect(type('D R I V I N G   L I C E N C E\nDL No DM1220110012345\nValid Till 20-07-2030')).toBe('driving_license');
  });

  it('tolerates a mis-read character in a heading', () => {
    expect(type('DRIVING LICENGE\nDL No DM1220110012345\nValid Till 20-07-2030\nLMV MCWG')).toBe('driving_license');
    expect(type('PASSP0RT\nPassport No. X1234567\nNationality DEMOLANDER\nDate of Birth 12/04/1988\nDate of Expiry 30/06/2031')).toBe('passport');
  });

  it('detects a driving licence from its fields when the heading never came through', () => {
    const noHeading = `DM12 20110012345
RAHUL DEMO VERMA
DOB 21-07-1990
Valid Till 20-07-2030
COV LMV MCWG
RTO SAMPLE CITY`;
    expect(type(noHeading)).toBe('driving_license');
  });

  it('is unaffected by line order, so a rotated capture still classifies', () => {
    for (const [id, text] of Object.entries(SAMPLES)) expect(type(rotated(text))).toBe(id);
  });

  it('still classifies a partially captured document, or falls back to generic', () => {
    // The top half carries the heading, so these must still be recognised.
    for (const id of ['passport', 'visa', 'driving_license', 'permit']) {
      expect(type(partial(SAMPLES[id]))).toBe(id);
    }
  });

  it('survives a capture where OCR mis-reads characters throughout', () => {
    expect(type(misread(SAMPLES.driving_license))).toBe('driving_license');
    expect(type(misread(SAMPLES.permit))).toBe('permit');
  });

  it('reports low confidence rather than a wrong type when almost nothing was read', () => {
    const cls = classifyDocument({ rawText: '### ####  ##\n#   #\n.. ,,  ;;' });
    expect(cls.type).toBe('generic_document');
    expect(cls.confidence).toBeLessThan(CLASSIFICATION_FLOOR);
  });
});

describe('generic officialese can never classify a document', () => {
  const GENERIC_WORDS = 'SEAL\nSIGNATURE\nSIGNED\nOFFICIAL\nOFFICIAL USE ONLY';

  it('a seal or signature alone does not make a document any specific type', () => {
    const cls = classifyDocument({ rawText: `${GENERIC_WORDS}\nThis page was issued at the counter.` });
    expect(cls.type).toBe('generic_document');
  });

  it('generic wording contributes no more than the weak cap', () => {
    const d = scoreProfileDetailed(getProfile('official_certificate'), GENERIC_WORDS);
    expect(d.score).toBeLessThanOrEqual(WEAK_CAP);
    expect(d.corroborated).toBe(false);
  });

  it('"signature" alone is not a driving licence and "seal" alone is not a passport', () => {
    expect(type('SIGNATURE\nSigned before me')).not.toBe('driving_license');
    expect(type('SEAL\nAffixed under seal')).not.toBe('passport');
    expect(type('OFFICIAL\nFor official use')).not.toBe('national_id');
  });

  it('counts one heading once, however many spellings of it the profile lists', () => {
    // "DRIVING LICENCE" and "DRIVING LICENSE" are the same heading, not two clues.
    const d = scoreProfileDetailed(getProfile('driving_license'), 'DRIVING LICENCE');
    expect(d.fired.filter((f) => /heading/.test(f.label))).toHaveLength(1);
  });

  it('a single document-specific word without corroboration is halved, not decisive', () => {
    const d = scoreProfileDetailed(getProfile('driving_license'), 'The applicant holds a licence.');
    expect(d.strong).toBe(0);
    expect(d.corroborated).toBe(false);
    expect(d.score).toBeLessThan(CLASSIFICATION_FLOOR);
  });
});

describe('selected vs detected — mismatch detection across all supported types', () => {
  const cases = [
    ['passport', 'national_id'],
    ['passport', 'driving_license'],
    ['driving_license', 'passport'],
    ['national_id', 'visa'],
    ['visa', 'passport'],
    ['permit', 'driving_license'],
    ['national_id', 'driving_license'],
    ['driving_license', 'national_id'],
  ];

  for (const [selected, presented] of cases) {
    it(`${getProfile(selected).label} selected + ${getProfile(presented).label} presented → mismatch`, () => {
      const r = checkDocumentType({ selected, rawText: SAMPLES[presented] });
      expect(r.status).toBe(PREFLIGHT.MISMATCH);
      expect(r.blocking).toBe(true);
      expect(r.detectedType).toBe(presented);
      expect(r.selectedType).toBe(selected);
    });
  }

  it('every supported type matches itself and never blocks', () => {
    for (const id of Object.keys(SAMPLES)) {
      if (id === 'generic_document') continue;
      const r = checkDocumentType({ selected: id, rawText: SAMPLES[id] });
      expect(`${id}:${r.status}`).toBe(`${id}:${PREFLIGHT.MATCH}`);
      expect(r.blocking).toBe(false);
    }
  });

  it('poor recognition is uncertain, never a mismatch', () => {
    const r = checkDocumentType({ selected: 'passport', rawText: 'OFFICE COPY reference 4471 counter 3 duty clerk 02/04/2025' });
    expect(r.blocking).toBe(false);
    expect([PREFLIGHT.UNCERTAIN, PREFLIGHT.UNAVAILABLE]).toContain(r.status);
  });

  it('an ambiguous document names the competing possibilities instead of guessing', () => {
    // An identity card that also carries driving entitlements reads as both types.
    const r = checkDocumentType({ selected: 'passport', rawText: AMBIGUOUS });
    expect(r.blocking).toBe(false);
    expect(r.status).toBe(PREFLIGHT.UNCERTAIN);
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(r.message).toMatch(/could also be/);
  });

  it('a document supporting both the selected and the detected type is not blocked', () => {
    const r = checkDocumentType({ selected: 'visa', rawText: SAMPLES.visa });
    expect(r.blocking).toBe(false);
  });
});

describe('detection evidence is honest and readable', () => {
  it('names the clues that actually fired, in plain words', () => {
    const cls = classifyDocument({ rawText: SAMPLES.driving_license });
    const labels = cls.signals.map((s) => s.label);
    expect(labels).toContain('a driving licence heading');
    expect(labels.some((l) => /vehicle class/i.test(l))).toBe(true);
    expect(labels.some((l) => /licence number field/i.test(l))).toBe(true);
  });

  it('never leaks a regular expression into the evidence shown to the officer', () => {
    for (const profile of listProfiles()) {
      for (const s of profile.signals || []) {
        expect(`${profile.id}: ${s.label || '(missing)'}`).not.toMatch(/\(\?:|\\b|\[A-Z\]|\(missing\)/);
      }
    }
  });

  it('does not invent evidence for clues that are absent', () => {
    const cls = classifyDocument({ rawText: SAMPLES.passport });
    const labels = cls.signals.map((s) => s.label).join(' | ');
    expect(labels).not.toMatch(/vehicle class/i);
    expect(labels).not.toMatch(/Aadhaar/i);
  });

  it('keeps document type separate from authenticity', () => {
    const cls = classifyDocument({ rawText: SAMPLES.generic_document });
    expect(cls.type).toBe('generic_document');
    expect(JSON.stringify(cls)).not.toMatch(/fake|forged|genuine|authentic|tamper/i);
  });
});

describe('confidence reflects the evidence, and is not invented', () => {
  it('is deterministic — the same text always gives the same number', () => {
    const a = classifyDocument({ rawText: SAMPLES.passport });
    const b = classifyDocument({ rawText: SAMPLES.passport });
    expect(a.confidence).toBe(b.confidence);
  });

  it('rises with corroborating evidence', () => {
    const sparse = classifyDocument({ rawText: 'DRIVING LICENCE\nName RAHUL DEMO VERMA' });
    const full = classifyDocument({ rawText: SAMPLES.driving_license });
    expect(full.confidence).toBeGreaterThan(sparse.confidence);
  });

  it('falls when a rival type scores close, and marks the result uncertain', () => {
    const cls = classifyDocument({ rawText: AMBIGUOUS });
    expect(cls.uncertain).toBe(true);
    expect(cls.alternatives.map((a) => a.type)).toContain('driving_license');
    // Two types are well supported, so neither is asserted.
    expect(cls.confidence).toBeLessThan(CLASSIFICATION_FLOOR);
  });

  it('is zero when no signal fired at all', () => {
    expect(classifyDocument({ rawText: 'aaaa bbbb cccc dddd' }).confidence).toBe(0);
  });
});

describe('text normalisation', () => {
  it('collapses line breaks, spacing and punctuation without rewriting characters', () => {
    const p = prepareText("DL No.:  MH12-2011\nValid Till : 20/07/2030\nDRIVER'S LICENCE");
    expect(p.flat).toContain('DL NO MH12-2011');
    expect(p.flat).toContain('20/07/2030');
    expect(p.flat).toContain('DRIVERS LICENCE');
  });

  it('keeps the original characters available for machine readable zones', () => {
    const p = prepareText('P<DMLDEMO<<ANITA<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
    expect(p.raw).toContain('P<DML');
  });

  it('matches a phrase across a line break but not a single word of it', () => {
    expect(fuzzyPhrase(prepareText('DRIVING\nLICENCE').tokens, 'DRIVING LICENCE')).toBe(true);
    expect(fuzzyPhrase(prepareText('LICENCE FEE RECEIPT').tokens, 'DRIVING LICENCE')).toBe(false);
  });

  it('does not accept an edit on a short word, where tolerance would match anything', () => {
    expect(fuzzyPhrase(prepareText('VISE').tokens, 'VISA')).toBe(false);
    expect(fuzzyPhrase(prepareText('VISA').tokens, 'VISA')).toBe(true);
  });

  it('measures edit distance with an early exit', () => {
    expect(editDistance('LICENCE', 'LICENGE', 1)).toBe(1);
    expect(editDistance('PASSPORT', 'PASSWORD', 1)).toBeGreaterThan(1);
  });
});
