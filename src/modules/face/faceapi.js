/**
 * Face verification with face-api.js (@vladmandic/face-api, TF.js backend).
 * Runs in the browser. Model weights (~12 MB) are self-hosted under /models
 * (copied from the npm package by scripts/copy-assets.mjs) and cached by the
 * browser after first use. Override with VITE_FACE_MODELS_URL to serve them elsewhere.
 *
 * To swap in a stronger server-side matcher (e.g. ArcFace via a Cloud Function or
 * a vendor API), add a provider in ./index.js returning the same FaceResult shape.
 */
import { loadImage } from '../../lib/image.js';

const DEFAULT_MODELS_URL = `${import.meta.env.BASE_URL || '/'}models`;
const MATCH_DISTANCE = 0.6; // euclidean distance on 128-d descriptor; < 0.6 is the usual "same person" threshold

let faceapiPromise = null;

async function getFaceApi(onProgress) {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      onProgress?.(0.05, 'Loading face models');
      const faceapi = await import('@vladmandic/face-api');
      // Pick a TF.js backend explicitly: WebGL on tablets/laptops, CPU as a universal fallback.
      // (The bundled WASM backend needs its .wasm served next to the JS, which we do not ship.)
      const tf = faceapi.tf;
      try { tf.removeBackend('wasm'); } catch { /* not registered */ }
      let backend = 'webgl';
      try { await tf.setBackend('webgl'); await tf.ready(); } catch { backend = 'cpu'; await tf.setBackend('cpu'); await tf.ready(); }
      console.info(`[face] tf.js backend: ${backend}`);
      const url = import.meta.env.VITE_FACE_MODELS_URL || DEFAULT_MODELS_URL;
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      return faceapi;
    })().catch((e) => { faceapiPromise = null; throw e; });
  }
  return faceapiPromise;
}

async function describe(faceapi, dataUrl) {
  const img = await loadImage(dataUrl);
  const det = await faceapi
    .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) return null;
  const b = det.detection.box;
  return { descriptor: det.descriptor, box: { x: b.x / img.width, y: b.y / img.height, w: b.width / img.width, h: b.height / img.height } };
}

/** Map descriptor distance → 0..100 confidence (0.2 → 100, 0.6 → 50, 1.0 → 0). */
export function distanceToConfidence(d) {
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - (d - 0.2) / 0.8))));
}

/** @returns {Promise<import('../types.js').FaceResult>} */
export async function verify({ documentImageDataUrl, liveImageDataUrl, onProgress }) {
  const t0 = performance.now();
  const faceapi = await getFaceApi(onProgress);
  onProgress?.(0.35, 'Detecting face on document');
  const doc = await describe(faceapi, documentImageDataUrl);
  onProgress?.(0.65, 'Detecting live face');
  const live = await describe(faceapi, liveImageDataUrl);
  onProgress?.(0.9, 'Comparing embeddings');

  let distance = null;
  let confidence = 0;
  if (doc && live) {
    distance = faceapi.euclideanDistance(doc.descriptor, live.descriptor);
    confidence = distanceToConfidence(distance);
  }
  return {
    confidence,
    match: distance !== null && distance < MATCH_DISTANCE,
    distance: distance === null ? null : +distance.toFixed(3),
    documentFaceFound: Boolean(doc),
    liveFaceFound: Boolean(live),
    documentFaceBox: doc?.box || null,
    liveFaceBox: live?.box || null,
    provider: 'face-api.js',
    durationMs: Math.round(performance.now() - t0),
    note: !doc ? 'No face detected on the document image.' : !live ? 'No face detected in the live capture.' : undefined,
  };
}
