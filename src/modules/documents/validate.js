/**
 * Configurable rule engine for document profiles.
 *
 *   profile → expected fields → validation rules → checks (→ evidence in fusion)
 *
 * Produces the same ValidationCheck shape as the legacy passport/visa validator,
 * so the fusion engine, results UI, history and reports need no changes. Rules
 * are declarative descriptors on the profile (see profiles.js); interpreters
 * live here so adding a rule type is one function.
 */
import { isValidIsoDate } from '../validation/mrz.js';
import { daysBetween, todayIso, ageFromDob, ISO3 } from '../validation/rules.js';
import { FIELDS, UNIVERSAL_FIELD_LABELS as L } from './fields.js';
import { classifyDecodedContent, contentMatchesIdentifiers } from '../barcode/decode.js';

const sevOf = (rule, fallback) => rule.severity || fallback;

/**
 * @param {import('./profiles.js').DocumentProfile} profile
 * @param {import('../types.js').OcrResult} ocr
 * @param {{ now?: Date, barcode?: Object|null }} [opts]
 * @returns {import('../types.js').ValidationResult}
 */
export function validateWithProfile(profile, ocr, opts = {}) {
  const now = opts.now || new Date();
  const today = todayIso(now);
  const f = ocr?.fields || {};
  const checks = [];
  const add = (c) => checks.push({ severity: 'major', ...c });
  const has = (k) => f[k] !== undefined && f[k] !== null && String(f[k]).trim() !== '' && !(Array.isArray(f[k]) && !f[k].length);

  // 1. Required fields
  for (const spec of profile.fields.filter((s) => s.required)) {
    const present = has(spec.key);
    add({ id: `required_${spec.key}`, label: `${L[spec.key] || spec.key} present`, field: spec.key, status: present ? 'pass' : 'fail',
      severity: spec.key === profile.subjectField || spec.key === profile.primaryIdentifier ? 'critical' : 'major',
      detail: present ? `Extracted: ${display(f[spec.key])}` : 'Field could not be read from the document.' });
  }

  // 2. Identifier formats declared on the profile
  for (const spec of profile.fields.filter((s) => s.pattern && has(s.key))) {
    const ok = spec.pattern.test(String(f[spec.key]).toUpperCase());
    add({ id: `id_format_${spec.key}`, label: `${L[spec.key] || spec.key} format`, field: spec.key, status: ok ? 'pass' : 'fail', severity: 'major',
      detail: ok ? `"${f[spec.key]}" matches the expected pattern${spec.hint ? ` (${spec.hint})` : ''}.` : `"${f[spec.key]}" does not match the expected pattern${spec.hint ? ` (${spec.hint})` : ''}.` });
  }

  // 3. Every date field present must be a real calendar date
  for (const spec of profile.fields) {
    if (FIELDS[spec.key]?.kind !== 'date' || !has(spec.key)) continue;
    const ok = isValidIsoDate(f[spec.key]);
    add({ id: `date_valid_${spec.key}`, label: `${L[spec.key] || spec.key} is a valid date`, field: spec.key, status: ok ? 'pass' : 'fail', severity: 'major', detail: ok ? f[spec.key] : `"${f[spec.key]}" is not a valid calendar date.` });
  }

  // 4. Expiry / validity window (same ids as the legacy engine so a lapsed document is conclusive)
  const expiryKey = has('expiryDate') ? 'expiryDate' : has('validUntil') ? 'validUntil' : null;
  if (expiryKey && isValidIsoDate(f[expiryKey])) {
    const days = daysBetween(today, f[expiryKey]);
    if (days < 0) add({ id: 'expiry_not_passed', label: 'Document not expired', field: expiryKey, status: 'fail', severity: 'critical', detail: `Expired ${-days} day(s) ago (${f[expiryKey]}).` });
    else add({ id: 'expiry_not_passed', label: 'Document not expired', field: expiryKey, status: 'pass', severity: 'critical', detail: `Valid until ${f[expiryKey]} (${days} days).` });
  }

  // 5. Generic value checks
  if (has('gender')) {
    const ok = /^[MFX]$/.test(String(f.gender).toUpperCase());
    add({ id: 'gender_valid', label: 'Gender value valid', field: 'gender', status: ok ? 'pass' : 'warn', severity: 'minor', detail: ok ? f.gender : `Unexpected value "${f.gender}".` });
  }
  if (has('nationality')) {
    const ok = ISO3.test(String(f.nationality).toUpperCase());
    add({ id: 'nationality_code', label: 'Nationality is a 3-letter country code', field: 'nationality', status: ok ? 'pass' : 'warn', severity: 'minor', detail: ok ? f.nationality : `"${f.nationality}" is not an ISO alpha-3 code.` });
  }

  // 6. Profile rules
  for (const rule of profile.rules || []) {
    const c = applyRule(rule, f, { now, today, has });
    if (c) add(c);
  }

  // 7. Issuer information present (informational for generic documents)
  const issuerKeys = ['issuingAuthority', 'issuer', 'institution', 'university', 'organization'];
  const issuerKey = issuerKeys.find(has);
  add({ id: 'issuer_present', label: 'Issuing authority identified', field: issuerKey || undefined, status: issuerKey ? 'pass' : profile.category === 'generic' ? 'skip' : 'warn', severity: 'minor',
    detail: issuerKey ? `${L[issuerKey]}: ${display(f[issuerKey])}` : 'No issuing authority, institution or organisation could be read from the document.' });

  // 8. QR / barcode consistency
  for (const c of barcodeChecks(opts.barcode, f, profile)) add(c);

  // 9. OCR confidence (same id as the legacy engine)
  if (typeof ocr?.confidence === 'number') {
    const pct = Math.round(ocr.confidence * 100);
    add({ id: 'ocr_confidence', label: 'OCR read quality', status: pct >= 75 ? 'pass' : pct >= 50 ? 'warn' : 'fail', severity: 'minor', detail: `${pct}% overall OCR confidence.` });
  }

  return summarise(checks);
}

