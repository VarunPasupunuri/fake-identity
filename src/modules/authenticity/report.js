/**
 * REPORT PROJECTIONS — the authenticity result, shaped for the screen.
 *
 * Pure functions that turn the indicator list into the fixed checklist an
 * evaluator expects and into the regions to highlight on the document image.
 * No judgement is made here: every row reflects indicators the engine already
 * produced.
 */
import { INDICATOR, INDICATOR_STATUS, SEVERITY_RANK, SEVERITY } from './indicators.js';

/** True when the named fields were actually read from two representations and compared. */
const comparedAny = (a, keys) => (a?.compared || []).some((c) => keys.includes(c.field) && c.status !== 'not_compared');
/** The image analyses all run together, off the one decode. */
const imageRan = (a) => Boolean(a?.coverageDetail?.imageForensics);
/** Nothing that depends on reading the document means anything when it could not be read. */
const legible = (a) => Boolean(a?.coverageDetail?.textLegible);

/**
 * The named forensic checks, in the order they are shown.
 *
 * A row is FAIL when one of its indicators fired. Otherwise it is PASS only when
 * the underlying check actually RAN — `ran` says what that means for each row —
 * and NOT APPLICABLE when it could not. The distinction matters: "we looked and
 * found nothing" and "we could not look" must never render the same.
 *
 * `gate`, where present, is a precondition for the row meaning anything at all.
 * A row whose gate is closed reads NOT APPLICABLE even if an indicator fired:
 * a blurred capture with no readable MRZ produces an MRZ-absent observation and
 * a missing-fields observation, and neither is a tampering finding. Rendering
 * them as FAIL would turn a poor photograph into an accusation.
 */
export const TAMPER_CHECKS = Object.freeze([
  { id: 'photo_replacement', label: 'Photo replacement', ids: [INDICATOR.PHOTO_REPLACEMENT_INDICATOR, INDICATOR.PHOTO_REPLACEMENT_CORROBORATED], ran: imageRan },
  { id: 'text_manipulation', label: 'Text manipulation', ids: [INDICATOR.LOCALIZED_TEXT_EDIT, INDICATOR.COPY_MOVE_INDICATOR], ran: imageRan },
  { id: 'date_modification', label: 'Date / DOB modification', ids: [INDICATOR.VISUAL_MRZ_DOB_MISMATCH, INDICATOR.VISUAL_MRZ_EXPIRY_MISMATCH], ran: (a) => comparedAny(a, ['dateOfBirth', 'expiryDate']) },
  { id: 'field_modification', label: 'Document number / identity fields', ids: [INDICATOR.VISUAL_MRZ_PASSPORT_NUMBER_MISMATCH, INDICATOR.VISUAL_MRZ_NAME_MISMATCH, INDICATOR.VISUAL_MRZ_NATIONALITY_MISMATCH, INDICATOR.VISUAL_MRZ_SEX_MISMATCH], ran: (a) => comparedAny(a, ['documentNumber', 'fullName', 'nationality', 'gender']) },
  { id: 'stamp_forgery', label: 'Stamp / seal forgery', ids: [INDICATOR.STAMP_COMPOSITING_INDICATOR], ran: imageRan },
  { id: 'image_forensics', label: 'Image / compression forensics', ids: [INDICATOR.ELA_LOCALIZED_ANOMALY, INDICATOR.NOISE_INCONSISTENCY, INDICATOR.RESAMPLING_INCONSISTENCY, INDICATOR.ASPECT_RATIO_ANOMALY], ran: imageRan },
  { id: 'metadata', label: 'Metadata / edit indicators', ids: [INDICATOR.METADATA_EDITOR_INDICATOR, INDICATOR.METADATA_TIMESTAMP_INDICATOR], ran: imageRan },
  { id: 'code_consistency', label: 'MRZ / QR / barcode consistency', ids: [INDICATOR.MRZ_CHECKSUM_FAILURE, INDICATOR.MRZ_ABSENT, INDICATOR.BARCODE_FIELD_MISMATCH], gate: legible, ran: (a) => Boolean(a?.coverageDetail?.mrzIntegrity) || comparedAny(a, ['dateOfBirth', 'documentNumber', 'fullName']) },
  { id: 'structure', label: 'Document structure', ids: [INDICATOR.DOCUMENT_LAYOUT_ANOMALY], gate: legible, ran: (a) => Boolean(a?.coverageDetail?.structure) },
]);

