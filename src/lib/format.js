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
  low: { badge: 'badge-ok', ring: 'stroke-[var(--ok)]', text: 'text-[var(--ok)]', bg: 'bg-[var(--ok-soft)]', border: 'border-[color-mix(in_oklab,var(--ok)_40%,var(--border))]', label: 'Low risk', solid: 'bg-[var(--ok)]' },
  medium: { badge: 'badge-warn', ring: 'stroke-[var(--warn)]', text: 'text-[var(--warn)]', bg: 'bg-[var(--warn-soft)]', border: 'border-[color-mix(in_oklab,var(--warn)_40%,var(--border))]', label: 'Medium risk', solid: 'bg-[var(--warn)]' },
  high: { badge: 'badge-danger', ring: 'stroke-[var(--danger)]', text: 'text-[var(--danger)]', bg: 'bg-[var(--danger-soft)]', border: 'border-[color-mix(in_oklab,var(--danger)_40%,var(--border))]', label: 'High risk', solid: 'bg-[var(--danger)]' },
};

export const DECISION_STYLES = {
  accept: 'badge-ok',
  flag: 'badge-warn',
  reject: 'badge-danger',
  pending: 'badge-neutral',
};

export const STATUS_STYLES = { pass: 'status-ok', fail: 'status-danger', warn: 'status-warn', skip: 'status-neutral' };

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