export function summarise(checks) {
  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { checks, passed, failed, warnings, ok: failed === 0 };
}

function display(v) { return Array.isArray(v) ? `${v.length} item(s)` : typeof v === 'object' && v ? JSON.stringify(v).slice(0, 60) : String(v); }

/* ------------------------------------------------------------------ */
/* Rule interpreters                                                    */
/* ------------------------------------------------------------------ */
export function applyRule(rule, f, ctx) {
  const { has, today, now } = ctx;
  switch (rule.type) {
    case 'date_order': {
      if (!has(rule.earlier) || !has(rule.later) || !isValidIsoDate(f[rule.earlier]) || !isValidIsoDate(f[rule.later])) return null;
      const d = daysBetween(f[rule.earlier], f[rule.later]);
      const ok = rule.allowEqual === false ? d > 0 : d >= 0;
      return { id: `rule_${rule.earlier}_before_${rule.later}`, label: rule.label || `${L[rule.later]} after ${L[rule.earlier].toLowerCase()}`, field: rule.later, status: ok ? 'pass' : 'fail', severity: sevOf(rule, 'major'),
        detail: ok ? `${L[rule.earlier]} ${f[rule.earlier]} precedes ${L[rule.later].toLowerCase()} ${f[rule.later]} (${d} day(s)).` : `${L[rule.later]} ${f[rule.later]} is before ${L[rule.earlier].toLowerCase()} ${f[rule.earlier]} — the dates contradict each other.` };
    }
    case 'not_future': {
      if (!has(rule.field) || !isValidIsoDate(f[rule.field])) return null;
      const d = daysBetween(today, f[rule.field]);
      return { id: `rule_not_future_${rule.field}`, label: `${L[rule.field]} not in the future`, field: rule.field, status: d <= 0 ? 'pass' : 'fail', severity: sevOf(rule, 'major'), detail: d <= 0 ? `${f[rule.field]} is ${-d} day(s) ago.` : `${f[rule.field]} is ${d} day(s) in the future.` };
    }
    case 'plausible_age': {
      if (!has(rule.field) || !isValidIsoDate(f[rule.field])) return null;
      const at = rule.at && has(rule.at) && isValidIsoDate(f[rule.at]) ? new Date(`${f[rule.at]}T00:00:00Z`) : now;
      const age = ageFromDob(f[rule.field], at);
      const min = rule.min ?? 0, max = rule.max ?? 120;
      const ok = age >= min && age <= max;
      return { id: `rule_plausible_age_${rule.field}`, label: rule.at ? `Age at ${L[rule.at].toLowerCase()} plausible` : 'Age plausible', field: rule.field, status: ok ? 'pass' : 'fail', severity: sevOf(rule, 'major'), detail: ok ? `${age} year(s).` : age < 0 ? `${L[rule.field]} ${f[rule.field]} is after ${rule.at ? L[rule.at].toLowerCase() : 'today'}.` : `Implausible age (${age}); expected ${min}–${max}.` };
    }
    case 'within_days': {
      if (!has(rule.from) || !has(rule.to) || !isValidIsoDate(f[rule.from]) || !isValidIsoDate(f[rule.to])) return null;
      const d = daysBetween(f[rule.from], f[rule.to]);
      const ok = d >= 0 && d <= rule.maxDays;
      return { id: `rule_within_${rule.from}_${rule.to}`, label: rule.label || `${L[rule.to]} within ${rule.maxDays} days of ${L[rule.from].toLowerCase()}`, field: rule.to, status: ok ? 'pass' : 'warn', severity: sevOf(rule, 'minor'), detail: `${d} day(s) between ${f[rule.from]} and ${f[rule.to]}.` };
    }
    case 'numeric_range': {
      if (!has(rule.field)) return null;
      const v = Number(f[rule.field]);
      if (Number.isNaN(v)) return { id: `rule_range_${rule.field}`, label: `${L[rule.field]} is numeric`, field: rule.field, status: 'fail', severity: 'minor', detail: `"${f[rule.field]}" is not a number.` };
      const ok = v >= rule.min && v <= rule.max;
      return { id: `rule_range_${rule.field}`, label: `${L[rule.field]} within ${rule.min}–${rule.max}`, field: rule.field, status: ok ? 'pass' : 'fail', severity: sevOf(rule, 'major'), detail: ok ? `${v}` : `${v} is outside ${rule.min}–${rule.max}.` };
    }
    case 'names_differ': {
      if (!has(rule.a) || !has(rule.b)) return null;
      const same = String(f[rule.a]).toUpperCase().replace(/\s+/g, ' ') === String(f[rule.b]).toUpperCase().replace(/\s+/g, ' ');
      return { id: `rule_names_differ_${rule.a}_${rule.b}`, label: `${L[rule.a]} differs from ${L[rule.b].toLowerCase()}`, field: rule.a, status: same ? 'warn' : 'pass', severity: sevOf(rule, 'minor'), detail: same ? `Both read as "${f[rule.a]}".` : 'Distinct names.' };
    }
    case 'marks_consistent': return marksConsistency(f, has);
    default: return null;
  }
}

