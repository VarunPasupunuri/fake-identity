/**
 * Document image storage — Supabase Storage (private bucket) behind a small,
 * provider-independent API. Nothing else in the app imports @supabase/supabase-js.
 *
 *   uploadDocument(file, path)  → { path }
 *   getDocumentUrl(path)        → short-lived signed URL (or null)
 *   getDocumentUrls(paths)      → batch signed URLs, cached
 *   deleteDocument(path)        → removes the object
 *   buildScreeningPath(...)     → screenings/{officerUid}/{screeningId}/{kind}-{random}.jpg
 *
 * Authentication: the Supabase client is created with an `accessToken` callback
 * that returns the current Firebase ID token. With the project's Firebase Auth
 * registered as a Third-Party Auth provider in Supabase, Storage RLS policies see
 * the Firebase user (`auth.jwt()->>'sub'` = Firebase uid), so officers can only
 * touch their own folder and the bucket never needs to be public.
 *
 * Modes:
 *   demo mode (no Firebase)         → images stay inline as data URLs (localStorage)
 *   Firebase but no Supabase config → uploads are refused with a clear error; the
 *                                     caller falls back to compact inline images
 *   Firebase + Supabase             → private bucket + signed URLs
 */
import { dataUrlToBlob } from '../lib/image.js';

const env = import.meta.env;

export const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const STORAGE_BUCKET = env.VITE_SUPABASE_STORAGE_BUCKET || 'identity-documents';
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Signed URLs are valid for this long; the cache refreshes them a little earlier. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CACHE_SLACK_MS = 60 * 1000;

let clientPromise = null;
let tokenProvider = async () => null;

/** Wire the Firebase ID-token provider (called once from the auth service). */
export function setStorageTokenProvider(fn) {
  tokenProvider = typeof fn === 'function' ? fn : async () => null;
}

/** Lazily create the Supabase client so the SDK is never loaded in demo mode. */
export async function getStorageClient() {
  if (!isSupabaseConfigured) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        // Third-party auth: hand Supabase the Firebase ID token for every request.
        accessToken: async () => (await tokenProvider()) || null,
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    ).catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

/** Test hook: reset the lazily-created client and URL cache. */
export function _resetStorageForTests() {
  clientPromise = null;
  urlCache.clear();
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Build the object path for a screening image. Only opaque identifiers appear in
 * the path — never the subject's name or document number.
 * @param {{ officerUid: string, screeningId: string, kind: 'document'|'live', ext?: string }} p
 */
export function buildScreeningPath({ officerUid, screeningId, kind, ext = 'jpg' }) {
  for (const [k, v] of Object.entries({ officerUid, screeningId, kind })) {
    if (!v || !SAFE_SEGMENT.test(String(v))) throw new Error(`Invalid storage path segment "${k}": ${v}`);
  }
  if (!['document', 'live'].includes(kind)) throw new Error(`Unknown image kind "${kind}"`);
  return `screenings/${officerUid}/${screeningId}/${kind}-${randomToken(8)}.${ext}`;
}

/** Parse a screening path back into its parts (used by tests and policies docs). */
export function parseScreeningPath(path) {
  const m = /^screenings\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(document|live)-([A-Za-z0-9]+)\.(\w+)$/.exec(path || '');
  return m ? { officerUid: m[1], screeningId: m[2], kind: m[3], token: m[4], ext: m[5] } : null;
}

export function randomToken(len = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Upload an image to the private bucket.
 * @param {Blob|File|string} file  Blob/File, or a data URL
 * @param {string} path            object path (see buildScreeningPath)
 * @returns {Promise<{ path: string }>}
 */
export async function uploadDocument(file, path) {
  if (!isSupabaseConfigured) throw new StorageError('Supabase Storage is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).', 'not-configured');
  if (!path || path.startsWith('/') || path.includes('..')) throw new StorageError(`Invalid storage path "${path}"`, 'invalid-path');
  const blob = typeof file === 'string' ? dataUrlToBlob(file) : file;
  if (!blob || typeof blob.size !== 'number') throw new StorageError('uploadDocument expects a Blob, File, or data URL', 'invalid-file');
  const client = await getStorageClient();
  const { data, error } = await client.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
    cacheControl: '3600',
  });
  if (error) throw new StorageError(`Upload failed: ${error.message}`, 'upload-failed', error);
  return { path: data?.path || path };
}

const urlCache = new Map(); // path -> { url, expiresAt }

/**
 * Signed, time-limited URL for viewing a private object. Returns null when the
 * path is empty, storage is unconfigured, or the caller is not allowed to read it.
 */
export async function getDocumentUrl(path) {
  if (!path) return null;
  if (isInlineImage(path)) return path; // demo/fallback records store the image itself
  const [url] = await getDocumentUrls([path]);
  return url;
}

/** Batch variant with a small in-memory cache (thumbnails in lists). */
export async function getDocumentUrls(paths) {
  const out = new Array(paths.length).fill(null);
  if (!paths.length) return out;
  const now = Date.now();
  const missing = [];
  paths.forEach((p, i) => {
    if (!p) return;
    if (isInlineImage(p)) { out[i] = p; return; }
    const hit = urlCache.get(p);
    if (hit && hit.expiresAt - CACHE_SLACK_MS > now) out[i] = hit.url; else missing.push(p);
  });
  if (!missing.length || !isSupabaseConfigured) return out;
  try {
    const client = await getStorageClient();
    const unique = [...new Set(missing)];
    const { data, error } = await client.storage.from(STORAGE_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    for (const row of data || []) {
      if (row.signedUrl && !row.error) urlCache.set(row.path, { url: row.signedUrl, expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000 });
    }
    paths.forEach((p, i) => { if (out[i] === null && p) out[i] = urlCache.get(p)?.url || null; });
  } catch (e) {
    console.warn('[storage] could not create signed URLs', e?.message || e);
  }
  return out;
}

/** Delete an object (not used by the audit-trail UI; provided for admin tooling). */
export async function deleteDocument(path) {
  if (!isSupabaseConfigured) throw new StorageError('Supabase Storage is not configured.', 'not-configured');
  if (!path) throw new StorageError('deleteDocument requires a path', 'invalid-path');
  const client = await getStorageClient();
  const { error } = await client.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) throw new StorageError(`Delete failed: ${error.message}`, 'delete-failed', error);
  urlCache.delete(path);
  return true;
}

/** Inline images (demo mode / no-Supabase fallback) are data URLs, not object paths. */
export function isInlineImage(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

export class StorageError extends Error {
  constructor(message, code, cause) { super(message); this.name = 'StorageError'; this.code = code; this.cause = cause; }
}
