/**
 * In-browser OCR using Tesseract.js. Runs entirely on the officer's device —
 * useful when checkpoints have poor connectivity. The worker, WASM core and
 * English traineddata are self-hosted under /ocr (see scripts/copy-assets.mjs)
 * so no CDN access is needed; the browser caches them after first load.
 */
import { parseFields } from './parse.js';

let workerPromise = null;

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

/** @returns {Promise<import('../types.js').OcrResult>} */
export async function extract({ imageDataUrl, documentType = 'passport', onProgress }) {
  const t0 = performance.now();
  onProgress?.(0.02, 'Loading OCR engine');
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(imageDataUrl);
  const rawText = data.text || '';
  const { fields, vizFields, mrz } = parseFields(rawText, documentType);
  const confidence = Math.max(0, Math.min(1, (data.confidence || 0) / 100));
  const fieldConfidence = Object.fromEntries(Object.keys(fields).map((k) => [k, confidence]));
  return { fields, vizFields, fieldConfidence, confidence, rawText, mrz, provider: 'tesseract', durationMs: Math.round(performance.now() - t0) };
}
