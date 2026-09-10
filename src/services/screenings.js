/**
 * Screening records = the audit trail. Every screening stores officer id,
 * checkpoint, timestamp, decision, and the complete output of every module.
 */
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isDemoMode, CHECKPOINT_ID } from '../lib/firebase.js';
import { demoStore, newId } from './demoStore.js';
import { dataUrlToBlob, resizeDataUrl } from '../lib/image.js';

const COLLECTION = 'screenings';

/** Upload document + live images. In demo mode returns compact inline data URLs. */
export async function uploadScreeningImages({ uid, screeningId, documentImage, liveImage }) {
  if (isDemoMode) {
    return {
      documentImageUrl: await resizeDataUrl(documentImage, 700, 0.7),
      liveImageUrl: liveImage ? await resizeDataUrl(liveImage, 500, 0.7) : null,
    };
  }
  const put = async (name, dataUrl) => {
    if (!dataUrl) return null;
    const r = ref(storage, `screenings/${uid}/${screeningId}/${name}.jpg`);
    await uploadBytes(r, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg' });
    return getDownloadURL(r);
  };
  const [documentImageUrl, liveImageUrl] = await Promise.all([put('document', documentImage), put('live', liveImage)]);
  return { documentImageUrl, liveImageUrl };
}

/**
 * Persist a completed screening (module outputs) — decision may be added later.
 * @returns {Promise<string>} screening id
 */
export async function createScreening({ user, documentType, images, ocr, validation, tampering, face, risk, providers }) {
  const id = newId();
  const { documentImageUrl, liveImageUrl } = await uploadScreeningImages({ uid: user.uid, screeningId: id, documentImage: images.document, liveImage: images.live });

  const record = {
    id,
    officerId: user.uid,
    officerName: user.displayName || user.email,
    checkpoint: user.checkpoint || CHECKPOINT_ID,
    documentType,
    subjectName: ocr?.fields?.fullName || null,
    documentNumber: ocr?.fields?.documentNumber || ocr?.fields?.visaNumber || null,
    nationality: ocr?.fields?.nationality || null,
    documentImageUrl,
    liveImageUrl,
    // Evidence images can be large — keep the ELA heat-map out of Firestore (1 MiB doc limit) unless small.
    ocr: ocr ? stripUndefined(ocr) : null,
    validation,
    tampering: tampering ? stripUndefined({ ...tampering, evidence: { ...tampering.evidence, elaImage: tampering.evidence?.elaImage && tampering.evidence.elaImage.length < 300000 ? tampering.evidence.elaImage : null } }) : null,
    face: face ? stripUndefined(face) : null,
    risk: risk || null,
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
    documentImageUrl: null, liveImageUrl: null, ocr: { fields: {}, confidence: 0.9, provider: 'seed' }, validation: { checks: [], passed: 6, failed: 0, warnings: 0, ok: true },
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
