/**
 * Compatibility layer between the legacy three-way officer decision
 * (accept | flag | reject) stored on existing records and the four-way
 * fusion vocabulary (approve | review | reject | insufficient_evidence).
 */
import { DECISION, DECISION_LABEL } from './constants.js';

const LEGACY_TO_FUSION = { accept: DECISION.APPROVE, flag: DECISION.REVIEW, reject: DECISION.REJECT };
const FUSION_TO_LEGACY = { approve: 'accept', review: 'flag', reject: 'reject', insufficient_evidence: 'flag', verified: 'accept' };

/** Legacy officer decision → fusion vocabulary. Unknown/empty → null. */
export function fromLegacyDecision(value) {
  if (!value) return null;
  if (Object.values(DECISION).includes(value)) return value;
  return LEGACY_TO_FUSION[value] || null;
}

/** Fusion decision → legacy vocabulary used by rules, stats and CSV. INSUFFICIENT maps to flag (needs a human). */
export function toLegacyDecision(value) {
  if (!value) return null;
  if (value in FUSION_TO_LEGACY) return FUSION_TO_LEGACY[value];
  if (value in LEGACY_TO_FUSION) return value;
  return null;
}

/** Accepts either vocabulary and returns the canonical fusion value. */
export const normaliseDecision = fromLegacyDecision;

/** Legacy risk recommendation (accept|flag|reject) → fusion decision. */
export function fromLegacyRecommendation(rec) {
  return fromLegacyDecision(rec);
}

export function decisionLabel(value) {
  const v = fromLegacyDecision(value);
  return v ? DECISION_LABEL[v] : 'Pending';
}

/**
 * Project a FusionResult onto the legacy RiskResult shape
 * ({ score, level, factors, recommendation, summary }) that the results UI,
 * history, admin statistics and CSV export already consume. The fusion engine is
 * the single risk engine; this is only a view of its output.
 */
export function toLegacyRisk(fusion) {
  if (!fusion) return null;
  const factors = (fusion.risk?.contributions || []).map((c) => ({ id: c.id, label: c.label, points: c.points, source: c.source, detail: c.detail || c.label }));
  const top = factors.filter((f) => f.points > 0).slice(0, 3);
  return {
    score: fusion.risk?.score ?? 0,
    level: fusion.risk?.level ?? 'low',
    factors,
    recommendation: toLegacyDecision(fusion.decision) || 'flag',
    summary: top.length ? `Driven by: ${top.map((f) => f.label.replace(/\.$/, '')).join(', ')}.` : fusion.rationale || 'No issues detected across validation, tampering and face verification.',
    engine: 'fusion',
    decision: fusion.decision,
    confidence: fusion.confidence?.score ?? null,
  };
}
