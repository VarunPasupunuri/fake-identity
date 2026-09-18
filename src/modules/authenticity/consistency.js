/**
 * FIELD CONSISTENCY — the same fact, read from independent places on one document.
 *
 * A passport states a date of birth twice: printed in the visual zone, and encoded
 * in the machine readable zone. An Aadhaar states its number in print and again in
 * the QR code. Those representations are produced by the issuer together, so on an
 * unaltered document they agree. Someone editing the printed value has to find and
 * edit every other representation too, and usually does not.
 *
 * That makes disagreement between representations the strongest field-level
 * tampering evidence available without contacting the issuer — and unlike image
 * forensics it survives re-compression, screenshots and printing.
 *
 * This module compares, it does not judge: it reports which representations
 * disagree, over which field, with what values. The authenticity engine decides
 * what that means.
 *
 * Pure — no I/O, no clock.
 */
import { INDICATOR, CATEGORY, SEVERITY, INDICATOR_STATUS, indicator } from './indicators.js';
import { checkDigit } from '../validation/mrz.js';

/** Where a value was read from. */
export const SOURCE = Object.freeze({ VISUAL: 'visual', MRZ: 'mrz', BARCODE: 'barcode' });
export const SOURCE_LABEL = Object.freeze({ visual: 'the printed (visual) zone', mrz: 'the machine readable zone', barcode: 'the QR / barcode' });

/**
 * Fields worth cross-checking, with what a disagreement would mean.
 * `severity` is the consequence of a mismatch, not its likelihood.
 */
const COMPARABLE = [
  { key: 'dateOfBirth', label: 'Date of birth', severity: SEVERITY.HIGH, id: INDICATOR.VISUAL_MRZ_DOB_MISMATCH, kind: 'date' },
  { key: 'documentNumber', label: 'Document number', severity: SEVERITY.HIGH, id: INDICATOR.VISUAL_MRZ_PASSPORT_NUMBER_MISMATCH, kind: 'id' },
  { key: 'expiryDate', label: 'Expiry date', severity: SEVERITY.HIGH, id: INDICATOR.VISUAL_MRZ_EXPIRY_MISMATCH, kind: 'date' },
  { key: 'fullName', label: 'Name', severity: SEVERITY.HIGH, id: INDICATOR.VISUAL_MRZ_NAME_MISMATCH, kind: 'name' },
  { key: 'nationality', label: 'Nationality', severity: SEVERITY.MEDIUM, id: INDICATOR.VISUAL_MRZ_NATIONALITY_MISMATCH, kind: 'code' },
  { key: 'gender', label: 'Sex', severity: SEVERITY.MEDIUM, id: INDICATOR.VISUAL_MRZ_SEX_MISMATCH, kind: 'code' },
];

/** Region of the document a field is printed in, for the evidence overlay. */
const FIELD_REGION = {
  dateOfBirth: { x: 0.36, y: 0.42, w: 0.6, h: 0.14 },
  documentNumber: { x: 0.36, y: 0.16, w: 0.6, h: 0.12 },
  expiryDate: { x: 0.36, y: 0.56, w: 0.6, h: 0.14 },
  fullName: { x: 0.36, y: 0.22, w: 0.6, h: 0.18 },
  nationality: { x: 0.36, y: 0.34, w: 0.6, h: 0.1 },
  gender: { x: 0.36, y: 0.42, w: 0.3, h: 0.1 },
};

/** Comparison is on meaning, not on typography: case, spacing and filler are not differences. */
export function canonical(kind, value) {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return '';
  switch (kind) {
    case 'name': return s.replace(/[^A-Z]+/g, ' ').replace(/\s+/g, ' ').trim();
    case 'id': return s.replace(/[^A-Z0-9]/g, '');
    case 'code': return s.replace(/[^A-Z]/g, '');
    case 'date': return s;                 // both sides are already ISO yyyy-mm-dd
    default: return s.replace(/\s+/g, ' ');
  }
}

