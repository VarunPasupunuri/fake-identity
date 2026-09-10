/**
 * Cross-module evidence correlation.
 *
 * A correlation is only created when two independent findings refer to the SAME
 * concrete thing (a named field, the MRZ zone, the photo region). Nothing is
 * inferred from proximity guesses — the tampering detector must have tagged the
 * region with a field/zone, and the validation rule must name the same field.
 *
 * @typedef {Object} Correlation
 * @property {string} id
 * @property {'aggravating'|'conflicting'|'supporting'} kind
 * @property {string} label
 * @property {string} explanation
 * @property {string[]} refs               evidence ids this correlation is derived from
 * @property {number} riskContribution     extra points (aggravating only)
 * @property {string} severity
 * @property {string} [field]
 */
import { RISK, SEVERITY, STATUS } from './constants.js';
import { FIELD_LABELS } from '../validation/rules.js';

const byId = (evidence) => Object.fromEntries(evidence.map((e) => [e.id, e]));

export function correlate(evidence) {
  const ev = byId(evidence);
  const out = [];
  const tamperFlags = evidence.filter((e) => e.source === 'tampering' && e.id !== 'tampering:score' && e.status !== STATUS.UNAVAILABLE);
  const failedChecks = evidence.filter((e) => e.source === 'validation' && e.status === STATUS.FAIL);
  const face = ev['face:match'];
  const photoFlags = tamperFlags.filter((f) => f.category === 'photo_replacement');
  const mrzZoneFlags = tamperFlags.filter((f) => f.field === 'mrz');
  const metaEditor = ev['tampering:meta_editor'];
  const elaFlags = tamperFlags.filter((f) => f.region && f.category !== 'metadata');

  // 1. MRZ↔visual mismatch on field F + tampering flag tagged with field F
  for (const c of failedChecks.filter((x) => /^validation:mrz_viz_/.test(x.id))) {
    for (const f of tamperFlags.filter((t) => t.field && t.field === c.field)) {
      out.push({ id: `corr:mrz_field_tamper:${c.field}`, kind: 'aggravating', severity: SEVERITY.HIGH, field: c.field, refs: [c.id, f.id], riskContribution: RISK.correlation.mrz_field_tamper,
        label: `MRZ inconsistency overlaps a tampering signal on ${FIELD_LABELS[c.field] || c.field}`,
        explanation: `The ${FIELD_LABELS[c.field] || c.field} printed on the document (${c.value?.visual}) disagrees with the MRZ (${c.value?.mrz}), and image forensics flagged the same region (${f.value}). Two independent detectors point at the same field, which is far more indicative of alteration than either alone.` });
    }
  }

  // 2. Any other field-linked validation failure + tampering flag on the same field
  for (const c of failedChecks.filter((x) => x.field && !/^validation:mrz_viz_/.test(x.id) && x.category !== 'required')) {
    for (const f of tamperFlags.filter((t) => t.field && t.field === c.field)) {
      if (out.some((o) => o.refs.includes(c.id) && o.refs.includes(f.id))) continue;
      out.push({ id: `corr:field_tamper:${c.field}`, kind: 'aggravating', severity: SEVERITY.HIGH, field: c.field, refs: [c.id, f.id], riskContribution: RISK.correlation.field_tamper,
        label: `${FIELD_LABELS[c.field] || c.field} fails validation and shows a tampering signal`,
        explanation: `${c.explanation} Image forensics also flagged the ${FIELD_LABELS[c.field] || c.field} region (${f.value}).` });
    }
  }

  // 3. MRZ check-digit failure + tampering flag in the MRZ zone
  const checksumFails = failedChecks.filter((x) => /^validation:mrz_(doc_number|dob|expiry|composite|optional)$/.test(x.id));
  if (checksumFails.length && mrzZoneFlags.length) {
    out.push({ id: 'corr:mrz_zone_tamper', kind: 'aggravating', severity: SEVERITY.CRITICAL, field: 'mrz', refs: [...checksumFails.map((c) => c.id), ...mrzZoneFlags.map((f) => f.id)], riskContribution: RISK.correlation.mrz_zone_tamper,
      label: 'MRZ check-digit failure coincides with a tampering signal in the MRZ zone',
      explanation: `${checksumFails.length} MRZ check digit(s) fail and image forensics flagged the machine readable zone itself. An edited MRZ line typically breaks its check digits exactly this way.` });
  }

  // 4. Photo-replacement flag + biometric result
  if (photoFlags.length && face) {
    if (face.value?.state === 'mismatch') {
      out.push({ id: 'corr:photo_face', kind: 'aggravating', severity: SEVERITY.CRITICAL, field: 'photo', refs: [...photoFlags.map((f) => f.id), face.id], riskContribution: RISK.correlation.photo_face,
        label: 'Photo-replacement signal coincides with a biometric mismatch',
        explanation: `Image forensics flagged the photo region (${photoFlags[0].value}) and the presented person does not match the document photo (${face.value.confidence}%). Together these are consistent with a substituted photograph.` });
    } else if (face.value?.state === 'match') {
      out.push({ id: 'corr:photo_face_conflict', kind: 'conflicting', severity: SEVERITY.MEDIUM, field: 'photo', refs: [...photoFlags.map((f) => f.id), face.id], riskContribution: 0,
        label: 'Photo-region anomaly, but the presented person matches the document photo',
        explanation: `Image forensics flagged the photo region (${photoFlags[0].value}), yet biometric comparison matches (${face.value.confidence}%). The anomaly may stem from lamination, glare or a re-scan rather than a substituted photo — officer inspection of the photo should resolve it.` });
    }
  }

  // 5. Editing software in metadata + localized ELA anomaly
  if (metaEditor && elaFlags.length) {
    out.push({ id: 'corr:metadata_ela', kind: 'aggravating', severity: SEVERITY.HIGH, refs: [metaEditor.id, ...elaFlags.map((f) => f.id)], riskContribution: RISK.correlation.metadata_ela,
      label: 'Editing software recorded in metadata and localized compression anomalies',
      explanation: `${metaEditor.value} appears in the image metadata and ${elaFlags.length} region(s) show inconsistent compression. Software provenance and pixel-level evidence agree that the image was digitally edited.` });
  }

  // 6. Watchlist match + biometric match (future watchlist provider)
  const wl = ev['watchlist:result'];
  if (wl?.value?.status === 'match' && face?.value?.state === 'match') {
    out.push({ id: 'corr:watchlist_face', kind: 'aggravating', severity: SEVERITY.CRITICAL, refs: [wl.id, face.id], riskContribution: RISK.correlation.watchlist_face,
      label: 'Presented person matches a watchlisted document',
      explanation: `The document matches a watchlist entry (${wl.value.source || 'source unspecified'}) and the presented person matches its photo (${face.value.confidence}%).` });
  }

  // 7. Supporting: identity consistent across MRZ, printed data and biometrics
  const mrzViz = evidence.filter((e) => /^validation:mrz_viz_/.test(e.id));
  const mrzChecks = evidence.filter((e) => /^validation:mrz_(doc_number|dob|expiry|composite)$/.test(e.id));
  if (mrzChecks.length >= 3 && mrzChecks.every((e) => e.status === STATUS.PASS) && mrzViz.every((e) => e.status === STATUS.PASS) && face?.value?.state === 'match') {
    out.push({ id: 'corr:identity_consistent', kind: 'supporting', severity: SEVERITY.NONE, refs: [...mrzChecks.map((e) => e.id), ...mrzViz.map((e) => e.id), face.id], riskContribution: 0,
      label: 'Identity consistent across MRZ, printed data and biometrics',
      explanation: `All MRZ check digits verify${mrzViz.length ? `, ${mrzViz.length} printed field(s) agree with the MRZ` : ''}, and the presented person matches the document photo (${face.value.confidence}%).` });
  }

  return out;
}