/** Marks table ↔ totals ↔ percentage agreement for academic documents. */
export function marksConsistency(f, has) {
  const rows = Array.isArray(f.marks) ? f.marks.filter((r) => typeof r.marks === 'number') : [];
  if (!rows.length) return null;
  const over = rows.filter((r) => typeof r.max === 'number' && r.marks > r.max);
  if (over.length) return { id: 'marks_within_max', label: 'Marks within maximum', field: 'marks', status: 'fail', severity: 'critical', detail: `${over.map((r) => `${r.subject} ${r.marks}/${r.max}`).join('; ')} exceed the maximum.` };
  const sum = rows.reduce((s, r) => s + r.marks, 0);
  const maxSum = rows.every((r) => typeof r.max === 'number') ? rows.reduce((s, r) => s + r.max, 0) : null;
  if (has('totalMarks')) {
    const total = Number(f.totalMarks);
    const ok = Math.abs(total - sum) <= 1;
    return { id: 'marks_total_consistent', label: 'Subject marks add up to the printed total', field: 'totalMarks', status: ok ? 'pass' : 'fail', severity: 'critical', detail: ok ? `${rows.length} subject(s) sum to ${sum}; printed total ${total}.` : `${rows.length} subject(s) sum to ${sum} but the printed total is ${total}.` };
  }
  if (has('percentage') && maxSum) {
    const pct = Number(f.percentage);
    const calc = (sum / maxSum) * 100;
    const ok = Math.abs(pct - calc) <= 1.5;
    return { id: 'percentage_consistent', label: 'Printed percentage matches the marks', field: 'percentage', status: ok ? 'pass' : 'fail', severity: 'major', detail: ok ? `${sum}/${maxSum} = ${calc.toFixed(1)}%; printed ${pct}%.` : `${sum}/${maxSum} = ${calc.toFixed(1)}% but the printed percentage is ${pct}%.` };
  }
  return { id: 'marks_table_read', label: 'Marks table read', field: 'marks', status: 'pass', severity: 'minor', detail: `${rows.length} subject row(s) recognised; no printed total to reconcile.` };
}

