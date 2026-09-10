/**
 * Four-way decision, plain-language rationale and counterfactual explanation.
 * All three are derived from the evidence list, correlations, risk and confidence
 * that fuseEvidence() already computed — no new judgement is introduced here.
 */
import { DECISION, DECISION_LABEL, CONFIDENCE, RISK_THRESHOLDS, STATUS, SEVERITY, SEVERITY_RANK, REJECT_ON_FAIL, CORE_UNAVAILABLE_IDS } from './constants.js';
import { FIELD_LABELS } from '../validation/rules.js';

/**
 * Decision gates, evaluated in order. The first gate that fires decides.
 *
 *  INSUFFICIENT_EVIDENCE  OCR unavailable / no fields;  confidence < 50;
 *                         or risk ≥ 60 while confidence < 60 (a serious finding we cannot stand behind)
 *  REJECT                 risk ≥ 60;  a conclusive failing item (REJECT_ON_FAIL: expired document, watchlist
 *                         match);  a clear biometric mismatch;  or a critical aggravating correlation
 *                         (photo replacement + face mismatch, edited MRZ zone, watchlisted person)
 *  REVIEW                 risk ≥ 30;  any failing evidence of MEDIUM+ severity (MRZ↔visual mismatch, check-digit
 *                         failure, tampering flag…);  a borderline biometric result;  any aggravating/conflicting
 *                         correlation;  identity link;  possible watchlist match;  a core module (forensics or
 *                         face) unavailable;  or confidence below the approve floor (70)
 *  APPROVE                everything else
 */
export function decide({ evidence, correlations, risk, confidence }) {
  const ev = Object.fromEntries(evidence.map((e) => [e.id, e]));
  const fails = evidence.filter((e) => e.status === STATUS.FAIL);
  const conclusive = fails.filter((e) => REJECT_ON_FAIL.includes(e.id));
  const gates = [];
  const reasons = new Set();
  const fire = (gate, ids) => { gates.push(gate); ids.forEach((i) => reasons.add(i)); };

  // --- INSUFFICIENT EVIDENCE ---
  const ocr = ev['ocr:confidence'];
  if (!ocr || ocr.status === STATUS.UNAVAILABLE) fire('ocr_unavailable', [ocr ? ocr.id : 'ocr:unavailable']);
  if (confidence.score < CONFIDENCE.thresholds.insufficient) fire('confidence_below_floor', evidence.filter((e) => e.status === STATUS.UNAVAILABLE).map((e) => e.id));
  if (risk.score >= RISK_THRESHOLDS.reject && confidence.score < CONFIDENCE.thresholds.highRiskNeeds) fire('high_risk_low_confidence', [...fails.map((e) => e.id), ...evidence.filter((e) => e.status === STATUS.UNAVAILABLE).map((e) => e.id)]);
  if (gates.length) return { decision: DECISION.INSUFFICIENT, gates, reasons: [...reasons] };

  // --- REJECT ---
  if (risk.score >= RISK_THRESHOLDS.reject) fire('risk_reject_band', risk.contributions.map((c) => c.id));
  if (conclusive.length) fire('critical_evidence', conclusive.map((e) => e.id));
  if (ev['face:match']?.status === STATUS.FAIL && ev['face:match'].value?.state === 'mismatch') fire('biometric_mismatch', ['face:match']);
  const critCorr = correlations.filter((c) => c.kind === 'aggravating' && c.severity === SEVERITY.CRITICAL);
  if (critCorr.length) fire('critical_correlation', critCorr.map((c) => c.id));
  if (gates.length) return { decision: DECISION.REJECT, gates, reasons: [...reasons] };

  // --- REVIEW ---
  if (risk.score >= RISK_THRESHOLDS.review) fire('risk_review_band', risk.contributions.map((c) => c.id));
  const medium = fails.filter((e) => SEVERITY_RANK[e.severity] >= SEVERITY_RANK.medium);
  if (medium.length) fire('failing_evidence', medium.map((e) => e.id));
  if (ev['face:match']?.status === STATUS.WARN) fire('biometric_borderline', ['face:match']);
  const corr = correlations.filter((c) => c.kind !== 'supporting');
  if (corr.length) fire('correlated_signals', corr.map((c) => c.id));
  if (ev['identity:links']?.status === STATUS.WARN) fire('identity_link', ['identity:links']);
  if (ev['watchlist:result']?.status === STATUS.WARN) fire('watchlist_possible', ['watchlist:result']);
  const coreMissing = CORE_UNAVAILABLE_IDS.filter((id) => ev[id]);
  if (coreMissing.length) fire('core_analysis_unavailable', coreMissing);
  if (confidence.score < CONFIDENCE.thresholds.approve) fire('confidence_below_approve', confidence.components.filter((c) => c.points < c.max).map((c) => `confidence:${c.id}`));
  if (gates.length) return { decision: DECISION.REVIEW, gates, reasons: [...reasons] };

  return { decision: DECISION.APPROVE, gates: ['no_contradictory_evidence'], reasons: [] };
}

