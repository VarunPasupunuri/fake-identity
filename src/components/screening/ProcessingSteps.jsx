import { useEffect, useRef, useState } from 'react';
import { ScanText, ListChecks, ShieldAlert, ScanFace, ScanSearch, Gauge } from 'lucide-react';
import { STEP_IDS, STEP_META } from '../../hooks/useScreeningPipeline.js';
import { StatusIcon, ProgressBar } from '../ui/index.jsx';
import { cx } from '../../lib/format.js';

const ICONS = { ocr: ScanText, validation: ListChecks, tampering: ShieldAlert, face: ScanFace, watchlist: ScanSearch, risk: Gauge };

export default function ProcessingSteps({ steps, providers, documentImage }) {
  const [log, setLog] = useState([]);
  const seen = useRef({});
  useEffect(() => {
    const entries = [];
    for (const id of STEP_IDS) {
      const s = steps[id];
      const key = `${id}:${s.status}:${s.message}`;
      if (s.status !== 'pending' && !seen.current[key]) { seen.current[key] = true; entries.push({ t: new Date(), id, text: `${STEP_META[id].label}: ${s.status === 'done' ? `complete in ${((s.durationMs || 0) / 1000).toFixed(1)}s` : s.status === 'error' ? `failed — ${s.error}` : s.message || s.status}` }); }
    }
    if (entries.length) setLog((l) => [...l, ...entries].slice(-40));
  }, [steps]);

  const done = STEP_IDS.filter((id) => ['done', 'error', 'skipped'].includes(steps[id].status)).length;
  const overall = Math.round((STEP_IDS.reduce((s, id) => s + (steps[id].progress || 0), 0) / (STEP_IDS.length * 100)) * 100);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm"><p className="font-semibold">Running {done}/{STEP_IDS.length} modules</p><p className="muted">{overall}%</p></div>
          <ProgressBar value={overall} className="mt-2" />
        </div>
        <ol className="relative space-y-3">
          {STEP_IDS.map((id, i) => {
            const s = steps[id];
            const meta = STEP_META[id];
            const Icon = ICONS[id];
            return (
              <li key={id} className={cx('card p-4 transition animate-slide-up', s.status === 'running' && 'ring-2 ring-brand-500/30')} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start gap-3">
                  <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.status === 'done' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15' : s.status === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-500/15' : s.status === 'running' ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15' : 'bg-[var(--surface-2)] faint')}><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-semibold">{meta.label}</p>
                      <p className="flex items-center gap-1.5 text-xs muted"><StatusIcon status={s.status} className="h-4 w-4" />{s.status === 'done' && s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : s.status === 'running' ? `${s.progress}%` : s.status === 'error' ? 'Failed' : s.status === 'skipped' ? 'Skipped' : 'Queued'}</p>
                    </div>
                    <p className="text-xs muted">{s.status === 'running' && s.message ? s.message : s.status === 'error' ? s.error : s.status === 'skipped' ? s.message : meta.description}</p>
                    {(s.status === 'running' || s.status === 'done') && <ProgressBar value={s.progress} tone={s.status === 'done' ? 'bg-emerald-500' : 'bg-brand-500'} className="mt-2" />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <aside className="space-y-3">
        {documentImage && (
          <div className="relative overflow-hidden rounded-2xl border divider bg-slate-950">
            <img src={documentImage} alt="Document" className="w-full object-contain opacity-90" />
            <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_12px_2px_rgba(59,102,240,0.7)] animate-scan" />
          </div>
        )}
        <div className="surface p-4 text-xs">
          <p className="mb-2 text-sm font-semibold">Active providers</p>
          <dl className="space-y-1 muted">
            <div className="flex justify-between"><dt>OCR</dt><dd className="font-mono text-[var(--ink)]">{providers?.ocr}</dd></div>
            <div className="flex justify-between"><dt>Tampering</dt><dd className="font-mono text-[var(--ink)]">{providers?.tamper}</dd></div>
            <div className="flex justify-between"><dt>Face</dt><dd className="font-mono text-[var(--ink)]">{providers?.face}</dd></div>
          </dl>
        </div>
        <div className="surface max-h-56 overflow-y-auto p-3 font-mono text-[11px] leading-5 muted">
          {log.length === 0 ? <p>Waiting for first module…</p> : log.map((l, i) => <p key={i}><span className="faint">{l.t.toLocaleTimeString([], { hour12: false })}</span> {l.text}</p>)}
        </div>
      </aside>
    </div>
  );
}
