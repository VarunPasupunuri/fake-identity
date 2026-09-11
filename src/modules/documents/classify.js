/**
 * Document type detection.
 *
 * Deterministic keyword / structure classifier over the recognised text. Each
 * profile declares weighted text signals; an MRZ, when present, is decisive for
 * travel and identity documents. The result always carries a confidence and the
 * ranked candidates so the UI can show *why* a type was chosen. Below the
 * confidence floor the document is treated as a generic official document —
 * an uncertain guess is never forced.
 *
 * @typedef {Object} ClassificationResult
 * @property {string} type              profile id
 * @property {string} category
 * @property {number} confidence        0..1
 * @property {{ type: string, score: number }[]} candidates   ranked, top 5
 * @property {'mrz'|'keywords'|'officer'|'fallback'} basis
 * @property {boolean} overridden       the officer fixed the type manually
 * @property {string} provider
 * @property {string} explanation
 */
import { PROFILES } from './profiles.js';
import { GENERIC_DOCUMENT, getProfile, DOCUMENT_CATEGORIES } from './registry.js';

export const CLASSIFICATION_FLOOR = 0.45;   // below this → generic document
export const CLASSIFICATION_PROVIDER = 'keyword-rules';

const MRZ_DOC_CODE = { P: 'passport', V: 'visa', I: 'national_id', A: 'national_id', C: 'national_id' };

function normaliseText(rawText) {
  return String(rawText || '').toUpperCase().replace(/[ \t]+/g, ' ');
}

/** Raw signal score (0..1) of one profile against the text. */
export function scoreProfile(profile, text) {
  if (!profile.signals?.length) return 0;
  let score = 0;
  for (const s of profile.signals) if (s.re.test(text)) score += s.weight;
  return Math.min(1, score);
}

/**
 * @param {{ rawText: string, mrz?: { format: string, lines: string[] }|null, hint?: { type?: string|null, category?: string|null } }} args
 * @returns {ClassificationResult}
 */
export function classifyDocument({ rawText, mrz = null, hint = {} } = {}) {
  const text = normaliseText(rawText);
  const hintType = hint?.type && getProfile(hint.type).id === hint.type ? hint.type : null;
  const hintCategory = hint?.category && DOCUMENT_CATEGORIES[hint.category] ? hint.category : null;

  // Officer fixed the type: no detection, full confidence, but keep the candidates for transparency.
  if (hintType) {
    const p = getProfile(hintType);
    return { type: p.id, category: p.category, confidence: 1, candidates: rank(text, null).slice(0, 5), basis: 'officer', overridden: true, provider: CLASSIFICATION_PROVIDER, explanation: `Document type set to ${p.label} by the officer.` };
  }

  // MRZ document code is decisive (only within the travel/identity categories).
  const code = mrz?.lines?.[0]?.[0];
  if (mrz && MRZ_DOC_CODE[code] && (!hintCategory || ['travel', 'identity'].includes(hintCategory))) {
    const id = MRZ_DOC_CODE[code];
    const p = getProfile(id);
    const kw = rank(text, hintCategory);
    // A visa sticker sometimes carries a passport-like MRZ; let strong keywords refine within the MRZ family.
    const top = kw[0];
    const chosen = top && top.score >= 0.5 && ['passport', 'visa', 'national_id'].includes(top.type) ? getProfile(top.type) : p;
    return { type: chosen.id, category: chosen.category, confidence: Math.min(0.99, 0.85 + (top?.type === chosen.id ? top.score * 0.14 : 0)), candidates: kw.slice(0, 5), basis: 'mrz', overridden: false, provider: CLASSIFICATION_PROVIDER, explanation: `Machine readable zone (${mrz.format}, document code ${code}) identifies a ${chosen.label.toLowerCase()}.` };
  }

  const candidates = rank(text, hintCategory);
  const top = candidates[0];
  const second = candidates[1];
  if (!top || top.score <= 0) {
    const g = getProfile(GENERIC_DOCUMENT);
    return { type: g.id, category: hintCategory || g.category, confidence: 0, candidates: [], basis: 'fallback', overridden: false, provider: CLASSIFICATION_PROVIDER, explanation: hintCategory ? `No ${DOCUMENT_CATEGORIES[hintCategory].label.toLowerCase()} type could be recognised from the text; generic screening applied.` : 'No known document type could be recognised from the text; generic screening applied.' };
  }
  // Confidence = strength of the best match, reduced when the runner-up is close.
  const margin = second ? Math.max(0, top.score - second.score) : top.score;
  const confidence = Math.min(0.99, Math.max(0, top.score * 0.7 + margin * 0.3 + (hintCategory ? 0.1 : 0)));
  if (confidence < CLASSIFICATION_FLOOR) {
    const g = getProfile(GENERIC_DOCUMENT);
    return { type: g.id, category: hintCategory || g.category, confidence, candidates: candidates.slice(0, 5), basis: 'fallback', overridden: false, provider: CLASSIFICATION_PROVIDER, explanation: `Closest match was ${getProfile(top.type).label} at ${Math.round(confidence * 100)}%, below the ${Math.round(CLASSIFICATION_FLOOR * 100)}% floor; generic screening applied.` };
  }
  const p = getProfile(top.type);
  return { type: p.id, category: p.category, confidence, candidates: candidates.slice(0, 5), basis: 'keywords', overridden: false, provider: CLASSIFICATION_PROVIDER, explanation: `Text signals identify a ${p.label.toLowerCase()} (${Math.round(confidence * 100)}%)${second && second.score > 0 ? `; next candidate ${getProfile(second.type).label} (${Math.round(second.score * 100)}%)` : ''}.` };
}

function rank(text, category) {
  return PROFILES
    .filter((p) => p.id !== GENERIC_DOCUMENT && (!category || p.category === category))
    // Catch-all profiles are damped (generality < 1) so a specific document type wins a close race.
    .map((p) => ({ type: p.id, score: Number((scoreProfile(p, text) * (p.generality ?? 1)).toFixed(3)) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
}
