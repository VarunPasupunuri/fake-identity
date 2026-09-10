import { describe, it, expect, vi, beforeEach } from 'vitest';

// Browser-only helpers are mocked: resizeDataUrl needs <canvas>.
vi.mock('../lib/image.js', () => ({ resizeDataUrl: vi.fn(async (d) => `${d}#resized`) }));

const storageMock = { uploadDocument: vi.fn(), buildScreeningPath: vi.fn(({ officerUid, screeningId, kind }) => `screenings/${officerUid}/${screeningId}/${kind}-abcd1234.jpg`), isSupabaseConfigured: true };
vi.mock('./storage.js', () => storageMock);

const firestoreMock = { setDoc: vi.fn(async () => {}), doc: vi.fn((_, c, id) => `${c}/${id}`), serverTimestamp: vi.fn(() => 'TS'), getDoc: vi.fn(), updateDoc: vi.fn(), collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn() };
vi.mock('firebase/firestore', () => firestoreMock);

const firebaseMock = { db: {}, isDemoMode: false, CHECKPOINT_ID: 'CP-TEST' };
vi.mock('../lib/firebase.js', () => firebaseMock);

// localStorage for the demo store
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };

const user = { uid: 'officer-1', displayName: 'Officer One', email: 'o@x', checkpoint: 'CP-TEST' };
const base = { user, documentType: 'passport', images: { document: 'data:image/jpeg;base64,DOC', live: 'data:image/jpeg;base64,LIVE' }, ocr: { fields: { fullName: 'A B', documentNumber: 'X1' }, confidence: 0.9 }, validation: { checks: [], passed: 1, failed: 0, warnings: 0, ok: true }, tampering: { score: 3, flags: [], evidence: { elaImage: 'data:image/jpeg;base64,ELA' } }, face: { confidence: 90, match: true, documentFaceFound: true, liveFaceFound: true }, risk: { score: 5, level: 'low', factors: [], recommendation: 'accept', summary: '' }, providers: { ocr: 'tesseract', tamper: 'local', face: 'faceapi' } };

async function load({ demo = false, supabase = true } = {}) {
  vi.resetModules();
  firebaseMock.isDemoMode = demo;
  storageMock.isSupabaseConfigured = supabase;
  return import('./screenings.js');
}

beforeEach(() => { storageMock.uploadDocument.mockReset(); firestoreMock.setDoc.mockClear(); mem.clear(); });

describe('screening upload flow', () => {
  it('Firebase + Supabase: uploads both images and stores only object paths in Firestore', async () => {
    const { createScreening } = await load();
    storageMock.uploadDocument.mockImplementation(async (_file, path) => ({ path }));
    const warn = vi.fn();
    const id = await createScreening({ ...base, onWarning: warn });
    expect(typeof id).toBe('string');
    expect(storageMock.uploadDocument).toHaveBeenCalledTimes(2);
    const [[docFile, docPath], [liveFile, livePath]] = storageMock.uploadDocument.mock.calls;
    expect(docFile).toBe(base.images.document);
    expect(docPath).toBe(`screenings/officer-1/${id}/document-abcd1234.jpg`);
    expect(liveFile).toBe(base.images.live);
    expect(livePath).toBe(`screenings/officer-1/${id}/live-abcd1234.jpg`);
    const record = firestoreMock.setDoc.mock.calls[0][1];
    expect(record).toMatchObject({ id, officerId: 'officer-1', imageStorage: 'supabase', documentImagePath: docPath, liveImagePath: livePath, documentImageUrl: null, liveImageUrl: null });
    expect(JSON.stringify(record)).not.toContain('base64,DOC');
    expect(record.tampering.evidence.elaImage).toBe('data:image/jpeg;base64,ELA');
    expect(warn).not.toHaveBeenCalled();
  });

  it('Firebase + Supabase: skips the live upload when no live photo was captured', async () => {
    const { createScreening } = await load();
    storageMock.uploadDocument.mockImplementation(async (_f, path) => ({ path }));
    await createScreening({ ...base, images: { document: base.images.document, live: null }, face: null });
    expect(storageMock.uploadDocument).toHaveBeenCalledTimes(1);
    expect(firestoreMock.setDoc.mock.calls[0][1]).toMatchObject({ liveImagePath: null, liveImageUrl: null, face: null });
  });

  it('Firebase without Supabase config: falls back to inline images and warns', async () => {
    const { createScreening } = await load({ supabase: false });
    const warn = vi.fn();
    await createScreening({ ...base, onWarning: warn });
    expect(storageMock.uploadDocument).not.toHaveBeenCalled();
    const record = firestoreMock.setDoc.mock.calls[0][1];
    expect(record).toMatchObject({ imageStorage: 'inline', documentImagePath: null, documentImageUrl: 'data:image/jpeg;base64,DOC#resized', liveImageUrl: 'data:image/jpeg;base64,LIVE#resized' });
    expect(record.tampering.evidence.elaImage).toBeNull(); // keeps the Firestore document small
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not configured/));
  });

  it('Firebase + Supabase: an upload error (e.g. RLS denial) does not lose the screening', async () => {
    const { createScreening } = await load();
    storageMock.uploadDocument.mockRejectedValue(new Error('new row violates row-level security policy'));
    const warn = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await createScreening({ ...base, onWarning: warn });
    errSpy.mockRestore();
    expect(id).toBeTruthy();
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
    expect(firestoreMock.setDoc.mock.calls[0][1]).toMatchObject({ imageStorage: 'inline', documentImagePath: null });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/row-level security/));
  });

  it('Demo mode: no Firestore, no Supabase — record with inline images goes to localStorage', async () => {
    const { createScreening, getScreening, listScreenings } = await load({ demo: true, supabase: false });
    const id = await createScreening(base);
    expect(storageMock.uploadDocument).not.toHaveBeenCalled();
    expect(firestoreMock.setDoc).not.toHaveBeenCalled();
    const rec = await getScreening(id);
    expect(rec).toMatchObject({ id, imageStorage: 'inline', documentImageUrl: 'data:image/jpeg;base64,DOC#resized' });
    expect((await listScreenings({ user })).map((r) => r.id)).toContain(id);
  });

  it('recordDecision only touches decision fields', async () => {
    const { createScreening, recordDecision, getScreening } = await load({ demo: true, supabase: false });
    const id = await createScreening(base);
    await recordDecision(id, { decision: 'flag', note: 'check stamp' });
    const rec = await getScreening(id);
    expect(rec).toMatchObject({ decision: 'flag', decisionNote: 'check stamp', status: 'decided' });
    expect(rec.documentImageUrl).toBe('data:image/jpeg;base64,DOC#resized');
  });
});