/**
 * A name is often abbreviated in one representation and not the other
 * ("ANITA SHARMA" vs "ANITA K SHARMA"). Treat one as agreeing with the other when
 * every word of the shorter appears, in order, in the longer.
 */
function namesAgree(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a.split(' '), b.split(' ')] : [b.split(' '), a.split(' ')];
  let i = 0;
  for (const w of long) if (i < short.length && w === short[i]) i += 1;
  return i === short.length && short.length > 0;
}

/**
 * Compare every field that appears in more than one representation.
 *
 * @param {{ visual?: Object, mrz?: Object, barcode?: Object, ocrConfidence?: number }} sources
 * @returns {{ indicators: Object[], compared: Object[] }}
 *   `compared` is the full table (agreements included) so the UI can show what was checked.
 */
export function compareRepresentations({ visual = {}, mrz = {}, barcode = {}, ocrConfidence = 1 } = {}) {
  const indicators = [];
  const compared = [];
  const available = { [SOURCE.VISUAL]: visual || {}, [SOURCE.MRZ]: mrz || {}, [SOURCE.BARCODE]: barcode || {} };

  for (const spec of COMPARABLE) {
    const present = Object.entries(available)
      .map(([source, fields]) => ({ source, raw: fields?.[spec.key] }))
      .filter((v) => v.raw !== undefined && v.raw !== null && v.raw !== '');
    if (present.length < 2) {
      compared.push({ field: spec.key, label: spec.label, status: 'not_compared', reason: present.length ? 'Only one representation of this field was readable.' : 'Field not readable.', values: present });
      continue;
    }

    const values = present.map((v) => ({ ...v, value: canonical(spec.kind, v.raw) }));
    const agree = spec.kind === 'name'
      ? values.every((v) => namesAgree(v.value, values[0].value))
      : values.every((v) => v.value === values[0].value);

    compared.push({
      field: spec.key, label: spec.label,
      status: agree ? 'agree' : 'disagree',
      values: values.map((v) => ({ source: v.source, value: v.raw })),
    });
    if (agree) continue;

    // Which pair disagrees, in the officer's words.
    const pairs = [];
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        const differ = spec.kind === 'name' ? !namesAgree(values[i].value, values[j].value) : values[i].value !== values[j].value;
        if (differ) pairs.push([values[i], values[j]]);
      }
    }
    const [a, b] = pairs[0];
    const involvesBarcode = pairs.some(([p, q]) => p.source === SOURCE.BARCODE || q.source === SOURCE.BARCODE);
    const id = involvesBarcode && !pairs.some(([p, q]) => p.source === SOURCE.MRZ || q.source === SOURCE.MRZ)
      ? INDICATOR.BARCODE_FIELD_MISMATCH
      : spec.id;

    // More disagreeing representations = more independent evidence of the same edit.
    const extra = Math.max(0, values.length - 2);
    indicators.push(indicator({
      id,
      category: CATEGORY.FIELD,
      severity: spec.severity,
      explanation: `${spec.label} differs between ${SOURCE_LABEL[a.source]} ("${a.raw}") and ${SOURCE_LABEL[b.source]} ("${b.raw}"). These are written by the issuer together, so they should agree; a difference indicates possible field-level modification.`,
      field: spec.key,
      region: FIELD_REGION[spec.key] || null,
      evidence: { field: spec.key, representations: values.map((v) => ({ source: v.source, value: v.raw })), disagreeingPairs: pairs.length },
      // A field that contradicts itself across issuer-written representations is the
      // strongest evidence of alteration obtainable without contacting the issuer, so one
      // such mismatch is on its own enough to cross the tampering threshold.
      riskContribution: (spec.severity === SEVERITY.HIGH ? 52 : 24) + extra * 8,
      // A mismatch read from poor OCR is less certain, but no less serious if real.
      confidence: Math.max(0.35, Math.min(1, ocrConfidence)) * (extra ? 1 : 0.95),
    }));
  }

  return { indicators, compared };
}

