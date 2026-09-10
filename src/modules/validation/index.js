/**
 * Document Validation module.
 * Input: document type + OCR result. Output: list of pass/fail/warn checks.
 * Pure — safe to run in the browser, a Cloud Function, or a test.
 */
import { parseMrz, isValidIsoDate } from './mrz.js';
import { DOC_NUMBER_PATTERNS, REQUIRED_FIELDS, FIELD_LABELS, ISO3, daysBetween, todayIso, ageFromDob } from './rules.js';

/**
 * @param {import('../types.js').DocumentType} documentType
 * @param {import('../types.js').OcrResult} ocr
 * @param {{ now?: Date }} [opts]
 * @returns {import('../types.js').ValidationResult}
 */
export function validateDocument(documentType, ocr, opts = {}) {
  const now = opts.now || new Date();
  const today = todayIso(now);
  const f = ocr?.fields || {};
  /** @type {import('../types.js').ValidationCheck[]} */
  const checks = [];
  const add = (c) => checks.push({ severity: 'major', ...c });

  // 1. Required fields present
  for (const key of REQUIRED_FIELDS[documentType] || REQUIRED_FIELDS.passport) {
    const present = Boolean(f[key] && String(f[key]).trim());
    add({
      id: `required_${key}`,
      label: `${FIELD_LABELS[key] || key} present`,
      field: key,
      status: present ? 'pass' : 'fail',
      severity: key === 'fullName' || key === 'documentNumber' || key === 'visaNumber' ? 'critical' : 'major',
      detail: present ? `Extracted: ${f[key]}` : 'Field could not be read from the document.',
    });
  }

  // 2. Document number format
  const numberField = documentType === 'visa' ? 'visaNumber' : 'documentNumber';
  const number = f[numberField];
  if (number) {
    const pat = DOC_NUMBER_PATTERNS[documentType] || DOC_NUMBER_PATTERNS.passport;
    const ok = pat.re.test(String(number).toUpperCase());
    add({
      id: 'doc_number_format',
      label: `${FIELD_LABELS[numberField]} format`,
      field: numberField,
      status: ok ? 'pass' : 'fail',
      severity: 'major',
      detail: ok ? `"${number}" matches expected pattern (${pat.hint}).` : `"${number}" does not match expected pattern (${pat.hint}).`,
    });
  }

  // 3. Date of birth
  if (f.dateOfBirth) {
    const valid = isValidIsoDate(f.dateOfBirth);
    const age = valid ? ageFromDob(f.dateOfBirth, now) : null;
    let status = 'pass';
    let detail = `Holder is ${age} years old.`;
    if (!valid) { status = 'fail'; detail = `"${f.dateOfBirth}" is not a valid date.`; }
    else if (age < 0) { status = 'fail'; detail = 'Date of birth is in the future.'; }
    else if (age > 120) { status = 'fail'; detail = `Implausible age (${age}).`; }
    add({ id: 'dob_valid', label: 'Date of birth plausible', field: 'dateOfBirth', status, severity: 'major', detail });
  }

  // 4. Expiry / validity
  const expiryKey = f.expiryDate ? 'expiryDate' : f.validUntil ? 'validUntil' : null;
  if (expiryKey) {
    const exp = f[expiryKey];
    const valid = isValidIsoDate(exp);
    if (!valid) {
      add({ id: 'expiry_valid', label: 'Expiry date valid', field: expiryKey, status: 'fail', severity: 'critical', detail: `"${exp}" is not a valid date.` });
    } else {
      const days = daysBetween(today, exp);
      if (days < 0) add({ id: 'expiry_not_passed', label: 'Document not expired', field: expiryKey, status: 'fail', severity: 'critical', detail: `Expired ${-days} day(s) ago (${exp}).` });
      else if (days < 180) add({ id: 'expiry_not_passed', label: 'Document not expired', field: expiryKey, status: 'warn', severity: 'minor', detail: `Expires in ${days} day(s) (${exp}) — under 6-month validity window.` });
      else add({ id: 'expiry_not_passed', label: 'Document not expired', field: expiryKey, status: 'pass', severity: 'critical', detail: `Valid until ${exp} (${days} days).` });
    }
  }

  // 5. Valid-from (visas / permits)
  if (f.validFrom && isValidIsoDate(f.validFrom)) {
    const days = daysBetween(today, f.validFrom);
    add({
      id: 'valid_from',
      label: 'Validity period started',
      field: 'validFrom',
      status: days > 0 ? 'fail' : 'pass',
      severity: 'major',
      detail: days > 0 ? `Not valid until ${f.validFrom} (${days} days from now).` : `Valid from ${f.validFrom}.`,
    });
  }

  // 6. Nationality / issuing country code format
  for (const key of ['nationality', 'issuingCountry']) {
    if (f[key]) {
      const ok = ISO3.test(String(f[key]).toUpperCase());
      add({ id: `${key}_code`, label: `${FIELD_LABELS[key]} is a 3-letter country code`, field: key, status: ok ? 'pass' : 'warn', severity: 'minor', detail: ok ? `${f[key]}` : `"${f[key]}" is not an ISO alpha-3 code.` });
    }
  }

  // 7. Gender
  if (f.gender) {
    const ok = /^[MFX]$/.test(String(f.gender).toUpperCase());
    add({ id: 'gender_valid', label: 'Gender value valid', field: 'gender', status: ok ? 'pass' : 'warn', severity: 'minor', detail: ok ? f.gender : `Unexpected value "${f.gender}".` });
  }

  // 8. Visa-specific
  if (documentType === 'visa') {
    if (f.entries) {
      const ok = /single|multiple|double|^[1-9]$|^M$|^S$/i.test(f.entries);
      add({ id: 'visa_entries', label: 'Entry validity recognised', field: 'entries', status: ok ? 'pass' : 'warn', severity: 'minor', detail: f.entries });
    }
    if (f.stayDuration) {
      const ok = /\d+\s*(day|month|year)/i.test(f.stayDuration);
      add({ id: 'visa_stay', label: 'Duration of stay recognised', field: 'stayDuration', status: ok ? 'pass' : 'warn', severity: 'minor', detail: f.stayDuration });
    }
    if (f.visaType) {
      add({ id: 'visa_type', label: 'Visa type present', field: 'visaType', status: 'pass', severity: 'minor', detail: f.visaType });
    }
  }

  // 9. MRZ checksums + MRZ ↔ visual zone consistency
  if (ocr?.mrz) {
    const parsed = parseMrz(ocr.mrz);
    if (parsed) {
      for (const c of parsed.checks) {
        add({
          id: c.id,
          label: c.label,
          field: 'mrz',
          status: c.ok ? 'pass' : 'fail',
          severity: c.id === 'mrz_optional' ? 'minor' : 'critical',
          detail: c.ok ? `Check digit ${c.actual} verified.` : `Expected ${c.expected}, found "${c.actual}" for "${c.value}".`,
        });
      }
      // Compare MRZ to visually-read fields when both exist (from the OCR provider's vizFields, if any)
      const viz = ocr.vizFields || {};
      for (const key of ['documentNumber', 'dateOfBirth', 'expiryDate', 'nationality']) {
        if (viz[key] && parsed.fields[key]) {
          const same = normalise(viz[key]) === normalise(parsed.fields[key]);
          add({
            id: `mrz_viz_${key}`,
            label: `${FIELD_LABELS[key]} matches MRZ`,
            field: key,
            status: same ? 'pass' : 'fail',
            severity: 'critical',
            detail: same ? 'Visual zone and MRZ agree.' : `Visual zone "${viz[key]}" ≠ MRZ "${parsed.fields[key]}".`,
          });
        }
      }
    }
  } else if (documentType === 'passport') {
    add({ id: 'mrz_present', label: 'MRZ detected', field: 'mrz', status: 'warn', severity: 'major', detail: 'No machine readable zone found — checksum verification skipped.' });
  }

  // 10. OCR confidence
  if (typeof ocr?.confidence === 'number') {
    const pct = Math.round(ocr.confidence * 100);
    add({
      id: 'ocr_confidence',
      label: 'OCR read quality',
      status: pct >= 75 ? 'pass' : pct >= 50 ? 'warn' : 'fail',
      severity: 'minor',
      detail: `${pct}% overall OCR confidence.`,
    });
  }

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { checks, passed, failed, warnings, ok: failed === 0 };
}

const normalise = (v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
