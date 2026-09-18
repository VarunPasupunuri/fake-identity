/**
 * In-browser OCR using Tesseract.js. Runs entirely on the officer's device —
 * useful when checkpoints have poor connectivity. The worker, WASM core and
 * English traineddata are self-hosted under /ocr (see scripts/copy-assets.mjs)
 * so no CDN access is needed; the browser caches them after first load.
 */
import { parseFields } from './parse.js';
import { extractMrzLines } from '../validation/mrz.js';
import { cropBand, rotateDataUrl } from '../../lib/image.js';

let workerPromise = null;
let mrzWorkerPromise = null;

/** Characters the machine readable zone is allowed to contain. Nothing else exists there. */
const MRZ_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
/** The band of the page the zone occupies, as a fraction of height. */
const MRZ_BAND = { top: 0.62, height: 0.38, scale: 2 };
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
async function readMrzBand(imageDataUrl, onProgress) {
  try {
    onProgress?.(0.9, 'Reading machine readable zone');
    const band = await cropBand(imageDataUrl, MRZ_BAND);
    const worker = await getMrzWorker();
    const { data } = await worker.recognize(band);
    return data.text || '';
  } catch {
    return '';
  }
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
    const { data } = await worker.recognize(image);
    const rawText = data.text || '';
    const parsed = parseFields(rawText, documentType);
    const confidence = Math.max(0, Math.min(1, (data.confidence || 0) / 100));
    const reading = { degrees, image, rawText, parsed, confidence };
    if (!best || score(parsed, confidence) > score(best.parsed, best.confidence)) best = reading;
    if (parsed.mrz) break;
  }

  let { mrz } = best.parsed;
  const pageMrz = Boolean(mrz);

  // No zone from the page-wide pass: look at the band alone, in the orientation
  // that read best. Without the zone nothing can be cross-checked, and an
  // altered field has nothing to contradict it.
  if (!mrz && best.image) {
    mrz = extractMrzLines(await readMrzBand(best.image, onProgress)) || null;
  }

  // Re-parse with the zone appended so the printed fields and the zone come from
  // one text, exactly as they would had the page-wide pass found it.
  const combined = mrz && !pageMrz ? `${best.rawText}\n${mrz.lines.join('\n')}` : best.rawText;
  const { fields, vizFields } = mrz && !pageMrz ? parseFields(combined, documentType) : best.parsed;

  const fieldConfidence = Object.fromEntries(Object.keys(fields).map((k) => [k, best.confidence]));
  return {
    fields, vizFields, fieldConfidence, confidence: best.confidence, rawText: combined, mrz,
    provider: 'tesseract', mrzPass: Boolean(mrz && !pageMrz), orientation: best.degrees,
    durationMs: Math.round(performance.now() - t0),
  };
}
