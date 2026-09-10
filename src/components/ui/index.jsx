/**
 * Identity Sentinel UI kit. Every primitive reads the design tokens in
 * src/index.css; nothing here carries raw colour values. Exported names and
 * props are stable so pages restyle without changing.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Loader2, X, ChevronRight, Info, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cx, RISK_STYLES, DECISION_STYLES } from '../../lib/format.js';

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

/** Bordered panel. `icon` renders monochrome inline with the title (no tinted circle). */
export function Card({ className, children, title, subtitle, actions, icon: Icon, padded = true, id }) {
  return (
    <section id={id} className={cx('card overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b divider px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 faint" aria-hidden="true" />}
            <div className="min-w-0">
              {title && <h2 className="t-h3 truncate">{title}</h2>}
              {subtitle && <p className="t-caption truncate">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b divider pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav className="mb-2 flex items-center gap-1 t-caption" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.to ? <Link to={c.to} className="hover:text-[var(--ink)]">{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="t-h1 truncate">{title}</h1>
        {subtitle && <p className="mt-1 t-body-sm muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Status & badges ──────────────────────────────────────────────────────── */

const BADGE_TONES = {
  slate: 'badge-neutral',
  neutral: 'badge-neutral',
  blue: 'badge-brand',
  brand: 'badge-brand',
  green: 'badge-ok',
  ok: 'badge-ok',
  amber: 'badge-warn',
  warn: 'badge-warn',
  red: 'badge-danger',
  danger: 'badge-danger',
  info: 'badge-info',
  outline: 'badge-outline',
  dashed: 'badge-dashed',
};

export function Badge({ tone = 'neutral', className, children, dot }) {
  return <span className={cx('badge', BADGE_TONES[tone] || BADGE_TONES.neutral, className)}>{dot && <span className="status-dot" aria-hidden="true" />}{children}</span>;
}

export function RiskBadge({ level, score }) {
  const s = RISK_STYLES[level] || RISK_STYLES.low;
  return <span className={cx('badge', s.badge)}><span className="status-dot" aria-hidden="true" />{s.label}{typeof score === 'number' && <span className="tabular opacity-80">· {score}</span>}</span>;
}

export function DecisionBadge({ decision }) {
  const labels = { accept: 'Accepted', flag: 'Flagged', reject: 'Rejected', pending: 'Pending' };
  const key = decision || 'pending';
  return <span className={cx('badge', DECISION_STYLES[key] || DECISION_STYLES.pending)}>{labels[key]}</span>;
}

const AI_DECISION = {
  approve: { label: 'Approve', cls: 'badge-ok' },
  review: { label: 'Review', cls: 'badge-warn' },
  reject: { label: 'Reject', cls: 'badge-danger' },
  insufficient_evidence: { label: 'Insufficient evidence', cls: 'badge-dashed' },
};

/** Four-way system-assessment chip (distinct from the officer DecisionBadge). */
export function AiDecisionBadge({ decision, prefix }) {
  const d = AI_DECISION[decision];
  if (!d) return <span className="badge badge-neutral">{prefix ? `${prefix} ` : ''}Not assessed</span>;
  return <span className={cx('badge', d.cls)}>{prefix ? `${prefix} ` : ''}{d.label}</span>;
}

const STATUS_ICON = {
  pass: [CheckCircle2, 'status-ok'],
  done: [CheckCircle2, 'status-ok'],
  fail: [XCircle, 'status-danger'],
  error: [XCircle, 'status-danger'],
  warn: [AlertTriangle, 'status-warn'],
  info: [Info, 'status-info'],
  unavailable: [HelpCircle, 'status-neutral'],
};

export function StatusIcon({ status, className = 'h-5 w-5' }) {
  if (status === 'running') return <Loader2 className={cx(className, 'animate-spin status-info')} aria-hidden="true" />;
  const [Icon, tone] = STATUS_ICON[status] || [MinusCircle, 'status-neutral'];
  return <Icon className={cx(className, tone)} aria-hidden="true" />;
}

/** Icon + label pairing so a status never relies on colour alone. */
export function StatusText({ status, children, className }) {
  return <span className={cx('inline-flex items-center gap-1.5 t-body-sm', className)}><StatusIcon status={status} className="h-4 w-4" />{children}</span>;
}

export function Spinner({ className = 'h-5 w-5' }) { return <Loader2 className={cx(className, 'animate-spin status-info')} aria-label="Loading" role="status" />; }

/* ── Loading, empty, error states ─────────────────────────────────────────── */

export function Skeleton({ className }) { return <div className={cx('skeleton', className)} aria-hidden="true" />; }

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="empty">
      {Icon && <Icon className="mb-3 h-6 w-6 faint" aria-hidden="true" />}
      <h3 className="t-h3 text-[var(--ink)]">{title}</h3>
      {body && <p className="mt-1 max-w-sm t-body-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const ALERT = {
  info: ['alert-info', Info, 'status-info'],
  warn: ['alert-warn', AlertTriangle, 'status-warn'],
  danger: ['alert-danger', XCircle, 'status-danger'],
  error: ['alert-danger', XCircle, 'status-danger'],
  ok: ['alert-ok', CheckCircle2, 'status-ok'],
};

/** Inline alert for information, warnings and errors. */
export function Alert({ tone = 'info', title, children, action, className }) {
  const [cls, Icon, iconTone] = ALERT[tone] || ALERT.info;
  return (
    <div role={tone === 'danger' || tone === 'error' ? 'alert' : 'status'} className={cx('alert', cls, className)}>
      <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', iconTone)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-[var(--ink)]">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'muted')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Full-width error state for a failed load. */
export function ErrorState({ title = 'Something went wrong', body, retry }) {
  return (
    <div className="empty" role="alert">
      <XCircle className="mb-3 h-6 w-6 status-danger" aria-hidden="true" />
      <h3 className="t-h3 text-[var(--ink)]">{title}</h3>
      {body && <p className="mt-1 max-w-sm t-body-sm">{body}</p>}
      {retry && <button type="button" className="btn-secondary btn-sm mt-5" onClick={retry}>Try again</button>}
    </div>
  );
}

/* ── Metrics & progress ───────────────────────────────────────────────────── */

/** KPI tile: label, numeric value, optional delta + sparkline. */
export function Stat({ label, value, hint, tone, delta, spark, icon: Icon, loading }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="t-label">{label}</p>
        {Icon && <Icon className="h-4 w-4 faint" aria-hidden="true" />}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className={cx('mt-1 t-num', tone)}>{value}</p>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="t-caption">{delta && <span className={cx('mr-1 font-medium', delta.startsWith('-') ? 'status-ok' : delta.startsWith('+') ? 'status-warn' : '')}>{delta}</span>}{hint}</p>
        {spark}
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'bg-[var(--brand)]', className }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-xs bg-[var(--surface-2)]', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-xs transition-[width] duration-300', tone)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function RiskGauge({ score, level, size = 156 }) {
  const s = RISK_STYLES[level] || RISK_STYLES.low;
  const r = 60, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Risk score ${Math.round(pct)} out of 100, ${s.label.toLowerCase()}`}>
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="70" cy="70" r={r} className="fill-none stroke-[var(--surface-2)]" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} className={cx('fill-none transition-all duration-500 ease-out', s.ring)} strokeWidth="10" strokeLinecap="butt" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cx('t-num text-[2.25rem] leading-none', s.text)}>{Math.round(pct)}</span>
        <span className="mt-1 t-label">risk score</span>
      </div>
    </div>
  );
}

/** Neutral score ring (e.g. analysis confidence) — same geometry as RiskGauge, caller picks the tone. */
export function ScoreRing({ value, label, size = 132, tone = 'stroke-[var(--brand)]', textTone = 'text-[var(--brand)]' }) {
  const r = 60, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label} ${Math.round(pct)} out of 100`}>
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="70" cy="70" r={r} className="fill-none stroke-[var(--surface-2)]" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} className={cx('fill-none transition-all duration-500 ease-out', tone)} strokeWidth="10" strokeLinecap="butt" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cx('t-num text-[2.25rem] leading-none', textTone)}>{Math.round(pct)}</span>
        <span className="mt-1 t-label">{label}</span>
      </div>
    </div>
  );
}

/* ── Media ────────────────────────────────────────────────────────────────── */

export function AnnotatedImage({ src, boxes = [], alt = '', className, maxH = 'max-h-[420px]' }) {
  const tones = { high: 'border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger)_15%,transparent)]', medium: 'border-[var(--warn)] bg-[color-mix(in_oklab,var(--warn)_15%,transparent)]', low: 'border-[var(--warn)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)]', face: 'border-[var(--info)] bg-[color-mix(in_oklab,var(--info)_10%,transparent)]' };
  return (
    <div className={cx('relative inline-block max-w-full overflow-hidden rounded-md bg-[var(--surface-2)] hairline', className)}>
      <img src={src} alt={alt} className={cx('block w-auto max-w-full object-contain', maxH)} />
      {boxes.map((b, i) => (
        <div key={i} className={cx('absolute rounded-xs border-2', tones[b.tone] || tones.medium)} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} title={b.label}>
          {b.label && <span className="absolute -top-5 left-0 whitespace-nowrap rounded-xs bg-[var(--ink)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--bg)]">{b.label}</span>}
        </div>
      ))}
    </div>
  );
}

/* ── Navigation controls ──────────────────────────────────────────────────── */

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b divider', className)}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px flex min-h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors', value === t.value ? 'border-[var(--brand)] text-[var(--ink)]' : 'border-transparent muted hover:text-[var(--ink)]')}>
          {t.icon && <t.icon className="h-4 w-4" aria-hidden="true" />}{t.label}{t.count != null && <span className="badge badge-neutral tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border-strong)] bg-[var(--surface)] p-0.5" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cx('rounded-sm font-medium transition-colors', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm', value === o.value ? 'bg-[var(--brand)] text-[var(--on-brand)]' : 'muted hover:text-[var(--ink)]')}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block t-caption">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative h-5 w-9 shrink-0 rounded-full border transition-colors', checked ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-[var(--border-strong)] bg-[var(--surface-2)]')}>
        <span className={cx('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-[left] duration-150', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Sheet({ open, onClose, title, children, side = 'right' }) {
  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[rgba(17,19,22,0.45)] animate-fade-in" onClick={onClose} />
      <div className={cx('absolute flex flex-col overlay animate-slide-up', side === 'bottom' ? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-b-none' : 'inset-y-0 right-0 w-full max-w-md rounded-none')}>
        <header className="flex items-center justify-between border-b divider px-4 py-3"><h3 className="t-h3">{title}</h3><button className="btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** CSS tooltip wrapper: <Tooltip text="…"><button…/></Tooltip> */
export function Tooltip({ text, below = false, className, children }) {
  return <span className={cx('tip inline-flex', below && 'tip-below', className)} data-tip={text}>{children}</span>;
}

export function Kbd({ children }) { return <kbd className="kbd">{children}</kbd>; }

export function Avatar({ name = '', size = 'md' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-sm';
  return <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] font-medium text-[var(--ink-2)]', sz)} aria-hidden="true">{initials}</span>;
}

/* ── Tables ───────────────────────────────────────────────────────────────── */

/** Scroll container + table classes. Children are <thead>/<tbody>. */
export function Table({ compact = false, minWidth = 640, className, children }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('table', compact && 'table-compact', className)} style={{ minWidth }}>{children}</table>
    </div>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
