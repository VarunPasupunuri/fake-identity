/**
 * Screening records = the audit trail. Every screening stores officer id,
 * checkpoint, timestamp, decision, and the complete output of every module.
 */
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db, isDemoMode, CHECKPOINT_ID } from '../lib/firebase.js';
import { demoStore, newId } from './demoStore.js';
import { resizeDataUrl } from '../lib/image.js';
import { uploadDocument, buildScreeningPath, isSupabaseConfigured } from './storage.js';

const COLLECTION = 'screenings';

/**
 * Store the document + live images for a screening.
 *
 *  - Supabase configured → upload to the private bucket and return object PATHS
 *    (the Firestore record never holds a URL; viewers request signed URLs).
 *  - Demo mode, or Supabase missing/failing → compact inline data URLs so the
 *    screening is never lost. `warning` explains the fallback to the officer.
 *
 * @returns {Promise<{ documentImagePath: string|null, liveImagePath: string|null,
 *   documentImageUrl: string|null, liveImageUrl: string|null, imageStorage: 'supabase'|'inline', warning?: string }>}
 */
export async function uploadScreeningImages({ uid, screeningId, documentImage, liveImage }) {
  const inline = async (warning) => ({
    documentImagePath: null,
    liveImagePath: null,
    documentImageUrl: documentImage ? await resizeDataUrl(documentImage, 700, 0.7) : null,
    liveImageUrl: liveImage ? await resizeDataUrl(liveImage, 500, 0.7) : null,
    imageStorage: 'inline',
    ...(warning ? { warning } : {}),
  });
  if (isDemoMode) return inline();
  if (!isSupabaseConfigured) return inline('Supabase Storage is not configured — images were stored inline with the record.');

  try {
    const put = async (kind, dataUrl) => {
      if (!dataUrl) return null;
      const path = buildScreeningPath({ officerUid: uid, screeningId, kind });
      const res = await uploadDocument(dataUrl, path);
      return res.path;
    };
    const [documentImagePath, liveImagePath] = await Promise.all([put('document', documentImage), put('live', liveImage)]);
    return { documentImagePath, liveImagePath, documentImageUrl: null, liveImageUrl: null, imageStorage: 'supabase' };
  } catch (e) {
    console.error('[screenings] image upload failed, storing inline', e);
    return inline(`Image upload failed (${e.message}) — images were stored inline with the record.`);
  }
}

/**
 * Persist a completed screening (module outputs) — decision may be added later.
 * @returns {Promise<string>} screening id
 */
export async function createScreening({ user, documentType, requestedType, documentCategory, classification, images, ocr, validation, tampering, barcode, face, watchlist, identity, issuer, risk, fusion, providers, durationMs, onWarning }) {
  const id = newId();
  const stored = await uploadScreeningImages({ uid: user.uid, screeningId: id, documentImage: images.document, liveImage: images.live });
  if (stored.warning) onWarning?.(stored.warning);
  const { documentImagePath, liveImagePath, documentImageUrl, liveImageUrl, imageStorage } = stored;

  const record = {
    id,
    officerId: user.uid,
    officerName: user.displayName || user.email,
    checkpoint: user.checkpoint || CHECKPOINT_ID,
    documentType,
    // Universal document model (null on records created before document profiles existed).
    documentCategory: documentCategory || fusion?.documentCategory || null,
    requestedType: requestedType || null,
    classification: classification ? stripUndefined(classification) : null,
    subjectName: ocr?.fields?.fullName || null,
    documentNumber: ocr?.fields?.documentNumber || ocr?.fields?.visaNumber || null,
    nationality: ocr?.fields?.nationality || null,
    // Object paths in the private Supabase bucket (resolved to signed URLs when viewed) …
    documentImagePath,
    liveImagePath,
    imageStorage,
    // … or inline data URLs in demo mode / storage fallback.
    documentImageUrl,
    liveImageUrl,
    // Evidence images can be large — keep the ELA heat-map out of Firestore (1 MiB doc limit) unless small,
    // and drop it entirely when the record already carries inline images.
    ocr: ocr ? stripUndefined(ocr) : null,
    validation,
    tampering: tampering ? stripUndefined({ ...tampering, evidence: { ...tampering.evidence, elaImage: imageStorage !== 'inline' && tampering.evidence?.elaImage && tampering.evidence.elaImage.length < 300000 ? tampering.evidence.elaImage : null } }) : null,
    face: face ? stripUndefined(face) : null,
    // QR / barcode, watchlist, identity correlation and issuer verification results (null on older records).
    barcode: barcode ? stripUndefined(barcode) : null,
    watchlist: watchlist ? stripUndefined(watchlist) : null,
    identity: identity ? stripUndefined(identity) : null,
    issuer: issuer ? stripUndefined(issuer) : null,
    risk: risk || null,
    // Evidence fusion output (evidence items, correlations, confidence, four-way decision, chain, counterfactual).
    fusion: fusion ? stripUndefined(fusion) : null,
    aiDecision: fusion?.decision || null,
    confidence: fusion?.confidence?.score ?? null,
    processingMs: typeof durationMs === 'number' ? durationMs : null,
    providers,
    decision: null,
    decisionNote: null,
    decidedAt: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isDemoMode) {
    demoStore.insert(COLLECTION, record);
    return id;
  }
  await setDoc(doc(db, COLLECTION, id), { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdAtIso: record.createdAt });
  return id;
}

