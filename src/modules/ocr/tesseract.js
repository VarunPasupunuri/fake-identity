/**
 * In-browser OCR using Tesseract.js. Runs entirely on the officer's device —
 * useful when checkpoints have poor connectivity. The worker, WASM core and
 * English traineddata are self-hosted under /ocr (see scripts/copy-assets.mjs)
 * so no CDN access is needed; the browser caches them after first load.
 */
import { parseFields } from './parse.js';
import { extractMrzLines, parseMrz } from '../validation/mrz.js';
import { cropBand, rotateDataUrl } from '../../lib/image.js';
import { getProfile } from '../documents/registry.js';

/** Does this type carry a machine readable zone? An unresolved type is worth looking for one. */
function carriesMrz(documentType) {
  if (!documentType || documentType === 'auto') return true;
  try { return Boolean(getProfile(documentType).mrz); } catch { return true; }
}

let workerPromise = null;
let mrzWorkerPromise = null;

/**
 * One recognition at a time.
 *
 * A Tesseract worker recognises one image at a time; asking a second of it while
 * the first is still running does not queue, it corrupts both. Two passes race
 * here by design of the screen: the type check starts the moment a document is
 * chosen, and the screening starts when the officer continues, which is usually
 * before the first has finished. The same document then came back unreadable,
 * and read perfectly once the page was reloaded and the timing happened to differ.
 *
 * Every recognition now goes through this queue, so a later one waits for the
 * one in flight instead of trampling it. A failed pass releases the queue like
 * any other, so one bad image cannot wedge the screen until it is reloaded.
 */
let inFlight = Promise.resolve();
function serialised(run) {
  const result = inFlight.then(run, run);
  inFlight = result.then(() => undefined, () => undefined);
  return result;
}

/** Characters the machine readable zone is allowed to contain. Nothing else exists there. */
const MRZ_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
/**
 * Bands to look for the zone in, as fractions of image height, tried in order.
 *
 * A single fixed strip only works when the data page fills the frame. It usually
 * does not: a passport photographed on a desk carries surrounding background, and
 * an open booklet puts the data page in half the frame with the zone somewhere in
 * the middle. The zone was then never inside the one strip that was read, so it
 * was never found — and without it a passport has nothing to cross-check its
 * printed fields against, which is most of what this analysis is.
 *
 * Ordered by how often each holds the zone, and the search stops at the first
 * well-formed result, so the common tight crop still costs one pass.
 */
/** The whole page, flattened to high contrast and enlarged, for a second reading. */
const PAGE_ENHANCE = { top: 0, height: 1, scale: 2, enhance: true };
const MRZ_BANDS = [
  { top: 0.62, height: 0.38, scale: 2, enhance: true }, // tight crop of the data page
  { top: 0.78, height: 0.22, scale: 3, enhance: true }, // zone at the very foot, enlarged further
  { top: 0.45, height: 0.35, scale: 2, enhance: true }, // open booklet: data page in the upper half
  { top: 0.50, height: 0.50, scale: 2, enhance: true }, // generous lower half
  { top: 0.00, height: 1.00, scale: 2, enhance: true }, // whole page, restricted alphabet
];
/**
 * Quarter turns to try, in order. Upright first, because most captures are.
 * Then the two sideways turns, which is how a page photographed with the phone
 * held the other way round arrives, and finally upside down.
 */
const ORIENTATIONS = [0, 90, 270, 180];

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = import.meta.env.BASE_URL || '/';
      const worker = await createWorker('eng', 1, {
        workerPath: `${base}ocr/worker.min.js`,
        corePath: `${base}ocr/core`,
        langPath: `${base}ocr/lang`,
        gzip: true,
        logger: (m) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress, 'Recognising text');
          else onProgress?.(0.05, m.status.replace(/^\w/, (c) => c.toUpperCase()));
        },
      });
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<>/-.:, ',
        preserve_interword_spaces: '1',
      });
      return worker;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/**
 * A second worker restricted to the machine readable zone's alphabet.
 * A whole-page pass has to allow lowercase, punctuation and slashes, and against
 * that alphabet the zone's filler `<` is routinely read as K, L, I or 1. Given
 * only the 37 characters that can occur there, it reads far more reliably.
 */
async function getMrzWorker() {
  if (!mrzWorkerPromise) {
    mrzWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = import.meta.env.BASE_URL || '/';
      const worker = await createWorker('eng', 1, {
        workerPath: `${base}ocr/worker.min.js`,
        corePath: `${base}ocr/core`,
        langPath: `${base}ocr/lang`,
        gzip: true,
      });
      await worker.setParameters({
        tessedit_char_whitelist: MRZ_CHARSET,
        preserve_interword_spaces: '0',
        // The zone is a block of uniform lines; treating it as such stops the
        // engine from trying to find a page layout inside a cropped strip.
        tessedit_pageseg_mode: '6',
      });
      return worker;
    })().catch((e) => { mrzWorkerPromise = null; throw e; });
  }
  return mrzWorkerPromise;
}

/**
 * Read the machine readable zone from the foot of the page on its own.
 * Returns the recognised text, or '' if the pass could not run — a failure here
 * is never fatal, it only means the document is judged without the zone.
 */
async function readMrzBand(imageDataUrl, region, onProgress) {
  try {
    onProgress?.(0.9, 'Reading machine readable zone');
    const band = await cropBand(imageDataUrl, region);
    const worker = await getMrzWorker();
    const { data } = await serialised(() => worker.recognize(band));
    return data.text || '';
  } catch {
    return '';
  }
}

