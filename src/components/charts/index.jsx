/**
 * Small dependency-free SVG charts following the dataviz method:
 * one axis, thin marks with rounded data-ends, recessive grid, hover tooltip,
 * legend for >= 2 series, status colours always paired with a label.
 */
import { useId, useState } from 'react';
import { cx } from '../../lib/format.js';

export const VIZ = {
  blue: 'var(--viz-blue)',
  good: '#0ca30c',
  warn: '#fab219',
  crit: '#d03b3b',
  muted: 'var(--ink-3)',
};

export function Sparkline({ values = [], width = 88, height = 28, color = VIZ.blue }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values), min = 0;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (width - 4) + 2, height - 2 - ((v - min) / (max - min || 1)) * (height - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

/**
 * Vertical bars, single series or stacked status series.
 * data: [{ label, values: { key: n } }]  series: [{ key, label, color }]
 */
export function BarChart({ data, series, height = 180, unit = '', showTable = false }) {
  const id = useId();
  const [hover, setHover] = useState(null);
  const totals = data.map((d) => series.reduce((s, k) => s + (d.values[k.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const W = 640, H = height, padB = 26, padT = 16, padL = 28;
  const plotW = W - padL, plotH = H - padB - padT;
  const slot = plotW / data.length;
  const bw = Math.min(48, slot * 0.62);
  const ticks = niceTicks(max, 3);
  const labelEvery = data.length > 10 ? 2 : 1;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{series.map((s) => s.label).join(', ')} by {data.map((d) => d.label).join(', ')}</title>
        {ticks.map((t) => { const y = padT + plotH - (t / max) * plotH; return <g key={t}><line x1={padL} x2={W} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth="1" /><text x={padL - 6} y={y + 4} fontSize="11" textAnchor="end" fill="var(--ink-3)">{t}{unit}</text></g>; })}
        <line x1={padL} x2={W} y1={padT + plotH} y2={padT + plotH} stroke="var(--ink-3)" strokeWidth="1" />
        {data.map((d, i) => {
          const x = padL + slot * i + (slot - bw) / 2;
          let acc = 0;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
              {series.map((s, si) => {
                const v = d.values[s.key] || 0;
                if (!v) return null;
                const h = (v / max) * plotH;
                const y = padT + plotH - acc - h;
                acc += h;
                const isTop = series.slice(si + 1).every((ss) => !d.values[ss.key]);
                const gap = si ? 2 : 0;
                return <rect key={s.key} x={x} y={y} width={bw} height={Math.max(1, h - gap)} rx={isTop ? 4 : 0} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: 'opacity .15s' }} />;
              })}
              {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--ink-2)">{d.label}</text>}
              {totals[i] > 0 && (hover === i || data.length <= 8) && <text x={x + bw / 2} y={padT + plotH - (totals[i] / max) * plotH - 5} fontSize="11" textAnchor="middle" fontWeight="600" fill="var(--ink)">{totals[i]}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border divider bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-md">
          <p className="font-semibold">{data[hover].label}</p>
          {series.map((s) => <p key={s.key} className="flex items-center gap-1.5 muted"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}: <span className="font-semibold text-[var(--ink)]">{data[hover].values[s.key] || 0}{unit}</span></p>)}
        </div>
      )}
      {series.length > 1 && <Legend series={series} />}
      {showTable && <DataTable data={data} series={series} />}
    </div>
  );
}

export function Legend({ series }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs muted">
      {series.map((s) => <li key={s.key} className="flex items-center gap-1.5">{s.icon ? <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} /> : <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />}{s.label}</li>)}
    </ul>
  );
}

export function DataTable({ data, series }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer muted">View as table</summary>
      <table className="mt-1 w-full"><thead><tr className="text-left faint"><th className="py-1 font-medium">Label</th>{series.map((s) => <th key={s.key} className="py-1 font-medium">{s.label}</th>)}</tr></thead>
        <tbody>{data.map((d) => <tr key={d.label} className="border-t divider"><td className="py-1">{d.label}</td>{series.map((s) => <td key={s.key} className="py-1 tabular-nums">{d.values[s.key] || 0}</td>)}</tr>)}</tbody></table>
    </details>
  );
}

/** Donut for part-to-whole with <= 4 status slices; centre shows the total. */
export function Donut({ slices, size = 150, thickness = 16, centerLabel = 'total' }) {
  const [hover, setHover] = useState(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = 50 - thickness / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          {slices.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / total) * c;
            const el = <circle key={s.key} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - 1.5)} ${c - Math.max(0, len - 1.5)}`} strokeDashoffset={-offset} opacity={hover === null || hover === s.key ? 1 : 0.4} style={{ transition: 'opacity .15s, stroke-dashoffset .6s' }} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} />;
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{hover ? slices.find((s) => s.key === hover)?.value : total === 1 && slices.every((s) => !s.value) ? 0 : total}</span>
          <span className="text-[10px] uppercase tracking-wider faint">{hover ? slices.find((s) => s.key === hover)?.label : centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-36 flex-1 space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2" onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            {s.icon ? <s.icon className="h-4 w-4 shrink-0" style={{ color: s.color }} /> : <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />}
            <span className="flex-1 muted">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
            <span className="w-10 text-right text-xs faint tabular-nums">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal stacked bars per category (e.g. accepted vs flagged by document type). */
export function HBars({ rows, series, unit = '' }) {
  const max = Math.max(1, ...rows.map((r) => series.reduce((s, k) => s + (r.values[k.key] || 0), 0)));
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const total = series.reduce((s, k) => s + (r.values[k.key] || 0), 0);
          return (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-medium">{r.label}</span><span className="shrink-0 text-xs muted">{total}{unit}{r.note ? ` · ${r.note}` : ''}</span></div>
              <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--border)]">
                {series.map((s) => { const v = r.values[s.key] || 0; return v ? <div key={s.key} title={`${s.label}: ${v}`} style={{ width: `${(v / max) * 100}%`, background: s.color }} className="first:rounded-l-full last:rounded-r-full" /> : null; })}
              </div>
            </li>
          );
        })}
      </ul>
      {series.length > 1 && <Legend series={series} />}
    </div>
  );
}

function niceTicks(max, n) {
  const raw = max / n;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) || pow;
  const out = [];
  for (let v = step; v <= max; v += step) out.push(v);
  return out;
}

export { cx };
