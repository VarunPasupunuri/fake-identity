/**
 * In-browser OCR using Tesseract.js. Runs entirely on the officer's device —
 * useful when checkpoints have poor connectivity. The worker, WASM core and
 * English traineddata are self-hosted under /ocr (see scripts/copy-assets.mjs)
 * so no CDN access is needed; the browser caches them after first load.
 */
import { parseFields } from './parse.js';
import { extractMrzLines } from '../validation/mrz.js';
import { cropBand } from '../../lib/image.js';

let workerPromise = null;
let mrzWorkerPromise = null;

/** Characters the machine readable zone is allowed to contain. Nothing else exists there. */
const MRZ_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
/** The band of the page the zone occupies, as a fraction of height. */
const MRZ_BAND = { top: 0.62, height: 0.38, scale: 2 };

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

/** @returns {Promise<import('../types.js').OcrResult>} */
export async function extract({ imageDataUrl, documentType = 'passport', onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.02, 'Loading OCR engine');
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(imageDataUrl);
  const rawText = data.text || '';
  const parsed = parseFields(rawText, documentType);
  let { mrz } = parsed;

  // The zone carries the values every printed field is checked against, so when the
  // page-wide pass did not yield one it is worth a second look at the band alone.
  // Without it nothing can be cross-checked, and an altered field has nothing to
  // contradict it.
  let mrzText = '';
  if (!mrz && imageDataUrl) {
    mrzText = await readMrzBand(imageDataUrl, onProgress);
    mrz = extractMrzLines(mrzText) || null;
  }

  // Re-parse with the zone appended so the printed fields and the zone are read
  // from one text, exactly as they would have been had the first pass found it.
  const combined = mrz && !parsed.mrz ? `${rawText}\n${mrz.lines.join('\n')}` : rawText;
  const { fields, vizFields } = mrz && !parsed.mrz ? parseFields(combined, documentType) : parsed;

  const confidence = Math.max(0, Math.min(1, (data.confidence || 0) / 100));
  const fieldConfidence = Object.fromEntries(Object.keys(fields).map((k) => [k, confidence]));
  return { fields, vizFields, fieldConfidence, confidence, rawText: combined, mrz, provider: 'tesseract', mrzPass: Boolean(mrz && !parsed.mrz), durationMs: Math.round(performance.now() - t0) };
}
