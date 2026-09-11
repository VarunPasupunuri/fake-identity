import { useEffect, useRef, useState } from 'react';
import { STEP_IDS, STEP_META } from '../../hooks/useScreeningPipeline.js';
import { StatusIcon, ProgressBar } from '../ui/index.jsx';
import { cx } from '../../lib/format.js';

export default function ProcessingSteps({ steps, providers, documentImage }) {
  const [log, setLog] = useState([]);
  const seen = useRef({});
  useEffect(() => {
    const entries = [];
    for (const id of STEP_IDS) {
      const s = steps[id];
      const key = `${id}:${s.status}:${s.message}`;
      if (s.status !== 'pending' && !seen.current[key]) { seen.current[key] = true; entries.push({ t: new Date(), id, text: `${STEP_META[id].label}: ${s.status === 'done' ? `complete in ${((s.durationMs || 0) / 1000).toFixed(1)} s` : s.status === 'error' ? `failed — ${s.error}` : s.message || s.status}` }); }
    }
    if (entries.length) setLog((l) => [...l, ...entries].slice(-40));
  }, [steps]);

  const done = STEP_IDS.filter((id) => ['done', 'error', 'skipped'].includes(steps[id].status)).length;
  const overall = Math.round((STEP_IDS.reduce((s, id) => s + (steps[id].progress || 0), 0) / (STEP_IDS.length * 100)) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-4 flex items-center justify-between t-body-sm"><p className="font-medium">Running {done}/{STEP_IDS.length} verification stages</p><p className="tabular muted">{overall}%</p></div>
        <ProgressBar value={overall} />
        <ol className="mt-4 divide-y divider hairline rounded-md">
          {STEP_IDS.map((id) => {
            const s = steps[id];
            const meta = STEP_META[id];
            return (
              <li key={id} className={cx('flex items-start gap-3 px-4 py-3', s.status === 'running' && 'bg-[var(--surface-2)]')}>
                <StatusIcon status={s.status} className="mt-0.5 h-4.5 w-4.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3"><p className="text-sm font-medium">{meta.label}</p><p className="t-caption tabular">{s.status === 'done' && s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)} s` : s.status === 'running' ? `${s.progress}%` : s.status === 'error' ? 'Failed' : s.status === 'skipped' ? 'Skipped' : 'Queued'}</p></div>
                  <p className="t-caption">{s.status === 'running' && s.message ? s.message : s.status === 'error' ? s.error : s.status === 'skipped' ? s.message : meta.description}</p>
                  {s.status === 'running' && <ProgressBar value={s.progress} className="mt-2" />}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <aside className="space-y-4 lg:border-l lg:divider lg:pl-6">
        {documentImage && <img src={documentImage} alt="Document under verification" className="w-full rounded-sm hairline object-contain" />}
        <div>
          <p className="t-label mb-1">Providers</p>
          <dl className="t-body-sm">
            {[['Extraction', providers?.ocr], ['Integrity', providers?.tamper], ['QR / barcode', providers?.barcode], ['Face', providers?.face], ['Watchlist', providers?.watchlist], ['Issuer', providers?.issuer]].map(([k, v]) => <div key={k} className="flex justify-between py-0.5"><dt className="muted">{k}</dt><dd className="t-code">{v || '—'}</dd></div>)}
          </dl>
        </div>
        <div>
          <p className="t-label mb-1">Activity</p>
          <div className="max-h-52 overflow-y-auto rounded-sm bg-[var(--surface-2)] p-2 t-code muted" aria-live="polite">
            {log.length === 0 ? <p>Starting…</p> : log.map((l, i) => <p key={i}><span className="faint">{l.t.toLocaleTimeString([], { hour12: false })}</span> {l.text}</p>)}
          </div>
        </div>
      </aside>
    </div>
  );
}
