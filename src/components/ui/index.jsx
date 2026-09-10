import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Loader2 } from 'lucide-react';
import { cx, RISK_STYLES, DECISION_STYLES } from '../../lib/format.js';

export function Card({ className, children, title, subtitle, actions }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Badge({ tone = 'slate', className, children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-brand-100 text-brand-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  };
  return <span className={cx('badge', tones[tone], className)}>{children}</span>;
}

export function RiskBadge({ level, score }) {
  const s = RISK_STYLES[level] || RISK_STYLES.low;
  return <span className={cx('badge', s.badge)}>{s.label}{typeof score === 'number' && <span className="opacity-70">· {score}</span>}</span>;
}

export function DecisionBadge({ decision }) {
  const labels = { accept: 'Accepted', flag: 'Flagged', reject: 'Rejected', pending: 'Pending' };
  const key = decision || 'pending';
  return <span className={cx('badge', DECISION_STYLES[key])}>{labels[key]}</span>;
}

export function StatusIcon({ status, className = 'h-5 w-5' }) {
  if (status === 'pass' || status === 'done') return <CheckCircle2 className={cx(className, 'text-emerald-600')} />;
  if (status === 'fail' || status === 'error') return <XCircle className={cx(className, 'text-red-600')} />;
  if (status === 'warn') return <AlertTriangle className={cx(className, 'text-amber-600')} />;
  if (status === 'running') return <Loader2 className={cx(className, 'animate-spin text-brand-600')} />;
  return <MinusCircle className={cx(className, 'text-slate-300')} />;
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={cx(className, 'animate-spin text-brand-600')} />;
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-slate-300" />}
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold tabular-nums', tone || 'text-slate-900')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'bg-brand-600' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cx('h-full rounded-full transition-all duration-300', tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Circular gauge for the risk score. */
export function RiskGauge({ score, level, size = 148 }) {
  const s = RISK_STYLES[level] || RISK_STYLES.low;
  const r = 60, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} className="fill-none stroke-slate-100" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} className={cx('fill-none transition-all duration-700', s.ring)} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cx('text-3xl font-bold tabular-nums', s.text)}>{Math.round(pct)}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">risk score</span>
      </div>
    </div>
  );
}

/** Draws normalised boxes over an image (tamper regions, face boxes). */
export function AnnotatedImage({ src, boxes = [], alt = '', className }) {
  const tones = { high: 'border-red-500 bg-red-500/15', medium: 'border-amber-500 bg-amber-500/15', low: 'border-yellow-400 bg-yellow-400/10', face: 'border-brand-500 bg-brand-500/10' };
  return (
    <div className={cx('relative inline-block max-w-full overflow-hidden rounded-lg bg-slate-900', className)}>
      <img src={src} alt={alt} className="block max-h-[420px] w-auto max-w-full object-contain" />
      {boxes.map((b, i) => (
        <div key={i} className={cx('absolute rounded border-2', tones[b.tone] || tones.medium)} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} title={b.label}>
          {b.label && <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">{b.label}</span>}
        </div>
      ))}
    </div>
  );
}
