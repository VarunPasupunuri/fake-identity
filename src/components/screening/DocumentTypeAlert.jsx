/**
 * Preflight document-type result shown under the captured/uploaded document.
 * A mismatch blocks the screening and offers the two ways out; a match or an
 * uncertain result is informational and never stops the officer.
 */
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw, Upload, ListFilter } from 'lucide-react';
import { PREFLIGHT } from '../../modules/documents/preflight.js';
import { cx } from '../../lib/format.js';

const TONE = {
  [PREFLIGHT.MATCH]: { cls: 'border-[var(--ok)] bg-[var(--ok-soft)]', icon: CheckCircle2, iconCls: 'status-ok' },
  [PREFLIGHT.MISMATCH]: { cls: 'border-[var(--danger)] bg-[var(--danger-soft)]', icon: AlertTriangle, iconCls: 'status-danger' },
  [PREFLIGHT.UNCERTAIN]: { cls: 'border-[var(--warn)] bg-[var(--warn-soft)]', icon: HelpCircle, iconCls: 'status-warn' },
  [PREFLIGHT.UNAVAILABLE]: { cls: 'divider', icon: HelpCircle, iconCls: 'status-neutral' },
};

export default function DocumentTypeAlert({ state, result, onChangeType, onReplace, replaceLabel = 'Upload another document' }) {
  if (state === 'checking') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-sm hairline px-3 py-2.5 t-body-sm" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin faint" aria-hidden="true" />
        Checking document type…
      </div>
    );
  }
  if (!result) return null;
  const tone = TONE[result.status] || TONE[PREFLIGHT.UNAVAILABLE];
  const Icon = tone.icon;
  const mismatch = result.status === PREFLIGHT.MISMATCH;
  return (
    <section className={cx('mt-3 rounded-sm border p-4', tone.cls)} role={mismatch ? 'alert' : 'status'} aria-live="polite">
      <div className="flex items-start gap-3">
        <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', tone.iconCls)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="t-h3">{result.title}</h3>

          {(result.selectedLabel || result.detectedLabel) && (
            <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {result.selectedType && (
                <div>
                  <dt className="t-label">Selected document</dt>
                  <dd className="t-body font-medium">{result.selectedLabel}</dd>
                </div>
              )}
              {result.detectedLabel && (
                <div>
                  <dt className="t-label">Detected document</dt>
                  <dd className="t-body font-medium">{result.detectedLabel}<span className="ml-2 t-caption tabular muted">{Math.round((result.confidence || 0) * 100)}% confidence</span></dd>
                </div>
              )}
            </dl>
          )}

          <p className="mt-3 t-body-sm">{result.message}</p>

          {result.signals?.length > 0 && (
            <p className="mt-2 t-caption muted">Detected from {result.signals.slice(0, 3).map((s) => s.label).join(', ')}.</p>
          )}

          {mismatch && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary" onClick={onChangeType}><ListFilter className="h-4 w-4" aria-hidden="true" />Change document type</button>
              <button type="button" className="btn-secondary" onClick={onReplace}><Upload className="h-4 w-4" aria-hidden="true" />{replaceLabel}</button>
            </div>
          )}
          {result.status === PREFLIGHT.UNCERTAIN && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-secondary" onClick={onReplace}><RefreshCw className="h-4 w-4" aria-hidden="true" />{replaceLabel}</button>
              <button type="button" className="btn-ghost" onClick={onChangeType}>Change document type</button>
            </div>
          )}

          <p className="mt-3 t-caption faint">Document type detection uses text and layout clues only. It is not an authenticity check.</p>
        </div>
      </div>
    </section>
  );
}
