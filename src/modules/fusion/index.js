/**
 * EVIDENCE FUSION ENGINE
 *
 * fuseEvidence(inputs) → FusionResult
 *
 * Pure and deterministic: no React, Firebase, Supabase, browser APIs or clocks.
 * Consumes the existing module outputs (OCR, validation, tampering, face) plus
 * optional future modules (classification, watchlist, identity correlation) and
 * produces:
 *   evidence        normalised, traceable evidence items (nothing invented)
 *   correlations    cross-module relationships derived from shared fields/zones
 *   risk            0–100 suspicion score with per-contribution breakdown
 *   confidence      0–100 reliability of the analysis (separate from risk)
 *   trust           five-dimension document trust profile (explicit unavailability)
 *   decision        approve | review | reject | insufficient_evidence, with gates + reasons
 *   rationale       plain-language explanation built from the evidence
 *   chain           evidence chain: every risk point traced to evidence ids and values
 *   counterfactual  what verified evidence would change the decision
 *
 * @typedef {Object} FusionInputs
 * @property {string} documentType
 * @property {import('../types.js').OcrResult|null} ocr
 * @property {import('../types.js').ValidationResult|null} validation
 * @property {import('../types.js').TamperResult|null} tampering
 * @property {import('../types.js').FaceResult|null} face
 * @property {{ type: string, confidence: number, provider?: string, overridden?: boolean }} [classification]
 * @property {{ status: 'clear'|'match'|'possible'|'unavailable'|'confirmed_match'|'possible_match', matches?: Object[], source?: string, confidence?: number, explanation?: string, fieldsUsed?: string[], synthetic?: boolean }} [watchlist]
 * @property {{ status?: 'ok'|'unavailable', links?: Object[] }} [identity]
 * @property {{ ocr?: string, tamper?: string, face?: string }} [providers]
 */
import { normaliseEvidence } from './evidence.js';
import { correlate } from './correlations.js';
import { scoreRisk, computeConfidence, trustProfile, buildChain } from './scoring.js';
import { decide, rationale, counterfactual } from './decision.js';
import { DECISION, DECISION_LABEL, STATUS } from './constants.js';
import { toLegacyDecision } from './compat.js';

export { DECISION, DECISION_LABEL } from './constants.js';
export { fromLegacyDecision, toLegacyDecision, normaliseDecision, decisionLabel, toLegacyRisk } from './compat.js';

/** Mark evidence as resolved by the officer: it no longer fails and contributes no risk. */
function clearEvidence(evidence, ids) {
  const set = new Set(ids);
  return evidence.map((e) => (set.has(e.id) ? { ...e, status: STATUS.PASS, severity: 'none', riskContribution: 0, resolvedByOfficer: true } : e));
}

function run(inputs, evidence) {
  const correlations = correlate(evidence);
  const risk = scoreRisk(evidence, correlations);
  const confidence = computeConfidence(inputs, evidence);
  const verdict = decide({ evidence, correlations, risk, confidence });
  return { evidence, correlations, risk, confidence, ...verdict };
}

/**
 * @param {FusionInputs} inputs
 * @returns {FusionResult}
 */
export function fuseEvidence(inputs) {
  const safe = { documentType: 'passport', ocr: null, validation: null, tampering: null, face: null, ...(inputs || {}) };
  const evidence = normaliseEvidence(safe);
  const base = run(safe, evidence);
  const trust = trustProfile(evidence, safe);
  const chain = buildChain(evidence, base.correlations, base.risk);
  const text = rationale({ evidence, correlations: base.correlations, decision: base.decision, confidence: base.confidence });
  const recompute = (clearIds) => {
    const cleared = clearEvidence(evidence, clearIds);
    // correlations referencing cleared evidence dissolve because the underlying failure no longer exists
    const r = run(safe, cleared);
    return { decision: r.decision, reasons: r.reasons, risk: r.risk.score, confidence: r.confidence.score };
  };
  const cf = counterfactual({ decision: base.decision, reasons: base.reasons, evidence, correlations: base.correlations, confidence: base.confidence, recompute });

  return {
    version: 1,
    documentType: safe.documentType,
    evidence,
    correlations: base.correlations,
    risk: base.risk,
    confidence: base.confidence,
    trust,
    decision: base.decision,
    decisionLabel: DECISION_LABEL[base.decision],
    legacyDecision: toLegacyDecision(base.decision),
    gates: base.gates,
    reasons: base.reasons,
    rationale: text,
    chain,
    counterfactual: cf,
    summary: {
      evidenceCount: evidence.length,
      failing: evidence.filter((e) => e.status === STATUS.FAIL).length,
      warnings: evidence.filter((e) => e.status === STATUS.WARN).length,
      unavailable: evidence.filter((e) => e.status === STATUS.UNAVAILABLE).length,
      correlations: base.correlations.length,
    },
  };
}
