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
  low: { badge: 'bg-emerald-100 text-emerald-800', ring: 'stroke-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Low risk' },
  medium: { badge: 'bg-amber-100 text-amber-800', ring: 'stroke-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Medium risk' },
  high: { badge: 'bg-red-100 text-red-800', ring: 'stroke-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'High risk' },
};

export const DECISION_STYLES = {
  accept: 'bg-emerald-100 text-emerald-800',
  flag: 'bg-amber-100 text-amber-800',
  reject: 'bg-red-100 text-red-800',
  pending: 'bg-slate-100 text-slate-600',
};

export const STATUS_STYLES = {
  pass: 'text-emerald-600',
  fail: 'text-red-600',
  warn: 'text-amber-600',
  skip: 'text-slate-400',
};
