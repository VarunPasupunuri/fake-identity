import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);
let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((toast) => {
    const id = ++seq;
    const t = { id, tone: 'info', duration: 4000, ...toast };
    setToasts((all) => [...all.slice(-3), t]);
    if (t.duration > 0) setTimeout(() => dismiss(id), t.duration);
    return id;
  }, [dismiss]);
  const api = useMemo(() => ({
    push,
    success: (title, body) => push({ tone: 'success', title, body }),
    error: (title, body) => push({ tone: 'error', title, body, duration: 7000 }),
    warn: (title, body) => push({ tone: 'warn', title, body }),
    info: (title, body) => push({ tone: 'info', title, body }),
    dismiss,
  }), [push, dismiss]);

  const icons = { success: CheckCircle2, error: XCircle, warn: AlertTriangle, info: Info };
  const tones = { success: 'text-emerald-500', error: 'text-red-500', warn: 'text-amber-500', info: 'text-brand-500' };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone] || Info;
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg animate-slide-up">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tones[t.tone]}`} />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t.title}</p>{t.body && <p className="text-xs muted">{t.body}</p>}</div>
              <button className="rounded p-1 faint hover:text-[var(--ink)]" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