/** Plain-language rationale assembled only from evidence that exists. */
export function rationale({ evidence, correlations, decision, confidence }) {
  const ev = Object.fromEntries(evidence.map((e) => [e.id, e]));
  const parts = [];
  const val = evidence.filter((e) => e.source === 'validation' && e.status !== STATUS.UNAVAILABLE);
  const valFails = val.filter((e) => e.status === STATUS.FAIL);
  const mrzChecks = val.filter((e) => /^validation:mrz_(doc_number|dob|expiry|composite)$/.test(e.id));

  if (ev['ocr:unavailable'] || ev['ocr:confidence']?.status === STATUS.UNAVAILABLE) parts.push('Text could not be extracted reliably from the document.');
  else if (val.length && valFails.length === 0) parts.push(mrzChecks.length ? 'Document structure and MRZ checks passed.' : 'Document format and validity checks passed.');
  else if (valFails.length) {
    const named = valFails.slice(0, 3).map((e) => shortLabel(e));
    parts.push(`Validation found ${valFails.length} problem${valFails.length > 1 ? 's' : ''}: ${named.join('; ')}.`);
  }

  const t = ev['tampering:score'];
  if (ev['tampering:unavailable']) parts.push('Forensic analysis was unavailable.');
  else if (t && t.status === STATUS.PASS && !evidence.some((e) => e.source === 'tampering' && e.status === STATUS.FAIL)) parts.push('Image forensics found no manipulation signal.');
  else if (t) {
    const flags = evidence.filter((e) => e.source === 'tampering' && e.id !== 'tampering:score' && e.status !== STATUS.UNAVAILABLE);
    parts.push(`Image forensics flagged ${flags.map((f) => String(f.value).toLowerCase()).slice(0, 3).join(', ') || `a ${t.value}% manipulation likelihood`}.`);
  }

  const aggr = correlations.filter((c) => c.kind === 'aggravating');
  const conflict = correlations.filter((c) => c.kind === 'conflicting');
  if (aggr.length) parts.push(`Correlated evidence: ${aggr.map((c) => c.label.toLowerCase()).join('; ')}.`);
  if (conflict.length) parts.push(conflict[0].label + '.');

  const f = ev['face:match'];
  if (f) parts.push(f.value.state === 'match' ? 'Face verification passed.' : f.value.state === 'review' ? 'Face verification is borderline and needs officer review.' : 'Face verification failed: the presented person does not match the document photo.');
  else if (ev['face:not_compared']) parts.push(ev['face:not_compared'].explanation);
  else parts.push('Face verification was not performed.');

  if (ev['watchlist:result']?.status !== undefined && ev['watchlist:result'].status !== STATUS.PASS) parts.push(ev['watchlist:result'].explanation);
  if (ev['identity:links']?.status === STATUS.WARN) parts.push(ev['identity:links'].explanation);

  if (decision === DECISION.INSUFFICIENT) parts.push(`Analysis confidence is ${confidence.score}%, which is too low for a defensible automated recommendation.`);
  else if (confidence.usesMockProviders) parts.push('Note: one or more results come from demo providers, not real analysis.');
  return parts.join(' ');
}

