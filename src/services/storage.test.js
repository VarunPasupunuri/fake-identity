import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Supabase client mock (shape of @supabase/supabase-js storage API) ----
const upload = vi.fn();
const createSignedUrls = vi.fn();
const remove = vi.fn();
const from = vi.fn(() => ({ upload, createSignedUrls, remove }));
const createClient = vi.fn(() => ({ storage: { from } }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

// dataUrlToBlob needs atob/Blob — Node 22 has both, so no image.js mock is required.

async function loadStorage(env = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./storage.js');
}

const CONFIGURED = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key', VITE_SUPABASE_STORAGE_BUCKET: 'identity-documents' };
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeEach(() => { upload.mockReset(); createSignedUrls.mockReset(); remove.mockReset(); from.mockClear(); createClient.mockClear(); });
afterEach(() => vi.unstubAllEnvs());

describe('storage path generation', () => {
  it('builds screenings/{officerUid}/{screeningId}/{kind}-{random}.jpg with no personal data', async () => {
    const { buildScreeningPath, parseScreeningPath } = await loadStorage();
    const p = buildScreeningPath({ officerUid: 'uid_ABC-123', screeningId: 'MTVO4O0K', kind: 'document' });
    expect(p).toMatch(/^screenings\/uid_ABC-123\/MTVO4O0K\/document-[a-z0-9]{8}\.jpg$/);
    expect(parseScreeningPath(p)).toMatchObject({ officerUid: 'uid_ABC-123', screeningId: 'MTVO4O0K', kind: 'document', ext: 'jpg' });
  });
  it('produces unique file names for the same screening', async () => {
    const { buildScreeningPath } = await loadStorage();
    const a = buildScreeningPath({ officerUid: 'u', screeningId: 's', kind: 'live' });
    const b = buildScreeningPath({ officerUid: 'u', screeningId: 's', kind: 'live' });
    expect(a).not.toBe(b);
  });
  it('rejects unsafe segments and unknown kinds', async () => {
    const { buildScreeningPath } = await loadStorage();
    expect(() => buildScreeningPath({ officerUid: '../etc', screeningId: 's', kind: 'document' })).toThrow(/Invalid storage path segment/);
    expect(() => buildScreeningPath({ officerUid: 'u', screeningId: '', kind: 'document' })).toThrow();
    expect(() => buildScreeningPath({ officerUid: 'u', screeningId: 's', kind: 'selfie' })).toThrow(/Unknown image kind/);
  });
});

describe('missing Supabase configuration (demo / fallback)', () => {
  it('reports unconfigured and never loads the SDK', async () => {
    const { isSupabaseConfigured, getStorageClient, getDocumentUrl } = await loadStorage({});
    expect(isSupabaseConfigured).toBe(false);
    expect(await getStorageClient()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(await getDocumentUrl('screenings/u/s/document-abc.jpg')).toBeNull();
  });
  it('uploadDocument / deleteDocument throw a typed not-configured error', async () => {
    const { uploadDocument, deleteDocument } = await loadStorage({});
    await expect(uploadDocument(PNG_DATA_URL, 'screenings/u/s/document-a.jpg')).rejects.toMatchObject({ name: 'StorageError', code: 'not-configured' });
    await expect(deleteDocument('screenings/u/s/document-a.jpg')).rejects.toMatchObject({ code: 'not-configured' });
  });
  it('still passes inline data URLs straight through for viewing', async () => {
    const { getDocumentUrl, getDocumentUrls, isInlineImage } = await loadStorage({});
    expect(isInlineImage(PNG_DATA_URL)).toBe(true);
    expect(await getDocumentUrl(PNG_DATA_URL)).toBe(PNG_DATA_URL);
    expect(await getDocumentUrls([PNG_DATA_URL, null])).toEqual([PNG_DATA_URL, null]);
  });
});

describe('uploadDocument (Supabase configured)', () => {
  it('creates the client with a Firebase access-token provider and uploads a data URL as a Blob', async () => {
    const mod = await loadStorage(CONFIGURED);
    mod.setStorageTokenProvider(async () => 'firebase-id-token');
    upload.mockResolvedValue({ data: { path: 'screenings/u/s/document-a.jpg' }, error: null });
    const res = await mod.uploadDocument(PNG_DATA_URL, 'screenings/u/s/document-a.jpg');
    expect(res).toEqual({ path: 'screenings/u/s/document-a.jpg' });
    expect(createClient).toHaveBeenCalledTimes(1);
    const [url, key, opts] = createClient.mock.calls[0];
    expect(url).toBe(CONFIGURED.VITE_SUPABASE_URL);
    expect(key).toBe(CONFIGURED.VITE_SUPABASE_ANON_KEY);
    expect(await opts.accessToken()).toBe('firebase-id-token');
    expect(opts.auth.persistSession).toBe(false);
    expect(from).toHaveBeenCalledWith('identity-documents');
    const [path, blob, uploadOpts] = upload.mock.calls[0];
    expect(path).toBe('screenings/u/s/document-a.jpg');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(uploadOpts).toMatchObject({ upsert: false, contentType: 'image/png' });
  });
  it('accepts a Blob directly and reuses one client', async () => {
    const mod = await loadStorage(CONFIGURED);
    upload.mockResolvedValue({ data: { path: 'p' }, error: null });
    await mod.uploadDocument(new Blob(['x'], { type: 'image/jpeg' }), 'screenings/u/s/live-a.jpg');
    await mod.uploadDocument(new Blob(['y'], { type: 'image/jpeg' }), 'screenings/u/s/live-b.jpg');
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it('surfaces Supabase errors (e.g. RLS denial) as StorageError', async () => {
    const mod = await loadStorage(CONFIGURED);
    upload.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(mod.uploadDocument(PNG_DATA_URL, 'screenings/other/s/document-a.jpg')).rejects.toMatchObject({ code: 'upload-failed', message: /row-level security/ });
  });
  it('rejects invalid paths and inputs before contacting Supabase', async () => {
    const mod = await loadStorage(CONFIGURED);
    await expect(mod.uploadDocument(PNG_DATA_URL, '/abs.jpg')).rejects.toMatchObject({ code: 'invalid-path' });
    await expect(mod.uploadDocument(PNG_DATA_URL, 'screenings/../x.jpg')).rejects.toMatchObject({ code: 'invalid-path' });
    await expect(mod.uploadDocument(42, 'screenings/u/s/document-a.jpg')).rejects.toMatchObject({ code: 'invalid-file' });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('signed URLs', () => {
  it('batches paths into one createSignedUrls call and caches the result', async () => {
    const mod = await loadStorage(CONFIGURED);
    createSignedUrls.mockResolvedValue({ data: [
      { path: 'screenings/u/s/document-a.jpg', signedUrl: 'https://x/a?token=1', error: null },
      { path: 'screenings/u/s/live-b.jpg', signedUrl: 'https://x/b?token=2', error: null },
    ], error: null });
    const urls = await mod.getDocumentUrls(['screenings/u/s/document-a.jpg', PNG_DATA_URL, null, 'screenings/u/s/live-b.jpg']);
    expect(urls).toEqual(['https://x/a?token=1', PNG_DATA_URL, null, 'https://x/b?token=2']);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][1]).toBe(mod.SIGNED_URL_TTL_SECONDS);
    // second call is served from cache
    expect(await mod.getDocumentUrl('screenings/u/s/document-a.jpg')).toBe('https://x/a?token=1');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });
  it('returns null (not a public URL) when the caller is not allowed to read the object', async () => {
    const mod = await loadStorage(CONFIGURED);
    createSignedUrls.mockResolvedValue({ data: [{ path: 'screenings/other/s/document-a.jpg', signedUrl: null, error: 'Object not found' }], error: null });
    expect(await mod.getDocumentUrl('screenings/other/s/document-a.jpg')).toBeNull();
  });
  it('degrades to null on network errors instead of throwing into the UI', async () => {
    const mod = await loadStorage(CONFIGURED);
    createSignedUrls.mockRejectedValue(new Error('network down'));
    expect(await mod.getDocumentUrls(['screenings/u/s/document-a.jpg'])).toEqual([null]);
  });
});

describe('deleteDocument', () => {
  it('removes the object and evicts it from the URL cache', async () => {
    const mod = await loadStorage(CONFIGURED);
    createSignedUrls.mockResolvedValue({ data: [{ path: 'screenings/u/s/document-a.jpg', signedUrl: 'https://x/a', error: null }], error: null });
    await mod.getDocumentUrl('screenings/u/s/document-a.jpg');
    remove.mockResolvedValue({ data: [], error: null });
    expect(await mod.deleteDocument('screenings/u/s/document-a.jpg')).toBe(true);
    expect(remove).toHaveBeenCalledWith(['screenings/u/s/document-a.jpg']);
    await mod.getDocumentUrl('screenings/u/s/document-a.jpg');
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });
  it('propagates delete errors', async () => {
    const mod = await loadStorage(CONFIGURED);
    remove.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(mod.deleteDocument('screenings/u/s/document-a.jpg')).rejects.toMatchObject({ code: 'delete-failed' });
  });
});