/**
 * Field aliases used inside encoded payloads. A QR code writes its own key names;
 * these map the common ones onto the canonical field names the rest of the platform
 * uses, so a code can be compared with the printed document at all.
 */
const BARCODE_ALIASES = {
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate', 'dateofbirthiso'],
  expiryDate: ['expirydate', 'expiry', 'validuntil', 'validtill', 'dateofexpiry'],
  fullName: ['fullname', 'name', 'holdername', 'subject'],
  documentNumber: ['documentnumber', 'docnumber', 'number', 'id', 'idnumber', 'registrationnumber', 'certificatenumber', 'rollnumber', 'pannumber', 'epicnumber', 'uid'],
  nationality: ['nationality', 'citizenship'],
  gender: ['gender', 'sex'],
};

/**
 * Canonical fields carried inside a decoded QR / barcode payload, when it is
 * structured. Free-text payloads (a URL, a reference string) carry no named
 * fields and yield nothing — a code that says nothing comparable is not evidence
 * either way, and must never produce a mismatch.
 *
 * @param {{ codes?: {rawValue?: string}[] }|null} barcode  the barcode module's result
 * @returns {Object} canonical field values found in the payload
 */
export function barcodeFields(barcode) {
  const out = {};
  for (const code of barcode?.codes || []) {
    const raw = String(code?.rawValue || '').trim();
    if (!/^[[{]/.test(raw)) continue;                 // not structured: nothing to compare
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    const flat = {};
    const walk = (v) => {
      if (!v || typeof v !== 'object') return;
      for (const [k, val] of Object.entries(v)) {
        if (val && typeof val === 'object') walk(val);
        else if (val !== null && val !== undefined && val !== '') flat[k.toLowerCase().replace(/[^a-z]/g, '')] = val;
      }
    };
    walk(parsed);
    for (const [canonical, aliases] of Object.entries(BARCODE_ALIASES)) {
      if (out[canonical] !== undefined) continue;
      const hit = aliases.find((a) => flat[a] !== undefined);
      if (hit) out[canonical] = flat[hit];
    }
  }
  return out;
}

/** MRZ check digits: a stated value that fails its own checksum was not written by the issuer. */


/**
 * Whether the machine readable zone was read correctly, judged by the zone itself.
 *
 * Recognition reports one confidence for the whole page, and a document
 * photographed on a patterned surface drags that average down however cleanly the
 * zone itself came out. The zone does not need the page's opinion: each field
 * carries a check digit derived from it, so several of them verifying is proof the
 * characters were read correctly. Misreading does not produce values that satisfy
 * their own checksums.
 *
 * The composite digit is excluded because it fails whenever any field it covers
 * was altered, which is the very case this has to stay usable for.
 */
export function mrzReadReliably(mrzParsed) {
  const checks = (mrzParsed?.checks || []).filter((c) => c.id !== 'mrz_composite');
  if (checks.length < 2) return false;
  return checks.filter((c) => c.ok).length >= 2;
}

/* ------------------------------------------------------------------ */
/* Recovering an edited value from the check digit that still guards it */
/* ------------------------------------------------------------------ */

/** How each field reads in a sentence. */
const CHECK_PHRASE = { dateOfBirth: 'The date of birth', expiryDate: 'The expiry date', documentNumber: 'The document number' };

/** Which printed field each machine readable zone check digit protects. */
const CHECK_FIELD = { mrz_dob: 'dateOfBirth', mrz_expiry: 'expiryDate', mrz_doc_number: 'documentNumber' };
/** Characters each of those fields can legitimately contain. */
const CHECK_ALPHABET = { dateOfBirth: '0123456789', expiryDate: '0123456789', documentNumber: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<' };

/** A six-digit MRZ date that could exist (yymmdd). */
const isMrzDate = (v) => /^\d{6}$/.test(v) && Number(v.slice(2, 4)) >= 1 && Number(v.slice(2, 4)) <= 12 && Number(v.slice(4, 6)) >= 1 && Number(v.slice(4, 6)) <= 31;

/** `yymmdd` as it is printed on the page, for saying plainly what was changed. */
const mrzDateToDmy = (v) => `${v.slice(4, 6)}/${v.slice(2, 4)}/${Number(v.slice(0, 2)) > 40 ? '19' : '20'}${v.slice(0, 2)}`;

/**
 * The value a failing check digit was originally computed for.
 *
 * Each field in the machine readable zone is followed by a digit derived from it.
 * Change the field and the digit no longer matches — and because the digit is a
 * function of the value it guards, the value that WOULD produce the digit still
 * present can be searched for. A single character differing is what an edit to
 * one field looks like, so that is the search: every one-character variant of
 * what is encoded, keeping those whose check digit is the one actually printed.
 *
 * This reads the forger's own arithmetic back. It is not an inference from
 * appearance — nothing about the image is consulted.
 *
 * @returns {{ field: string, candidates: string[] }|null}
 */
export function recoverFromCheckDigit(check) {
  const field = CHECK_FIELD[check?.id];
  if (!field || check.ok) return null;
  const observed = Number(check.actual);
  if (!Number.isInteger(observed)) return null;
  const alphabet = CHECK_ALPHABET[field];
  const isDate = field !== 'documentNumber';
  const found = new Set();
  for (let i = 0; i < check.value.length; i += 1) {
    for (const ch of alphabet) {
      if (ch === check.value[i]) continue;
      const candidate = check.value.slice(0, i) + ch + check.value.slice(i + 1);
      if (checkDigit(candidate) !== observed) continue;
      if (isDate && !isMrzDate(candidate)) continue;
      found.add(candidate);
    }
  }
  return found.size ? { field, candidates: [...found] } : null;
}


/**
 * Narrow the recovered candidates using the composite check digit.
 *
 * The composite digit is computed over several fields at once, including the one
 * that was edited, so it too was calculated from the original data and left
 * behind. A candidate that satisfies both digits is constrained twice over; one
 * that satisfies only the field's own digit can be dropped. Two independent
 * digits agreeing on the same value is also what separates a real edit from a
 * misread character, which would have no reason to satisfy either.
 *
 * The composite is only usable when it is among the failing checks; if it
 * verifies, the substitution cannot be tested against it and the candidates
 * stand as they are.
 */
function narrowByComposite(recovered, mrzParsed, failure) {
  const composite = (mrzParsed.checks || []).find((c) => c.id === 'mrz_composite');
  if (!composite || composite.ok || !composite.value) return recovered;
  const target = Number(composite.actual);
  if (!Number.isInteger(target)) return recovered;
  const at = composite.value.indexOf(failure.value);
  if (at < 0) return recovered;
  const consistent = recovered.candidates.filter((candidate) => {
    const swapped = composite.value.slice(0, at) + candidate + composite.value.slice(at + candidate.length);
    return checkDigit(swapped) === target;
  });
  return consistent.length ? { ...recovered, candidates: consistent, corroborated: true } : recovered;
}

/**
 * A field whose check digit betrays that it was edited.
 *
 * A failing check digit on its own is weak: misreading one character of the zone
 * breaks it just as an edit does. What separates the two is the printed page. If
 * recognition had misread the zone, the value printed in the visual zone would
 * still be the true one and would disagree with it — that case is already covered
 * by the field comparison. When the printed value AGREES with the zone and only
 * the check digit dissents, recognition cannot be the explanation: the same error
 * would have to occur twice, in two different typefaces, in two places on the
 * page. What remains is that both were changed and the check digit was not.
 *
 * The composite digit is expected to fail alongside the field it covers, so it is
 * not counted as separate damage.
 */
function reconstructionIndicators(mrzParsed, visual, ocrConfidence) {
  const failed = (mrzParsed.checks || []).filter((c) => !c.ok);
  const fieldFailures = failed.filter((c) => CHECK_FIELD[c.id]);
  // More than one edited field, or damage outside the composite, means the zone
  // was probably not read cleanly; that is the ordinary checksum finding, not this.
  const others = failed.filter((c) => c.id !== 'mrz_composite' && !CHECK_FIELD[c.id]);
  if (fieldFailures.length !== 1 || others.length) return [];

  let recovered = recoverFromCheckDigit(fieldFailures[0]);
  if (!recovered || recovered.candidates.length > 3) return [];
  recovered = narrowByComposite(recovered, mrzParsed, fieldFailures[0]);

  const encoded = mrzParsed.fields?.[recovered.field];
  const printed = visual?.[recovered.field];
  const agrees = Boolean(printed && encoded && String(printed) === String(encoded));
  const was = recovered.candidates.length === 1 && recovered.field !== 'documentNumber'
    ? mrzDateToDmy(recovered.candidates[0])
    : null;

  const label = CHECK_PHRASE[recovered.field] || recovered.field;
  return [indicator({
    id: INDICATOR.MRZ_FIELD_RECONSTRUCTED,
    category: CATEGORY.MRZ,
    severity: agrees ? SEVERITY.HIGH : SEVERITY.MEDIUM,
    field: recovered.field,
    // Point at the printed field, which is where an evaluator can see the change.
    region: FIELD_REGION[recovered.field] || null,
    explanation: `${label} does not match the check digit printed beside it in the machine readable zone.`
      + (was ? ` That digit is the one for ${was}, so the encoded value was changed from ${was}.` : '')
      + (agrees
        ? ' The printed value agrees with the altered zone, so both were changed together; a misreading would have had to occur identically in two separate places on the page.'
        : ' This can also happen when the zone is not read cleanly.'),
    evidence: {
      check: fieldFailures[0].id,
      encoded: fieldFailures[0].value,
      checkDigitPresent: fieldFailures[0].actual,
      checkDigitRequired: fieldFailures[0].expected,
      recoveredOriginal: recovered.candidates,
      printedAgreesWithZone: agrees,
    },
    riskContribution: agrees ? 34 : 14,
    // A zone that verifies its other check digits was read correctly, whatever the
    // page-wide confidence says, so the arithmetic is believed on its own terms.
    confidence: (mrzReadReliably(mrzParsed) ? 0.9 : Math.max(0.4, Math.min(1, ocrConfidence))) * (agrees ? 1 : 0.55),
  })];
}

export function checksumIndicators(mrzParsed, ocrConfidence = 1, visual = null) {
  if (!mrzParsed?.checks?.length) return [];
  const failed = mrzParsed.checks.filter((c) => !c.ok);
  if (!failed.length) {
    return [indicator({
      id: INDICATOR.MRZ_CHECKSUM_FAILURE,
      category: CATEGORY.MRZ,
      severity: SEVERITY.NONE,
      status: INDICATOR_STATUS.CLEAR,
      explanation: `All ${mrzParsed.checks.length} machine readable zone check digits verify. This confirms the MRZ is internally consistent; it does not establish that the document is genuine.`,
      field: 'mrz',
      evidence: { checks: mrzParsed.checks.map((c) => ({ id: c.id, ok: true })) },
    })];
  }
  // OCR mis-reading one MRZ character also breaks a checksum, so a single failure is
  // weaker evidence than several.
  const many = failed.length > 1;
  return [...reconstructionIndicators(mrzParsed, visual, ocrConfidence), indicator({
    id: INDICATOR.MRZ_CHECKSUM_FAILURE,
    category: CATEGORY.MRZ,
    severity: many ? SEVERITY.HIGH : SEVERITY.MEDIUM,
    explanation: `${failed.length} of ${mrzParsed.checks.length} machine readable zone check digits do not verify (${failed.map((c) => c.label.toLowerCase()).join(', ')}). Either the encoded data was altered, or the zone was not read cleanly.`,
    field: 'mrz',
    evidence: { failed: failed.map((c) => ({ id: c.id, value: c.value, expected: c.expected, actual: c.actual })) },
    riskContribution: many ? 30 : 16,
    confidence: Math.max(0.3, Math.min(1, ocrConfidence)) * (many ? 1 : 0.7),
  })];
}
