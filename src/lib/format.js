export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const cx = (...a) => a.filter(Boolean).join(' ');

export const RISK_STYLES = {
  low: { badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300', ring: 'stroke-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/5', border: 'border-emerald-200 dark:border-emerald-500/30', label: 'Low risk', solid: 'bg-emerald-500' },
  medium: { badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', ring: 'stroke-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/5', border: 'border-amber-200 dark:border-amber-500/30', label: 'Medium risk', solid: 'bg-amber-500' },
  high: { badge: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300', ring: 'stroke-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/5', border: 'border-red-200 dark:border-red-500/30', label: 'High risk', solid: 'bg-red-500' },
};

export const DECISION_STYLES = {
  accept: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  flag: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  reject: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
};

export const STATUS_STYLES = { pass: 'text-emerald-600', fail: 'text-red-600', warn: 'text-amber-600', skip: 'text-slate-400' };

/** Group rows by day for the last `days` days → [{ label, iso, rows }] oldest first. */
export function lastNDays(rows, days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ iso, label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }), rows: rows.filter((r) => (r.createdAt || '').slice(0, 10) === iso) });
  }
  return out;
}
