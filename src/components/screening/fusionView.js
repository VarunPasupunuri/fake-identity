/**
 * Pure helpers that turn a FusionResult into what the results UI renders.
 * No React here so the mapping can be unit-tested directly.
 */
import { DECISION } from '../../modules/fusion/index.js';

export const DECISION_UI = {
  [DECISION.APPROVE]: { label: 'APPROVE', short: 'Approve', tone: 'green', headline: 'No contradictory evidence found.', legacy: 'accept' },
  [DECISION.REVIEW]: { label: 'REVIEW', short: 'Review', tone: 'amber', headline: 'Suspicious or incomplete evidence requires officer inspection.', legacy: 'flag' },
  [DECISION.REJECT]: { label: 'REJECT', short: 'Reject', tone: 'red', headline: 'Strong evidence of invalidity, forgery or identity mismatch.', legacy: 'reject' },
  [DECISION.INSUFFICIENT]: { label: 'INSUFFICIENT EVIDENCE', short: 'Insufficient evidence', tone: 'slate', headline: 'Analysis cannot safely determine authenticity because required evidence is unavailable.', legacy: 'flag' },
};

/** The five evidence-fusion dimensions and which evidence items feed each one. */
export const DIMENSIONS = [
  { key: 'identityConsistency', label: 'Identity consistency', hint: 'MRZ ↔ printed data, check digits, date plausibility', match: (e) => e.source === 'validation' && ['mrz', 'dob'].includes(e.category) },
  { key: 'documentValidity', label: 'Document validity', hint: 'Expiry, formats, required fields, visa rules', match: (e) => e.source === 'validation' && ['expiry', 'format', 'required', 'visa', 'code'].includes(e.category) },
  { key: 'documentIntegrity', label: 'Document integrity', hint: 'Image forensics, metadata', match: (e) => e.source === 'tampering' },
  { key: 'biometricConsistency', label: 'Biometric consistency', hint: 'Live face vs document photo', match: (e) => e.source === 'face' },
  { key: 'extractionConfidence', label: 'Extraction confidence', hint: 'OCR quality and MRZ read', match: (e) => e.source === 'ocr' },
];

const RANK = { fail: 3, warn: 2, pass: 1, info: 0 };

/** Worst status among the evidence items feeding a dimension; `unavailable` when nothing usable exists. */
export function dimensionStatus(fusion, dim) {
  const items = (fusion?.evidence || []).filter(dim.match);
  if (!items.length) return 'unavailable';
  const usable = items.filter((e) => e.status !== 'unavailable');
  if (!usable.length) return 'unavailable';
  return usable.reduce((worst, e) => ((RANK[e.status] ?? 0) > (RANK[worst] ?? 0) ? e.status : worst), 'info') === 'info' ? 'pass' : usable.reduce((worst, e) => ((RANK[e.status] ?? 0) > (RANK[worst] ?? 0) ? e.status : worst), 'info');
}

/** Rows for the Evidence Fusion / Trust Profile panel. */
export function fusionRows(fusion) {
  return DIMENSIONS.map((dim) => {
    const status = dimensionStatus(fusion, dim);
    const trust = fusion?.trust?.[dim.key];
    const items = (fusion?.evidence || []).filter(dim.match);
    return {
      key: dim.key,
      label: dim.label,
      hint: dim.hint,
      status,
      trust: trust?.available ? trust.score : null,
      unavailableReason: trust && !trust.available ? trust.reason : null,
      findings: items.filter((e) => e.status === 'fail' || e.status === 'warn').map((e) => e.label),
    };
  });
}

/** Strongest factors behind the decision, with the evidence status/severity attached. */
export function topFactors(fusion, limit = 6) {
  if (!fusion) return [];
  const byId = Object.fromEntries((fusion.evidence || []).map((e) => [e.id, e]));
  const corr = Object.fromEntries((fusion.correlations || []).map((c) => [c.id, c]));
  const rows = (fusion.risk?.contributions || []).filter((c) => c.points > 0).map((c) => {
    const e = byId[c.id];
    const k = corr[c.id];
    return {
      id: c.id,
      label: c.label,
      points: c.points,
      detail: c.detail || e?.explanation || k?.explanation || '',
      status: e ? e.status : k ? (k.kind === 'aggravating' ? 'fail' : 'warn') : 'info',
      severity: e?.severity || k?.severity || 'none',
      source: c.source,
      field: e?.field || k?.field || null,
    };
  });
  return rows.slice(0, limit);
}

/** Evidence items the engine could not obtain — shown for INSUFFICIENT_EVIDENCE and unavailable dimensions. */
export function unavailableEvidence(fusion) {
  return (fusion?.evidence || []).filter((e) => e.status === 'unavailable');
}

/** Human sentence for a counterfactual pivot. */
export function pivotSentence(p) {
  const target = DECISION_UI[p.decisionIfCleared]?.label || p.decisionIfCleared;
  return `Verifying "${p.label.replace(/\.$/, '')}" would move the decision to ${target}.`;
}

export const SOURCE_LABEL = { ocr: 'OCR', validation: 'Validation', tampering: 'Forensics', face: 'Face', fusion: 'Correlation', watchlist: 'Watchlist', identity: 'Identity', classification: 'Classification' };
