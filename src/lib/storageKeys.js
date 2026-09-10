/**
 * localStorage namespace for per-device state (demo store, theme, settings).
 * Keys written under the previous product name are renamed once so existing
 * demo data and preferences survive the rebrand.
 */
export const STORAGE_PREFIX = 'identity-sentinel:';
const LEGACY_PREFIX = 'borderscreen:';

export function migrateLegacyStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    const legacy = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) legacy.push(k);
    }
    for (const k of legacy) {
      const next = STORAGE_PREFIX + k.slice(LEGACY_PREFIX.length);
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  } catch { /* storage unavailable — nothing to migrate */ }
}

migrateLegacyStorage();
