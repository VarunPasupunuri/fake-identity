import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { STORAGE_PREFIX } from '../lib/storageKeys.js';

const ThemeContext = createContext(null);
const KEY = `${STORAGE_PREFIX}theme`;

function readStored() { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } }

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const fn = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#121416' : '#1f3b63');
  }, [isDark]);

  const value = useMemo(() => ({
    theme, isDark,
    setTheme: (t) => { setThemeState(t); try { localStorage.setItem(KEY, t); } catch { /* ignore */ } },
    toggle: () => { const next = isDark ? 'light' : 'dark'; setThemeState(next); try { localStorage.setItem(KEY, next); } catch { /* ignore */ } },
  }), [theme, isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
