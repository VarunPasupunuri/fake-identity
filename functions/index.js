/**
 * BorderScreen Cloud Functions (Firebase Functions v2, region asia-south1).
 *
 *  ocrExtract        callable  – Google Cloud Vision DOCUMENT_TEXT_DETECTION → raw text + confidence
 *  analyzeTampering  callable  – ELA (sharp) + EXIF (exifr) → { score, flags, evidence }
 *  setUserRole       callable  – admin-only: set custom claims (role=authenticated, app_role) + users/{uid}.role
 *  onScreeningCreated trigger  – maintains stats/summary counters for the admin dashboard
 *
 * Enable "Cloud Vision API" in the GCP project before deploying ocrExtract.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import exifr from 'exifr';
import { runEla, analyseElaCells, analyseMetadata } from './ela.js';

initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 20 });

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  return request.auth;
}

function decodeImage(imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== 'string') throw new HttpsError('invalid-argument', 'imageBase64 is required.');
  const buf = Buffer.from(imageBase64, 'base64');
  if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) throw new HttpsError('invalid-argument', 'Image is empty or larger than 12 MB.');
  return buf;
}

/** OCR via Google Cloud Vision. Field parsing is done client-side (shared parser). */
export const ocrExtract = onCall({ memory: '512MiB', timeoutSeconds: 60 }, async (request) => {
  requireAuth(request);
  const buf = decodeImage(request.data?.imageBase64);
  const { ImageAnnotatorClient } = await import('@google-cloud/vision');
  const client = new ImageAnnotatorClient();
  const [res] = await client.documentTextDetection({ image: { content: buf } });
  const annotation = res.fullTextAnnotation;
  if (!annotation) return { rawText: '', confidence: 0, blocks: [] };

  // Average word confidence across the page(s)
  let sum = 0, n = 0;
  const blocks = [];
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      if (typeof block.confidence === 'number') { sum += block.confidence; n++; }
      const verts = block.boundingBox?.normalizedVertices?.length ? block.boundingBox.normalizedVertices : null;
      if (verts) {
        const xs = verts.map((v) => v.x || 0), ys = verts.map((v) => v.y || 0);
        blocks.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), confidence: block.confidence ?? null });
      }
    }
  }
  return { rawText: annotation.text || '', confidence: n ? sum / n : 0.8, blocks };
});

/** Basic CV tampering pipeline: ELA + EXIF. */
export const analyzeTampering = onCall({ memory: '1GiB', timeoutSeconds: 60 }, async (request) => {
  requireAuth(request);
  const buf = decodeImage(request.data?.imageBase64);
  const documentType = String(request.data?.documentType || 'passport');

  const exif = await exifr.parse(buf, { xmp: true, tiff: true, exif: true, ifd0: true }).catch(() => null);
  const meta = analyseMetadata(exif);
  const ela = await runEla(buf);
  const elaRes = analyseElaCells(ela, documentType);
  const score = Math.min(100, Math.round(Math.max(elaRes.score, meta.score) + Math.min(elaRes.score, meta.score) * 0.3));

  return {
    score,
    flags: [...elaRes.flags, ...meta.flags],
    evidence: {
      elaImage: ela.elaImage,
      metadata: meta.summary,
      stats: { hotspots: elaRes.hotspots, meanError: +ela.mean.toFixed(2), stdError: +ela.std.toFixed(2), grid: ela.cells.length, width: ela.width, height: ela.height },
    },
  };
});

/** Admin-only role management. Sets a custom claim (used by security rules) and mirrors it on the user doc. */
export const setUserRole = onCall(async (request) => {
  const auth = requireAuth(request);
  const db = getFirestore();
  const callerDoc = await db.doc(`users/${auth.uid}`).get();
  const isAdmin = auth.token.app_role === 'admin' || callerDoc.data()?.role === 'admin';
  if (!isAdmin) throw new HttpsError('permission-denied', 'Admin role required.');

  const { uid, role, checkpoint } = request.data || {};
  if (!uid || !['officer', 'admin'].includes(role)) throw new HttpsError('invalid-argument', 'uid and role (officer|admin) are required.');
  // `role: 'authenticated'` is what Supabase third-party auth expects; the app role lives in `app_role`.
  await getAuth().setCustomUserClaims(uid, { role: 'authenticated', app_role: role });
  await db.doc(`users/${uid}`).set({ role, ...(checkpoint ? { checkpoint } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

/** Keep a cheap aggregate for the admin dashboard so it does not need to scan every screening. */
export const onScreeningCreated = onDocumentCreated('screenings/{id}', async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const db = getFirestore();
  const level = data.risk?.level || 'unknown';
  const type = data.documentType || 'unknown';
  const checkpoint = data.checkpoint || 'unknown';
  await db.doc('stats/summary').set(
    {
      total: FieldValue.increment(1),
      [`byLevel.${level}`]: FieldValue.increment(1),
      [`byType.${type}`]: FieldValue.increment(1),
      [`byCheckpoint.${checkpoint}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
});
