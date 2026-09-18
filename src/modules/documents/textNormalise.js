/**
 * TEXT NORMALISATION FOR DOCUMENT-TYPE DETECTION
 *
 * Recognised text from a photograph never looks like the text in a fixture.
 * A camera capture of a driving licence typically yields the heading broken
 * across lines, wide letter spacing on the card title, punctuation glued to
 * labels, and the odd mis-recognised character. The classifier used to match
 * headings against the raw uppercased text, so every one of those cases fell
 * through to the generic profile.
 *
 * This module prepares several views of the same text, and each signal says
 * which view it needs:
 *
 *   flat   punctuation and ALL whitespace (newlines included) collapsed to
 *          single spaces — for phrase and field-label matching.
 *   raw    uppercased with line structure preserved — for the MRZ and anything
 *          else where the original characters matter.
 *   lines  the individual lines — for layout signals.
 *   tokens the words of `flat` — for tolerant phrase matching.
 *
 * Nothing here rewrites characters into other characters: a substitution that
 * "fixes" text can just as easily invent a document type that was never there.
 * OCR damage is handled by *tolerant comparison* (see `fuzzyPhrase`) rather
 * than by editing the text, so the original is always what gets matched.
 *
 * Pure and deterministic — no I/O, safe in the browser and in tests.
 */

// Apostrophes are DELETED rather than spaced out, so "ELECTOR'S" becomes "ELECTORS"
// and "DRIVER'S LICENCE" stays two words rather than three.
const APOSTROPHE = /['\u2018\u2019`]/g;
// Other punctuation becomes a space so "DL No.:" and "DL No" match alike. `<`, `-`, `/`
// and `&` are kept: they carry meaning in machine readable zones, dates and identifiers.
const PUNCTUATION = /[.,;:"()[\]{}|*_@#!?~^$%+=\\]/g;

/**
 * Card titles are often printed with wide letter spacing, which OCR reads as
 * single characters separated by spaces ("D R I V I N G"). Join runs of three
 * or more single characters back into a word. Two-character runs are left
 * alone — "A B" is far more likely to be two initials than a truncated word.
 */
function joinSpacedLetters(text) {
  return text.replace(/(?:\b[A-Z0-9]\s){2,}\b[A-Z0-9]\b/g, (run) => run.replace(/\s+/g, ''));
}

/** @returns {{ flat: string, raw: string, lines: string[], tokens: string[] }} */
export function prepareText(rawText) {
  const upper = String(rawText || '').toUpperCase();
  const raw = upper.replace(/[ \t]+/g, ' ').replace(/\r\n?/g, '\n');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const flat = joinSpacedLetters(raw.replace(/\n/g, ' ').replace(APOSTROPHE, ''))
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = flat.split(' ').filter(Boolean);
  return { flat, raw, lines, tokens };
}

/** True when `value` is already a prepared text object rather than a string. */
export const isPrepared = (value) => Boolean(value && typeof value === 'object' && typeof value.flat === 'string');

/** Accepts a string or an already-prepared object, so callers never normalise twice. */
export const asPrepared = (value) => (isPrepared(value) ? value : prepareText(value));

/** Levenshtein distance, abandoned as soon as it exceeds `max` (keeps the scan cheap). */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Words shorter than this must match exactly; a one-edit window on a short word matches far too much. */
export const MIN_FUZZY_WORD = 5;

/**
 * Tolerant phrase match over the token stream.
 *
 * `DRIVING LICENCE` is found in `DRIVING LICENGE` (one mis-read character) and
 * in text where the two words sat on different lines, but not in `DRIVING` or
 * `LICENCE` alone — every word of the phrase must be present, in order.
 *
 * @param {string[]} tokens   tokens of the prepared text
 * @param {string} phrase     the phrase to look for, e.g. 'DRIVING LICENCE'
 * @param {number} maxEdits   total edits allowed across the whole phrase
 * @returns {boolean}
 */
export function fuzzyPhrase(tokens, phrase, maxEdits = 1) {
  const words = phrase.toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length || tokens.length < words.length) return false;
  for (let start = 0; start + words.length <= tokens.length; start += 1) {
    let budget = maxEdits;
    let ok = true;
    for (let k = 0; k < words.length; k += 1) {
      const want = words[k];
      const got = tokens[start + k];
      if (got === want) continue;
      // Short words are matched strictly: one edit on a 3-letter word is noise, not tolerance.
      if (want.length < MIN_FUZZY_WORD) { ok = false; break; }
      const d = editDistance(want, got, budget);
      if (d > budget) { ok = false; break; }
      budget -= d;
    }
    if (ok) return true;
  }
  return false;
}
