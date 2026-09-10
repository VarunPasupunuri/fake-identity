import { STEP_IDS, STEP_META } from '../../hooks/useScreeningPipeline.js';
import { StatusIcon, ProgressBar } from '../ui/index.jsx';
import { cx } from '../../lib/format.js';

/** Step 3: live per-module progress. */
export default function ProcessingSteps({ steps, providers, documentImage }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <ol className="space-y-3">
        {STEP_IDS.map((id) => {
          const s = steps[id];
          const meta = STEP_META[id];
          return (
            <li key={id} className={cx('card p-4 transition', s.status === 'running' && 'ring-2 ring-brand-100')}>
              <div className="flex items-start gap-3">
                <StatusIcon status={s.status} className="mt-0.5 h-6 w-6" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                    <p className="text-xs text-slate-500">
                      {s.status === 'done' && s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : s.status === 'running' ? `${s.progress}%` : s.status === 'error' ? 'Failed' : s.status === 'skipped' ? 'Skipped' : 'Waiting'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">{s.status === 'running' && s.message ? s.message : s.status === 'error' ? s.error : s.status === 'skipped' ? s.message : meta.description}</p>
                  {(s.status === 'running' || s.status === 'done') && <div className="mt-2"><ProgressBar value={s.progress} tone={s.status === 'done' ? 'bg-emerald-500' : 'bg-brand-600'} /></div>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <aside className="space-y-3">
        {documentImage && <img src={documentImage} alt="Document" className="w-full rounded-xl border border-slate-200 object-contain" />}
        {providers && (
          <div className="card p-4 text-xs text-slate-600">
            <p className="mb-2 font-semibold text-slate-800">Active providers</p>
            <dl className="space-y-1">
              <div className="flex justify-between"><dt>OCR</dt><dd className="font-mono">{providers.ocr}</dd></div>
              <div className="flex justify-between"><dt>Tampering</dt><dd className="font-mono">{providers.tamper}</dd></div>
              <div className="flex justify-between"><dt>Face</dt><dd className="font-mono">{providers.face}</dd></div>
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}
