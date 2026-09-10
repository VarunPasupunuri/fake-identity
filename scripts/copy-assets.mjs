/**
 * Copies the self-hosted ML assets from node_modules into public/ so the app
 * works with no CDN access (checkpoints often have restricted connectivity):
 *   public/ocr/     tesseract.js worker + tesseract.js-core WASM + English traineddata
 *   public/models/  face-api.js weights (SSD MobileNet v1, 68-point landmarks, recognition)
 * Runs on postinstall and before dev/build. Output is git-ignored.
 */
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const pub = join(root, 'public');

const copies = [
  [join(nm, 'tesseract.js/dist/worker.min.js'), join(pub, 'ocr/worker.min.js')],
  // tesseract.js only ever loads the LSTM cores (simd / relaxedsimd / plain) — skip the legacy variants
  ...['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm'].flatMap((c) => [
    [join(nm, `tesseract.js-core/${c}.wasm.js`), join(pub, `ocr/core/${c}.wasm.js`)],
    [join(nm, `tesseract.js-core/${c}.wasm`), join(pub, `ocr/core/${c}.wasm`)],
  ]),
  [join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), join(pub, 'ocr/lang/eng.traineddata.gz')],
  ...['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model'].flatMap((m) => [
    [join(nm, `@vladmandic/face-api/model/${m}-weights_manifest.json`), join(pub, `models/${m}-weights_manifest.json`)],
    [join(nm, `@vladmandic/face-api/model/${m}.bin`), join(pub, `models/${m}.bin`)],
  ]),
];

let copied = 0;
for (const [from, to] of copies) {
  if (!existsSync(from)) { console.warn(`[copy-assets] missing ${from} — run npm install`); continue; }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  copied++;
}
console.log(`[copy-assets] ${copied}/${copies.length} assets copied to public/`);