export const CHECK_STATUS = Object.freeze({ PASS: 'pass', FAIL: 'fail', NOT_APPLICABLE: 'not_applicable' });

/**
 * @param {Object|null} authenticity  result of determineAuthenticity()
 * @returns {{ id: string, label: string, status: string, severity: string, detail: string|null }[]}
 */
export function tamperChecklist(authenticity) {
  const byId = new Map();
  for (const i of authenticity?.indicators || []) {
    const prev = byId.get(i.id);
    // Keep the most serious observation per indicator id.
    if (!prev || SEVERITY_RANK[i.severity] > SEVERITY_RANK[prev.severity]) byId.set(i.id, i);
  }
  return TAMPER_CHECKS.map((row) => {
    const found = row.ids.map((id) => byId.get(id)).filter(Boolean);
    if (row.gate && !row.gate(authenticity)) {
      return { id: row.id, label: row.label, status: CHECK_STATUS.NOT_APPLICABLE, severity: SEVERITY.NONE, detail: 'Not assessable — the document could not be read clearly enough.' };
    }
    const failed = found.filter((i) => i.status === INDICATOR_STATUS.DETECTED);
    if (failed.length) {
      const worst = failed.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));
      return { id: row.id, label: row.label, status: CHECK_STATUS.FAIL, severity: worst.severity, detail: worst.explanation };
    }
    if (!row.ran(authenticity)) {
      return { id: row.id, label: row.label, status: CHECK_STATUS.NOT_APPLICABLE, severity: SEVERITY.NONE, detail: found[0]?.explanation || null };
    }
    return { id: row.id, label: row.label, status: CHECK_STATUS.PASS, severity: SEVERITY.NONE, detail: null };
  });
}

/** Short label for a highlighted region, e.g. "DOB field — suspected modification". */
const REGION_LABEL = {
  dateOfBirth: 'DOB field',
  documentNumber: 'Document number',
  expiryDate: 'Expiry date',
  fullName: 'Name field',
  nationality: 'Nationality',
  gender: 'Sex field',
  photo: 'Portrait',
  stamp: 'Stamp / seal',
  mrz: 'MRZ',
  text: 'Text region',
};

/**
 * Regions to highlight on the document image, one per detected indicator that
 * knows where it is. Nothing is drawn when nothing was detected — an empty
 * overlay is the honest representation of "no location to point at".
 *
 * @returns {{ x:number, y:number, w:number, h:number, tone:string, label:string }[]}
 */
export function tamperRegions(authenticity) {
  const seen = new Set();
  const out = [];
  for (const i of authenticity?.indicators || []) {
    if (i.status !== INDICATOR_STATUS.DETECTED || !i.region) continue;
    const key = `${Math.round(i.region.x * 50)},${Math.round(i.region.y * 50)},${i.field || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const what = REGION_LABEL[i.field] || 'Region';
    out.push({
      ...i.region,
      tone: SEVERITY_RANK[i.severity] >= SEVERITY_RANK[SEVERITY.HIGH] ? 'high' : SEVERITY_RANK[i.severity] >= SEVERITY_RANK[SEVERITY.MEDIUM] ? 'medium' : 'low',
      label: `${what} — suspected modification`,
    });
  }
  return out;
}

/** One short line per failing check, for the summary under the verdict. */
export function failedChecks(authenticity) {
  return tamperChecklist(authenticity).filter((c) => c.status === CHECK_STATUS.FAIL);
}
