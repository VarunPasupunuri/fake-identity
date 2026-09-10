/**
 * Officer-adjustable runtime settings (persisted per device): module provider
 * overrides, checkpoint id, capture guidance, sound. Defaults come from .env.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getProviderConfig } from '../modules/registry.js';
import { CHECKPOINT_ID } from '../lib/firebase.js';

import { STORAGE_PREFIX } from '../lib/storageKeys.js';

const KEY = `${STORAGE_PREFIX}settings`;
const SettingsContext = createContext(null);

const defaults = () => ({
  providers: getProviderConfig(),
  checkpoint: CHECKPOINT_ID,
  captureGuide: true,
  autoRunAfterCapture: false,
  compactTables: false,
});

function load() {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...defaults(), ...JSON.parse(raw), providers: { ...defaults().providers, ...(JSON.parse(raw).providers || {}) } } : defaults(); } catch { return defaults(); }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);
  const value = useMemo(() => ({
    settings,
    update: (patch) => setSettings((s) => ({ ...s, ...patch })),
    setProvider: (module, provider) => setSettings((s) => ({ ...s, providers: { ...s.providers, [module]: provider } })),
    reset: () => setSettings(defaults()),
  }), [settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
