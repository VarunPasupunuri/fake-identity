import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Loader2, X, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cx, RISK_STYLES, DECISION_STYLES } from '../../lib/format.js';

export function Card({ className, children, title, subtitle, actions, icon: Icon, padded = true, id }) {
  return (
    <section id={id} className={cx('card overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b divider px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Icon className="h-4 w-4" /></span>}
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
              {subtitle && <p className="truncate text-xs muted">{subtitle}</p>}
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
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-in">
      <div className="min-w-0">
        {crumbs && (
          <nav className="mb-1 flex items-center gap-1 text-xs muted">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.to ? <Link to={c.to} className="hover:text-[var(--ink)]">{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200',
  blue: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
};

export function Badge({ tone = 'slate', className, children, dot }) {
  return <span className={cx('badge', BADGE_TONES[tone], className)}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}</span>;
}

export function RiskBadge({ level, score }) {
  const s = RISK_STYLES[level] || RISK_STYLES.low;
  return <span className={cx('badge', s.badge)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{s.label}{typeof score === 'number' && <span className="opacity-70">· {score}</span>}</span>;
}

export function DecisionBadge({ decision }) {
  const labels = { accept: 'Accepted', flag: 'Flagged', reject: 'Rejected', pending: 'Pending' };
  const key = decision || 'pending';
  return <span className={cx('badge', DECISION_STYLES[key])}>{labels[key]}</span>;
}

export function StatusIcon({ status, className = 'h-5 w-5' }) {
  if (status === 'pass' || status === 'done') return <CheckCircle2 className={cx(className, 'text-emerald-500')} />;
  if (status === 'fail' || status === 'error') return <XCircle className={cx(className, 'text-red-500')} />;
  if (status === 'warn') return <AlertTriangle className={cx(className, 'text-amber-500')} />;
  if (status === 'running') return <Loader2 className={cx(className, 'animate-spin text-brand-500')} />;
  return <MinusCircle className={cx(className, 'text-[var(--ink-3)]')} />;
}

export function Spinner({ className = 'h-5 w-5' }) { return <Loader2 className={cx(className, 'animate-spin text-brand-500')} />; }

export function Skeleton({ className }) { return <div className={cx('skeleton', className)} />; }

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed divider px-6 py-14 text-center animate-fade-in">
      {Icon && <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)]"><Icon className="h-7 w-7 faint" /></span>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** KPI tile: label, hero value, optional delta + sparkline. */
export function Stat({ label, value, hint, tone, delta, spark, icon: Icon, loading }) {
  return (
    <div className="card p-4 sm:p-5 animate-slide-up">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider faint">{label}</p>
        {Icon && <Icon className="h-4 w-4 faint" />}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className={cx('mt-1 text-3xl font-bold', tone)}>{value}</p>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs muted">{delta && <span className={cx('mr-1 font-semibold', delta.startsWith('-') ? 'text-emerald-600' : delta.startsWith('+') ? 'text-amber-600' : '')}>{delta}</span>}{hint}</p>
        {spark}
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'bg-brand-500', className }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--border)]', className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function RiskGauge({ score, level, size = 156 }) {
  const s = RISK_STYLES[level] || RISK_STYLES.low;
  const r = 60, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} className="fill-none stroke-[var(--surface-2)]" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} className={cx('fill-none transition-all duration-1000 ease-out', s.ring)} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cx('text-4xl font-bold leading-none', s.text)}>{Math.round(pct)}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider faint">risk score</span>
      </div>
    </div>
  );
}

export function AnnotatedImage({ src, boxes = [], alt = '', className, maxH = 'max-h-[420px]' }) {
  const tones = { high: 'border-red-500 bg-red-500/15', medium: 'border-amber-500 bg-amber-500/15', low: 'border-yellow-400 bg-yellow-400/10', face: 'border-brand-400 bg-brand-400/10' };
  return (
    <div className={cx('relative inline-block max-w-full overflow-hidden rounded-xl bg-slate-950', className)}>
      <img src={src} alt={alt} className={cx('block w-auto max-w-full object-contain', maxH)} />
      {boxes.map((b, i) => (
        <div key={i} className={cx('absolute rounded border-2', tones[b.tone] || tones.medium)} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} title={b.label}>
          {b.label && <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">{b.label}</span>}
        </div>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto rounded-xl bg-[var(--surface-2)] p-1 ring-1 ring-inset ring-[var(--border)]', className)}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cx('flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition', value === t.value ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'muted hover:text-[var(--ink)]')}>
          {t.icon && <t.icon className="h-3.5 w-3.5" />}{t.label}{t.count != null && <span className="rounded-full bg-[var(--surface-2)] px-1.5 text-[10px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex rounded-xl bg-[var(--surface-2)] p-1 ring-1 ring-inset ring-[var(--border)]">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cx('rounded-lg font-semibold transition', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm', value === o.value ? 'bg-[var(--surface)] shadow-sm' : 'muted hover:text-[var(--ink)]')}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-[var(--border)]')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className={cx('absolute flex flex-col bg-[var(--surface)] shadow-2xl animate-slide-up', side === 'bottom' ? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl' : 'inset-y-0 right-0 w-full max-w-md')}>
        <header className="flex items-center justify-between border-b divider px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3><button className="btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Kbd({ children }) { return <kbd className="kbd">{children}</kbd>; }

export function Avatar({ name = '', size = 'md' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-sm';
  return <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white', sz)}>{initials}</span>;
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