/* ------------------------------------------------------------------ */
/* QR / barcode consistency (shared by the legacy and profile paths)    */
/* ------------------------------------------------------------------ */
/**
 * A code on a document proves nothing by itself; these checks only report
 * readability and whether the encoded data agrees with the printed fields.
 */
export function barcodeChecks(barcode, f = {}, profile = {}) {
  if (!barcode || barcode.status === 'unavailable') return [];
  const idKeys = ['documentNumber', 'visaNumber', 'registrationNumber', 'certificateNumber', 'rollNumber', 'epicNumber', 'employeeId', 'referenceNumber', 'companyRegistration'];
  const ids = idKeys.map((k) => f[k]).filter(Boolean);
  const name = f.fullName || f[profile.subjectField];
  if (barcode.status === 'not_found') {
    return [{ id: 'barcode_present', label: 'QR / barcode present', status: 'skip', severity: 'minor', detail: profile.barcode ? 'No QR code or barcode was detected. Not every issuer prints one; this is informational.' : 'No QR code or barcode detected (none expected for this document type).' }];
  }
  if (barcode.status === 'unreadable') {
    return [{ id: 'barcode_readable', label: 'QR / barcode readable', status: 'warn', severity: 'minor', detail: 'A code-like region was found but could not be decoded. Re-capture with better focus, or verify the printed data manually.' }];
  }
  const out = [];
  const codes = barcode.codes || [];
  out.push({ id: 'barcode_readable', label: 'QR / barcode readable', status: 'pass', severity: 'minor', detail: `${codes.length} code(s) decoded (${codes.map((c) => c.format).join(', ')}).` });
  for (const [i, code] of codes.entries()) {
    const kind = classifyDecodedContent(code.rawValue);
    const idx = codes.length > 1 ? ` ${i + 1}` : '';
    if (kind.kind === 'url') {
      out.push({ id: `barcode_url${idx.trim() ? `_${i + 1}` : ''}`, label: `Encoded link${idx}`, status: kind.suspicious ? 'warn' : 'pass', severity: 'minor', field: profile.primaryIdentifier,
        detail: kind.suspicious ? `Encoded URL ${kind.host} looks unusual (${kind.reasons.join('; ')}). A link in a code is not proof of authenticity; do not open it on an untrusted device.` : `Encoded URL points to ${kind.host}. The link was not opened; a code only proves what it encodes, not that the issuer recognises this document.` });
    }
    const cmp = contentMatchesIdentifiers(code.rawValue, { identifiers: ids, name });
    if (cmp.comparable) {
      const ok = cmp.matched.length > 0 && !cmp.identifierMismatch;
      out.push({ id: `barcode_consistency${idx.trim() ? `_${i + 1}` : ''}`, label: `Encoded data matches printed fields${idx}`, field: ok ? undefined : profile.primaryIdentifier || 'documentNumber', status: ok ? 'pass' : 'fail', severity: 'major',
        detail: ok ? `Encoded content contains ${cmp.matched.join(' and ')}.`
          : cmp.identifierMismatch ? `Encoded content carries identifier(s) (${cmp.encodedIdentifiers.slice(0, 3).join(', ')}) that do not match the printed ${ids.slice(0, 2).join(', ')}${cmp.matched.length ? `, although the ${cmp.matched.join(' and ')} agrees` : ''}.`
            : `Encoded content carries identifier(s) (${cmp.encodedIdentifiers.slice(0, 3).join(', ')}) that do not match the printed ${ids.length ? 'identifiers' : 'name'}.` });
    } else {
      out.push({ id: `barcode_content${idx.trim() ? `_${i + 1}` : ''}`, label: `Encoded content${idx}`, status: 'skip', severity: 'minor', detail: `${kind.kind === 'json' ? 'Structured data' : kind.kind === 'url' ? 'Link' : 'Text'} decoded${ids.length || name ? ', but it carries no identifier comparable with the printed fields' : '; no printed identifier is available for comparison'}.` });
    }
  }
  return out;
}