/**
 * Hunt for the zone across the candidate bands of one image.
 * @returns {Promise<Object|null>} the parsed zone, or null if no band held one
 */
async function findMrz(imageDataUrl, regions, onProgress) {
  for (const region of regions) {
    const found = extractMrzLines(await readMrzBand(imageDataUrl, region, onProgress));
    if (found) return found;
  }
  return null;
}

/**
 * Score a reading of the page. A machine readable zone is worth more than any
 * amount of confidence: it is the only part of the document that can be checked
 * against itself, and finding one means the page was read the right way up.
 */
const score = (parsed, confidence) => (parsed.mrz ? 1000 : 0) + Object.keys(parsed.vizFields).length * 10 + confidence * 100;

/** @returns {Promise<import('../types.js').OcrResult>} */
export async function extract({ imageDataUrl, documentType = 'passport', onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.02, 'Loading OCR engine');
  const worker = await getWorker(onProgress);

  // Read the page upright first. If that yields a machine readable zone the
  // orientation was right and there is nothing to try; otherwise the page may
  // have been photographed sideways, and a sideways page reads as noise.
  let best = null;
  for (const degrees of ORIENTATIONS) {
    let image = imageDataUrl;
    if (degrees) {
      onProgress?.(0.5, 'Trying a different page orientation');
      try { image = await rotateDataUrl(imageDataUrl, degrees); } catch { continue; }
    }
    const { data } = await serialised(() => worker.recognize(image));
    const rawText = data.text || '';
    const parsed = parseFields(rawText, documentType);
    const confidence = Math.max(0, Math.min(1, (data.confidence || 0) / 100));
    const reading = { degrees, image, rawText, parsed, confidence };
    if (!best || score(parsed, confidence) > score(best.parsed, best.confidence)) best = reading;
    if (parsed.mrz) break;
  }

  // A photographed page carries the colour of whatever it was lying on, the shadow of
  // the hand holding it, and paper that is off-white rather than white. Recognition
  // works on the difference between ink and paper, so flattening the page to high
  // contrast and enlarging it recovers text that a raw pass reads as noise — the same
  // treatment the zone's own strip already gets, and the reason that strip reads when
  // the page does not. Tried only when the raw pass found no zone: a clean scan gains
  // nothing from it, and the pass is not free. Kept only if it actually reads better.
  if (!best.parsed.mrz) {
    try {
      onProgress?.(0.6, 'Enhancing the page and reading again');
      const enhanced = await cropBand(best.image, PAGE_ENHANCE);
      const { data } = await serialised(() => worker.recognize(enhanced));
      const rawText = data.text || '';
      const parsed = parseFields(rawText, documentType);
      const confidence = Math.max(0, Math.min(1, (data.confidence || 0) / 100));
      if (score(parsed, confidence) > score(best.parsed, best.confidence)) best = { ...best, rawText, parsed, confidence };
    } catch { /* the raw reading stands */ }
  }

  let { mrz } = best.parsed;
  const pageMrz = Boolean(mrz);

  // Read the band on its own, always — even when the page-wide pass produced a
  // zone that verifies. A misreading can satisfy the check digits by coincidence
  // (061165 carries the digit belonging to 061105), so "it verifies" is not
  // evidence the characters are right. The band reading wins whenever it yields a
  // well-formed zone: it is the better instrument by construction, the strip alone,
  // enlarged, flattened to high contrast, restricted to the 37 characters that can
  // occur there.
  //
  // Note what cannot be used to choose between two readings: how many check digits
  // each satisfies. On an altered document the true zone FAILS its digits — that
  // failure IS the finding — so preferring the reading that verifies would prefer
  // corruption to the truth on exactly the documents this exists to catch.
  // A document with no zone must not pay for the hunt: one look at the usual strip
  // is what it costs today, and finding nothing there is the correct answer for it.
  const regions = carriesMrz(documentType) ? MRZ_BANDS : MRZ_BANDS.slice(0, 1);
  const candidates = [];
  if (best.image) candidates.push({ image: best.image, regions });
  // Where no orientation yielded a zone, the page may still be sideways and `best`
  // merely the least bad guess. The foot of the page is then a different edge in
  // each turn, so each is offered its own look at the usual strip.
  if (!pageMrz) {
    for (const degrees of ORIENTATIONS) {
      if (degrees === best.degrees) continue;
      try { candidates.push({ image: await rotateDataUrl(imageDataUrl, degrees), regions: regions.slice(0, 1) }); } catch { /* skip */ }
    }
  }
  for (const c of candidates) {
    const fromBand = await findMrz(c.image, c.regions, onProgress);
    if (fromBand) { mrz = fromBand; break; }
  }

  const replaced = mrz && (!pageMrz || mrz !== best.parsed.mrz);
  const combined = replaced ? `${best.rawText}\n${mrz.lines.join('\n')}` : best.rawText;
  const { fields, vizFields, printedDates } = replaced ? parseFields(combined, documentType) : best.parsed;

  const fieldConfidence = Object.fromEntries(Object.keys(fields).map((k) => [k, best.confidence]));
  return {
    fields, vizFields, printedDates, fieldConfidence, confidence: best.confidence, rawText: combined, mrz,
    provider: 'tesseract', mrzPass: Boolean(replaced), orientation: best.degrees,
    durationMs: Math.round(performance.now() - t0),
  };
}