function shortLabel(e) {
  if (/^validation:mrz_viz_/.test(e.id)) return `${FIELD_LABELS[e.field] || e.field} differs between printed data and MRZ (${e.value?.visual} vs ${e.value?.mrz})`;
  if (e.id === 'validation:expiry_not_passed') return 'document is expired';
  if (/^validation:mrz_/.test(e.id)) return `${e.rule.replace('mrz_', 'MRZ ').replace('_', ' ')} check digit fails`;
  if (/^validation:required_/.test(e.id)) return `${FIELD_LABELS[e.field] || e.field} could not be read`;
  if (e.id === 'validation:doc_number_format') return 'document number has an invalid format';
  if (e.id === 'validation:dob_valid') return 'date of birth is implausible';
  return e.explanation.split(':')[0].toLowerCase();
}

/**
 * COUNTERFACTUAL — "what would change this decision?"
 * Re-runs the same deterministic pipeline with the blocking evidence marked as
 * resolved by the officer. `recompute(clearIds)` is supplied by fuseEvidence.
 */
export function counterfactual({ decision, reasons, evidence, correlations, confidence, recompute }) {
  const ev = Object.fromEntries(evidence.map((e) => [e.id, e]));
  const corr = Object.fromEntries(correlations.map((c) => [c.id, c]));
  const describe = (id) => ev[id]?.label || ev[id]?.explanation || corr[id]?.label || id;

  if (decision === DECISION.INSUFFICIENT) {
    const missing = evidence.filter((e) => e.status === STATUS.UNAVAILABLE).map((e) => e.id);
    const weak = confidence.components.filter((c) => c.points < c.max).map((c) => c.reason);
    return {
      current: decision,
      reasons: [...new Set([...missing, ...reasons])].map((id) => ({ id, label: describe(id) })),
      resolution: `Complete the unavailable analysis (${weak.join('; ')}) or verify the document manually. A recommendation cannot be derived from the current evidence.`,
      potentialDecision: null,
      requires: missing,
    };
  }

  if (decision === DECISION.APPROVE) {
    return {
      current: decision,
      reasons: [],
      resolution: 'No contradictory evidence was found. Any failing validation rule, tampering signal, biometric mismatch or watchlist hit would move this to REVIEW or REJECT.',
      potentialDecision: null,
      requires: [],
    };
  }

  // REVIEW / REJECT: blocking evidence = failing/warning items and correlations cited by the gates that fired.
  // A REJECT is usually followed by REVIEW-level findings once the rejecting evidence is cleared, so walk one
  // more step so the officer sees everything that stands between the document and APPROVE.
  const clearable = (list) => list.filter((id) => (ev[id] && [STATUS.FAIL, STATUS.WARN].includes(ev[id].status)) || corr[id]).filter((id) => !id.startsWith('confidence:'));
  let blocking = clearable(reasons);
  let cleared = recompute(blocking);
  if (cleared.decision === DECISION.REVIEW) {
    const more = clearable(cleared.reasons || []).filter((id) => !blocking.includes(id));
    if (more.length) { blocking = [...blocking, ...more]; cleared = recompute(blocking); }
  }
  const single = blocking.map((id) => ({ id, label: describe(id), decisionIfCleared: recompute([id]).decision }));
  const pivotal = single.filter((s) => s.decisionIfCleared !== decision);
  const text = cleared.decision === decision
    ? `Even if all cited evidence were verified as legitimate the decision would remain ${DECISION_LABEL[decision].toUpperCase()} (${cleared.decision === DECISION.INSUFFICIENT ? 'analysis confidence is too low' : confidence.score < CONFIDENCE.thresholds.approve ? 'analysis confidence is below the approve floor' : 'other findings still apply'}).`
    : `If ${blocking.map((id) => describe(id).replace(/\.$/, '')).slice(0, 3).join('; ')}${blocking.length > 3 ? ` and ${blocking.length - 3} more finding(s)` : ''} were verified as legitimate by the officer, the decision could move to ${DECISION_LABEL[cleared.decision].toUpperCase()}.`;
  return {
    current: decision,
    reasons: blocking.map((id) => ({ id, label: describe(id) })),
    resolution: text,
    potentialDecision: cleared.decision,
    pivotal: pivotal.map((p) => ({ id: p.id, label: p.label, decisionIfCleared: p.decisionIfCleared })),
    requires: blocking,
  };
}
