/**
 * DOCUMENT TYPE DETECTION
 *
 * Deterministic, weighted, multi-signal classifier over the recognised text.
 * It answers one question only — *what kind of document is this?* — and never
 * says anything about whether the document is genuine. An unrecognised type is
 * an unrecognised type, not a forgery.
 *
 * How a type is scored
 * --------------------
 * Every profile declares signals, each with a weight and a tier:
 *
 *   strong   a clue that is characteristic of that document alone
 *            (a "DRIVING LICENCE" heading, a TD3 MRZ, "UIDAI")
 *   medium   a clue that is typical of it but shared with others
 *            (a licence-number pattern, vehicle classes, "VALID UNTIL")
 *   weak     a clue that appears on official paper of every kind
 *            ("SEAL", "SIGNATURE", "OFFICIAL") — worth almost nothing
 *
 * The weak tier is capped (WEAK_CAP) so no pile of generic words can classify a
 * document, and a type with neither a strong signal nor at least two medium
 * ones is halved for lack of corroboration. A single generic clue therefore
 * cannot produce a detection, which is the whole point of the tiering.
 *
 * Signals are matched against normalised text (see textNormalise.js), so a
 * heading still counts when OCR split it across lines, spaced its letters out,
 * glued punctuation to it, or mis-read one character.
 *
 * Confidence is the winning score reduced by how close the runner-up came. It
 * is computed from the signals that actually fired — nothing here is random or
 * assumed.
 *
 * @typedef {Object} ClassificationResult
 * @property {string} type              profile id
 * @property {string} category
 * @property {number} confidence        0..1
 * @property {{ type: string, score: number }[]} candidates   ranked, top 5
 * @property {{ label: string, weight: number, tier: string }[]} signals   clues that fired, strongest first
 * @property {'mrz'|'keywords'|'officer'|'fallback'} basis
 * @property {boolean} uncertain        a rival type scored close enough to matter
 * @property {{ type: string, label: string, score: number }[]} alternatives   the close rivals, if any
 * @property {boolean} overridden       the officer fixed the type manually
 * @property {string} provider
 * @property {string} explanation
 */
import { PROFILES } from './profiles.js';
import { GENERIC_DOCUMENT, getProfile, DOCUMENT_CATEGORIES } from './registry.js';
import { asPrepared, fuzzyPhrase } from './textNormalise.js';

export const CLASSIFICATION_FLOOR = 0.45;   // below this → generic document
export const CLASSIFICATION_PROVIDER = 'weighted-signal-rules';
/** Total contribution allowed from generic "official paperwork" wording. */
export const WEAK_CAP = 0.08;
/** A type with no strong signal and fewer than this many medium signals is not corroborated. */
export const MIN_MEDIUM_WITHOUT_STRONG = 2;
/** How much a close runner-up reduces confidence. */
export const CLOSENESS_PENALTY = 0.35;
/** Rivals scoring at least this fraction of the winner make the detection uncertain. */
export const UNCERTAIN_RATIO = 0.8;

const MRZ_DOC_CODE = { P: 'passport', V: 'visa', I: 'national_id', A: 'national_id', C: 'national_id' };

/** Tier of a signal — explicit when declared, otherwise inferred from its weight. */
export function signalTier(s) {
  if (s.tier) return s.tier;
  if (s.weight >= 0.35) return 'strong';
  return s.weight >= 0.1 ? 'medium' : 'weak';
}

const testOn = (re, on, p) => re.test(on === 'raw' ? p.raw : p.flat);

/** Whether one signal is present in the prepared text. */
export function signalFires(s, prepared) {
  // `unless` suppresses a signal in a context where it means something else:
  // "PASSPORT NO." on a visa page refers to the visa holder's passport.
  if (s.unless && testOn(s.unless, s.unlessOn || 'flat', prepared)) return false;
  // `phrases` is an any-of group: spelling variants of ONE heading, so a document
  // that carries it scores once rather than once per spelling.
  if (s.phrases) return s.phrases.some((ph) => fuzzyPhrase(prepared.tokens, ph, s.edits ?? 1));
  if (s.phrase) return fuzzyPhrase(prepared.tokens, s.phrase, s.edits ?? 1);
  // `all` requires every pattern — used where only the combination is meaningful.
  if (s.all) return s.all.every((re) => testOn(re, s.on, prepared));
  if (s.line) return prepared.lines.some((l) => s.line.test(l));
  return testOn(s.re, s.on, prepared);
}

/**
 * Score one profile against the text, with the breakdown behind the number.
 * @returns {{ score: number, fired: Object[], strong: number, medium: number, corroborated: boolean }}
 */
export function scoreProfileDetailed(profile, text) {
  const prepared = asPrepared(text);
  const fired = [];
  let strong = 0; let medium = 0; let weakSum = 0; let total = 0;
  for (const s of profile.signals || []) {
    if (!signalFires(s, prepared)) continue;
    const tier = signalTier(s);
    fired.push({ label: s.label || 'an unlabelled clue', weight: s.weight, tier });
    if (tier === 'strong') { strong += 1; total += s.weight; }
    else if (tier === 'medium') { medium += 1; total += s.weight; }
    else weakSum += s.weight;
  }
  total += Math.min(weakSum, WEAK_CAP);
  const corroborated = strong > 0 || medium >= MIN_MEDIUM_WITHOUT_STRONG;
  // Uncorroborated evidence still counts for something, but never enough on its own.
  const score = Math.min(1, corroborated ? total : total * 0.5);
  fired.sort((a, b) => b.weight - a.weight);
  return { score, fired, strong, medium, corroborated };
}