export async function recordDecision(id, { decision, note }) {
  const patch = { decision, decisionNote: note || null, decidedAt: new Date().toISOString(), status: 'decided', updatedAt: new Date().toISOString() };
  if (isDemoMode) return demoStore.update(COLLECTION, id, patch);
  await updateDoc(doc(db, COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
  return patch;
}

export async function getScreening(id) {
  if (isDemoMode) return demoStore.get(COLLECTION, id);
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? normalise({ id: snap.id, ...snap.data() }) : null;
}

/**
 * List screenings. Officers see their own; admins see everything.
 * @param {{ user: Object, mine?: boolean, max?: number }} opts
 */
export async function listScreenings({ user, mine = true, max = 200 } = {}) {
  if (isDemoMode) {
    const all = demoStore.list(COLLECTION);
    return (mine ? all.filter((s) => s.officerId === user.uid) : all).slice(0, max);
  }
  const constraints = [orderBy('createdAt', 'desc'), limit(max)];
  if (mine) constraints.unshift(where('officerId', '==', user.uid));
  const snap = await getDocs(query(collection(db, COLLECTION), ...constraints));
  return snap.docs.map((d) => normalise({ id: d.id, ...d.data() }));
}

/** Seed a few demo records so History / Admin have something to show. */
export function seedDemoData(user) {
  if (!isDemoMode || demoStore.list(COLLECTION).length) return;
  const mk = (i, over) => ({
    id: newId(), officerId: i % 3 === 0 ? 'demo-admin' : 'demo-officer', officerName: i % 3 === 0 ? 'Admin S. Iyer' : 'Officer R. Singh', checkpoint: ['CP-DEMO-01', 'CP-RAXAUL', 'CP-JOGBANI'][i % 3],
    documentType: ['passport', 'visa', 'national_id', 'driving_license', 'permit'][i % 5],
    subjectName: ['ANITA SHARMA', 'DIPAK ROY', 'SUNITA THAPA', 'RAHUL VERMA', 'TENZIN DORJI', 'K. LAMA'][i % 6],
    documentNumber: ['M8412345', 'VS2298811', '4471-2209-118', 'MH1220110012345', 'BAP-2026-00918', 'N7710022'][i % 6],
    nationality: ['IND', 'BGD', 'NPL', 'IND', 'BTN', 'NPL'][i % 6],
    documentImagePath: null, liveImagePath: null, imageStorage: 'inline', documentImageUrl: null, liveImageUrl: null, ocr: { fields: {}, confidence: 0.9, provider: 'seed' }, validation: { checks: [], passed: 6, failed: 0, warnings: 0, ok: true },
    tampering: { score: 6, flags: [], evidence: {} }, face: { confidence: 90, match: true, documentFaceFound: true, liveFaceFound: true }, providers: { ocr: 'seed', tamper: 'seed', face: 'seed' },
    risk: { score: 8, level: 'low', factors: [], recommendation: 'accept', summary: 'No issues detected.' },
    decision: 'accept', decisionNote: null, status: 'decided',
    createdAt: new Date(Date.now() - i * 3600e3 * 5).toISOString(), decidedAt: new Date(Date.now() - i * 3600e3 * 5 + 60e3).toISOString(), updatedAt: new Date().toISOString(),
    ...over,
  });
  const rows = Array.from({ length: 14 }, (_, i) => mk(i, {}));
  rows[1] = mk(1, { risk: { score: 71, level: 'high', factors: [{ id: 'f', label: 'Face match 38%', points: 22, source: 'face', detail: '' }], recommendation: 'reject', summary: 'Driven by: face mismatch.' }, decision: 'reject', face: { confidence: 38, match: false, documentFaceFound: true, liveFaceFound: true }, tampering: { score: 64, flags: [{ id: 'ela_0', type: 'photo_replacement', severity: 'high', label: 'Possible photo replacement', detail: '', region: { x: 0.06, y: 0.25, w: 0.24, h: 0.42 } }], evidence: {} } });
  rows[4] = mk(4, { risk: { score: 41, level: 'medium', factors: [{ id: 'v', label: 'Document not expired', points: 25, source: 'validation', detail: 'Expired 40 days ago.' }], recommendation: 'flag', summary: 'Driven by: expiry.' }, decision: 'flag', validation: { checks: [], passed: 5, failed: 1, warnings: 0, ok: false } });
  rows[7] = mk(7, { risk: { score: 35, level: 'medium', factors: [], recommendation: 'flag', summary: '' }, decision: 'flag' });
  rows[9] = mk(9, { risk: { score: 88, level: 'high', factors: [], recommendation: 'reject', summary: '' }, decision: 'reject' });
  // Seed rows pre-date evidence fusion; derive the system assessment fields the dashboard shows from the legacy risk block.
  const AI = { accept: 'approve', flag: 'review', reject: 'reject' };
  for (const r of rows) {
    r.aiDecision = r.aiDecision || AI[r.risk?.recommendation] || null;
    r.confidence = r.confidence ?? 70 + ((r.risk?.score || 0) % 17);
    r.processingMs = r.processingMs ?? 9000 + ((r.risk?.score || 0) * 90);
  }
  for (const r of rows.reverse()) demoStore.insert(COLLECTION, r);
  void user;
}

function normalise(d) {
  const toIso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v || null);
  return { ...d, createdAt: toIso(d.createdAt) || d.createdAtIso || null, updatedAt: toIso(d.updatedAt), decidedAt: toIso(d.decidedAt) };
}

function stripUndefined(o) {
  return JSON.parse(JSON.stringify(o ?? null));
}

/** Aggregate stats for the admin dashboard, computed client-side from a list. */
export function computeStats(rows) {
  const total = rows.length;
  const decided = rows.filter((r) => r.decision);
  const byDecision = { accept: 0, flag: 0, reject: 0, pending: 0 };
  const byType = {};
  const byCheckpoint = {};
  const byLevel = { low: 0, medium: 0, high: 0 };
  for (const r of rows) {
    byDecision[r.decision || 'pending']++;
    byType[r.documentType] = byType[r.documentType] || { total: 0, flagged: 0 };
    byType[r.documentType].total++;
    if (r.decision === 'flag' || r.decision === 'reject') byType[r.documentType].flagged++;
    byCheckpoint[r.checkpoint || '—'] = byCheckpoint[r.checkpoint || '—'] || { total: 0, flagged: 0 };
    byCheckpoint[r.checkpoint || '—'].total++;
    if (r.decision === 'flag' || r.decision === 'reject') byCheckpoint[r.checkpoint || '—'].flagged++;
    if (r.risk?.level) byLevel[r.risk.level]++;
  }
  const flaggedPct = total ? Math.round(((byDecision.flag + byDecision.reject) / total) * 100) : 0;
  const avgRisk = total ? Math.round(rows.reduce((s, r) => s + (r.risk?.score || 0), 0) / total) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((r) => (r.createdAt || '').slice(0, 10) === today).length;
  return { total, decided: decided.length, byDecision, byType, byCheckpoint, byLevel, flaggedPct, avgRisk, todayCount };
}
