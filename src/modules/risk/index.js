/**
 * Risk scoring module.
 * Combines validation, tampering and face verification into one 0–100 score
 * (higher = riskier) with a transparent factor breakdown for the officer.
 *
 * Weights are deliberately simple and documented so they can be tuned or replaced
 * by a learned model later; the output shape stays the same.
 */

export const RISK_WEIGHTS = {
  validation: { critical: 25, major: 12, minor: 4, warn: 4, cap: 45 },
  tampering: { multiplier: 0.4, cap: 40 }, // tamper score 0–100 → 0–40
  face: { cap: 35 },
  ocr: { lowConfidence: 6 },
  missing: { ocr: 30, tampering: 15, face: 20 },
};

export const RISK_THRESHOLDS = { medium: 30, high: 60 };

/**
 * @param {{ validation?: import('../types.js').ValidationResult, tampering?: import('../types.js').TamperResult, face?: import('../types.js').FaceResult, ocr?: import('../types.js').OcrResult }} inputs
 * @returns {import('../types.js').RiskResult}
 */
export function computeRisk({ validation, tampering, face, ocr }) {
  /** @type {import('../types.js').RiskFactor[]} */
  const factors = [];
  const W = RISK_WEIGHTS;

  // --- Validation ---
  if (validation) {
    let v = 0;
    for (const c of validation.checks) {
      if (c.status === 'fail') {
        const pts = W.validation[c.severity] ?? W.validation.major;
        v += pts;
        factors.push({ id: `val_${c.id}`, source: 'validation', label: c.label, points: pts, detail: c.detail });
      } else if (c.status === 'warn') {
        v += W.validation.warn;
        factors.push({ id: `val_${c.id}`, source: 'validation', label: c.label, points: W.validation.warn, detail: c.detail });
      }
    }
    if (v > W.validation.cap) {
      factors.push({ id: 'val_cap', source: 'validation', label: 'Validation contribution capped', points: W.validation.cap - v, detail: `Validation issues capped at ${W.validation.cap} points.` });
    }
  }

  // --- Tampering ---
  if (tampering) {
    const pts = Math.round(Math.min(W.tampering.cap, tampering.score * W.tampering.multiplier));
    if (pts > 0) {
      factors.push({
        id: 'tamper_score',
        source: 'tampering',
        label: `Tampering likelihood ${Math.round(tampering.score)}%`,
        points: pts,
        detail: tampering.flags.length ? tampering.flags.map((f) => f.label).join('; ') : 'No specific region flagged.',
      });
    }
    for (const f of tampering.flags.filter((x) => x.severity === 'high')) {
      factors.push({ id: `tamper_${f.id}`, source: 'tampering', label: f.label, points: 8, detail: f.detail });
    }
  }

  // --- Face verification ---
  if (face) {
    if (!face.documentFaceFound || !face.liveFaceFound) {
      factors.push({ id: 'face_missing', source: 'face', label: !face.documentFaceFound ? 'No face found on document' : 'No face found in live capture', points: 20, detail: 'Face comparison could not be performed.' });
    } else {
      // 100% match → 0 pts, 50% → ~17 pts, 0% → 35 pts (cap)
      const pts = Math.round(Math.min(W.face.cap, ((100 - face.confidence) / 100) * W.face.cap));
      if (pts > 0) {
        factors.push({ id: 'face_confidence', source: 'face', label: `Face match ${Math.round(face.confidence)}%`, points: pts, detail: face.match ? 'Above match threshold.' : 'Below match threshold — possible impostor.' });
      }
      if (!face.match) factors.push({ id: 'face_no_match', source: 'face', label: 'Face does not match document photo', points: 10, detail: 'Similarity below acceptance threshold.' });
    }
  }

  // --- Missing / failed modules: never let a failure look like a clean pass ---
  if (!ocr) factors.push({ id: 'missing_ocr', source: 'ocr', label: 'OCR extraction failed', points: W.missing.ocr, detail: 'No fields could be read — validate the document manually.' });
  if (!tampering) factors.push({ id: 'missing_tampering', source: 'tampering', label: 'Tampering analysis unavailable', points: W.missing.tampering, detail: 'The tampering module did not return a result.' });
  if (!face) factors.push({ id: 'missing_face', source: 'face', label: 'Face verification not performed', points: W.missing.face, detail: 'No live photo was compared against the document photo.' });

  // --- OCR ---
  if (ocr && ocr.confidence < 0.5) {
    factors.push({ id: 'ocr_low', source: 'ocr', label: 'Low OCR confidence', points: W.ocr.lowConfidence, detail: 'Extracted data may be unreliable — verify manually.' });
  }

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const level = score >= RISK_THRESHOLDS.high ? 'high' : score >= RISK_THRESHOLDS.medium ? 'medium' : 'low';
  const recommendation = level === 'high' ? 'reject' : level === 'medium' ? 'flag' : 'accept';

  const top = [...factors].sort((a, b) => b.points - a.points).filter((f) => f.points > 0).slice(0, 3);
  const summary = top.length ? `Driven by: ${top.map((f) => f.label).join(', ')}.` : 'No issues detected across validation, tampering and face verification.';

  return { score, level, factors: factors.sort((a, b) => b.points - a.points), recommendation, summary };
}
