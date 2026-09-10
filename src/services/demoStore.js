/**
 * Demo-mode persistence: a tiny localStorage document store with the subset of
 * behaviour the app needs from Firestore. Only used when Firebase is not configured.
 */
const PREFIX = 'borderscreen:';

function read(key, fallback) {
  try { const v = localStorage.getItem(PREFIX + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { console.warn('demo store write failed', e); return false; }
}

export const demoStore = {
  list(collection) { return read(collection, []); },
  get(collection, id) { return read(collection, []).find((d) => d.id === id) || null; },
  insert(collection, doc) {
    const all = read(collection, []);
    all.unshift(doc);
    // keep localStorage bounded (images are inline data URLs)
    while (all.length > 60) all.pop();
    if (!write(collection, all)) { all.splice(20); write(collection, all); }
    return doc;
  },
  update(collection, id, patch) {
    const all = read(collection, []);
    const i = all.findIndex((d) => d.id === id);
    if (i >= 0) { all[i] = { ...all[i], ...patch }; write(collection, all); return all[i]; }
    return null;
  },
  clear(collection) { write(collection, []); },
};

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