/** Raw signal score (0..1) of one profile against the text. */
export function scoreProfile(profile, text) { return scoreProfileDetailed(profile, text).score; }

/** The signals of one profile that actually fired, strongest first — used to explain a detection. */
export function matchedSignals(profile, text) { return scoreProfileDetailed(profile, text).fired; }

/**
 * @param {{ rawText: string, mrz?: { format: string, lines: string[] }|null, hint?: { type?: string|null, category?: string|null } }} args
 * @returns {ClassificationResult}
 */
export function classifyDocument({ rawText, mrz = null, hint = {} } = {}) {
  const prepared = asPrepared(rawText);
  const hintType = hint?.type && getProfile(hint.type).id === hint.type ? hint.type : null;
  const hintCategory = hint?.category && DOCUMENT_CATEGORIES[hint.category] ? hint.category : null;
  const base = { uncertain: false, alternatives: [], provider: CLASSIFICATION_PROVIDER };

  // Officer fixed the type: no detection, full confidence, but keep the candidates for transparency.
  if (hintType) {
    const p = getProfile(hintType);
    return { ...base, type: p.id, category: p.category, confidence: 1, candidates: rank(prepared, null).slice(0, 5), signals: matchedSignals(p, prepared), basis: 'officer', overridden: true, explanation: `Document type set to ${p.label} by the officer.` };
  }

  const candidates = rank(prepared, hintCategory);

  // MRZ document code is decisive (only within the travel/identity categories).
  const code = mrz?.lines?.[0]?.[0];
  if (mrz && MRZ_DOC_CODE[code] && (!hintCategory || ['travel', 'identity'].includes(hintCategory))) {
    const p = getProfile(MRZ_DOC_CODE[code]);
    const top = candidates[0];
    // A visa sticker sometimes carries a passport-like MRZ; let strong keywords refine within the MRZ family.
    const chosen = top && top.score >= 0.5 && ['passport', 'visa', 'national_id'].includes(top.type) ? getProfile(top.type) : p;
    return {
      ...base, type: chosen.id, category: chosen.category,
      confidence: Math.min(0.99, 0.85 + (top?.type === chosen.id ? top.score * 0.14 : 0)),
      candidates: candidates.slice(0, 5),
      signals: [{ label: `a ${mrz.format} machine readable zone with document code ${code}`, weight: 0.85, tier: 'strong' }, ...matchedSignals(chosen, prepared)],
      basis: 'mrz', overridden: false,
      explanation: `Machine readable zone (${mrz.format}, document code ${code}) identifies a ${chosen.label.toLowerCase()}.`,
    };
  }

  const top = candidates[0];
  const second = candidates[1];
  if (!top || top.score <= 0) {
    const g = getProfile(GENERIC_DOCUMENT);
    return { ...base, type: g.id, category: hintCategory || g.category, confidence: 0, candidates: [], signals: [], basis: 'fallback', overridden: false, explanation: hintCategory ? `No ${DOCUMENT_CATEGORIES[hintCategory].label.toLowerCase()} type could be recognised from the text; generic screening applied.` : 'No known document type could be recognised from the text; generic screening applied.' };
  }

  // Confidence = strength of the winning evidence, reduced by how close the runner-up came.
  const closeness = second && second.score > 0 ? second.score / top.score : 0;
  const confidence = Math.min(0.99, Math.max(0, top.score * (1 - CLOSENESS_PENALTY * closeness) + (hintCategory ? 0.05 : 0)));
  const rivals = candidates.slice(1).filter((c) => c.score >= top.score * UNCERTAIN_RATIO);
  const alternatives = rivals.map((c) => ({ type: c.type, label: getProfile(c.type).label, score: c.score }));

  if (confidence < CLASSIFICATION_FLOOR) {
    const g = getProfile(GENERIC_DOCUMENT);
    return {
      ...base, type: g.id, category: hintCategory || g.category, confidence, candidates: candidates.slice(0, 5),
      signals: matchedSignals(getProfile(top.type), prepared), basis: 'fallback', overridden: false,
      uncertain: true, alternatives: [{ type: top.type, label: getProfile(top.type).label, score: top.score }, ...alternatives],
      explanation: `Closest match was ${getProfile(top.type).label} at ${Math.round(confidence * 100)}%, below the ${Math.round(CLASSIFICATION_FLOOR * 100)}% floor; generic screening applied.`,
    };
  }

  const p = getProfile(top.type);
  return {
    ...base, type: p.id, category: p.category, confidence, candidates: candidates.slice(0, 5),
    signals: matchedSignals(p, prepared), basis: 'keywords', overridden: false,
    uncertain: alternatives.length > 0, alternatives,
    explanation: `Text signals identify a ${p.label.toLowerCase()} (${Math.round(confidence * 100)}%)${second && second.score > 0 ? `; next candidate ${getProfile(second.type).label} (${Math.round(second.score * 100)}%)` : ''}.`,
  };
}

function rank(prepared, category) {
  return PROFILES
    .filter((p) => p.id !== GENERIC_DOCUMENT && (!category || p.category === category))
    // Catch-all profiles are damped (generality < 1) so a specific document type wins a close race.
    .map((p) => ({ type: p.id, score: Number((scoreProfile(p, prepared) * (p.generality ?? 1)).toFixed(3)) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
}
