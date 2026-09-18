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
export function checksumIndicators(mrzParsed, ocrConfidence = 1) {
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
  return [indicator({
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
