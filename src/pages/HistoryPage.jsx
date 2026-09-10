import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { listScreenings } from '../services/screenings.js';
import { RiskBadge, DecisionBadge, EmptyState, Spinner } from '../components/ui/index.jsx';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { formatDateTime } from '../lib/format.js';

export function ScreeningTable({ rows, showOfficer = false }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5">Document</th>{showOfficer && <th className="px-4 py-2.5">Officer / checkpoint</th>}<th className="px-4 py-2.5">Risk</th><th className="px-4 py-2.5">Decision</th><th className="px-4 py-2.5">When</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5"><Link to={`/history/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.subjectName || 'Unknown'}</Link><p className="text-xs text-slate-500">{r.nationality || '—'}</p></td>
                <td className="px-4 py-2.5"><p>{DOCUMENT_TYPE_LABEL[r.documentType]}</p><p className="font-mono text-xs text-slate-500">{r.documentNumber || '—'}</p></td>
                {showOfficer && <td className="px-4 py-2.5"><p>{r.officerName}</p><p className="text-xs text-slate-500">{r.checkpoint}</p></td>}
                <td className="px-4 py-2.5"><RiskBadge level={r.risk?.level} score={r.risk?.score} /></td>
                <td className="px-4 py-2.5"><DecisionBadge decision={r.decision} /></td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDateTime(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function useScreeningFilters(rows) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [decision, setDecision] = useState('');
  const [level, setLevel] = useState('');
  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!type || r.documentType === type) &&
      (!decision || (decision === 'pending' ? !r.decision : r.decision === decision)) &&
      (!level || r.risk?.level === level) &&
      (!needle || [r.subjectName, r.documentNumber, r.officerName, r.checkpoint, r.nationality, r.id].some((v) => String(v || '').toLowerCase().includes(needle))),
    );
  }, [rows, q, type, decision, level]);
  const controls = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="relative col-span-2 sm:col-span-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search name, number, officer…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">All document types</option>{DOCUMENT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
      <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)}><option value="">All decisions</option><option value="accept">Accepted</option><option value="flag">Flagged</option><option value="reject">Rejected</option><option value="pending">Pending</option></select>
      <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All risk levels</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
    </div>
  );
  return { filtered, controls };
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => { listScreenings({ user, mine: true, max: 200 }).then(setRows).catch(() => setRows([])); }, [user]);
  const { filtered, controls } = useScreeningFilters(rows);

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold text-slate-900">Screening history</h1><p className="text-sm text-slate-500">Your digital trail — every screening with its module outputs and decision.</p></div>
      {controls}
      {!rows ? <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div> : filtered.length === 0 ? <EmptyState icon={History} title="No screenings match" body="Adjust the filters or run a new screening." /> : <ScreeningTable rows={filtered} />}
    </div>
  );
}
