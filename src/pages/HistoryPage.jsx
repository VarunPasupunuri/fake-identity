import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, History, Download, LayoutList, LayoutGrid, ChevronLeft, ChevronRight, Files } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { listScreenings } from '../services/screenings.js';
import { RiskBadge, DecisionBadge, EmptyState, Skeleton, PageHeader, Segmented } from '../components/ui/index.jsx';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { formatDateTime, timeAgo, cx } from '../lib/format.js';
import { toCsv, downloadText } from '../lib/csv.js';
import { useDocumentThumbnails } from '../hooks/useScreeningImages.js';

const RANGES = [{ value: 'all', label: 'All time' }, { value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }];

export function ScreeningTable({ rows, showOfficer = false, compact = false }) {
  const pad = compact ? 'px-3 py-1.5' : 'px-4 py-2.5';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-[var(--surface-2)] text-left text-[11px] font-semibold uppercase tracking-wider faint">
          <tr><th className={pad}>Subject</th><th className={pad}>Document</th>{showOfficer && <th className={pad}>Officer / checkpoint</th>}<th className={pad}>Risk</th><th className={pad}>Decision</th><th className={pad}>When</th></tr>
        </thead>
        <tbody className="divide-y divider">
          {rows.map((r) => (
            <tr key={r.id} className="transition hover:bg-[var(--surface-2)]">
              <td className={pad}><Link to={`/history/${r.id}`} className="font-semibold text-brand-600 hover:underline dark:text-brand-300">{r.subjectName || 'Unknown'}</Link><p className="text-xs muted">{r.nationality || '—'}</p></td>
              <td className={pad}><p>{DOCUMENT_TYPE_LABEL[r.documentType]}</p><p className="font-mono text-xs muted">{r.documentNumber || '—'}</p></td>
              {showOfficer && <td className={pad}><p>{r.officerName}</p><p className="text-xs muted">{r.checkpoint}</p></td>}
              <td className={pad}><RiskBadge level={r.risk?.level} score={r.risk?.score} /></td>
              <td className={pad}><DecisionBadge decision={r.decision} /></td>
              <td className={cx(pad, 'text-xs muted whitespace-nowrap')} title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScreeningCards({ rows, showOfficer }) {
  const thumbs = useDocumentThumbnails(rows);
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => (
        <li key={r.id} className="animate-slide-up" style={{ animationDelay: `${i * 30}ms` }}>
          <Link to={`/history/${r.id}`} className="card flex gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-md">
            {thumbs[r.id] ? <img src={thumbs[r.id]} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" /> : <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]"><Files className="h-5 w-5 faint" /></span>}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold">{r.subjectName || 'Unknown'}</p><DecisionBadge decision={r.decision} /></div>
              <p className="truncate text-xs muted">{DOCUMENT_TYPE_LABEL[r.documentType]} · <span className="font-mono">{r.documentNumber || '—'}</span></p>
              <div className="mt-2 flex items-center justify-between gap-2"><RiskBadge level={r.risk?.level} score={r.risk?.score} /><span className="text-[11px] faint">{showOfficer ? `${r.officerName} · ` : ''}{timeAgo(r.createdAt)}</span></div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function useScreeningFilters(rows, pageSize = 20) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [decision, setDecision] = useState('');
  const [level, setLevel] = useState('');
  const [range, setRange] = useState('all');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const since = range === 'all' ? 0 : Date.now() - Number(range) * 86400e3;
    return rows.filter((r) =>
      (!type || r.documentType === type) &&
      (!decision || (decision === 'pending' ? !r.decision : r.decision === decision)) &&
      (!level || r.risk?.level === level) &&
      (!since || new Date(r.createdAt).getTime() >= since) &&
      (!needle || [r.subjectName, r.documentNumber, r.officerName, r.checkpoint, r.nationality, r.id].some((v) => String(v || '').toLowerCase().includes(needle))),
    );
  }, [rows, q, type, decision, level, range]);

  useEffect(() => { setPage(0); }, [q, type, decision, level, range]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const active = [type, decision, level, range !== 'all' ? range : ''].filter(Boolean).length + (q ? 1 : 0);

  const controls = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative col-span-2 lg:col-span-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 faint" /><input className="input pl-9" placeholder="Search name, number, officer, checkpoint…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">All document types</option>{DOCUMENT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)}><option value="">All decisions</option><option value="accept">Accepted</option><option value="flag">Flagged</option><option value="reject">Rejected</option><option value="pending">Pending</option></select>
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All risk levels</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented size="sm" value={range} onChange={setRange} options={RANGES} />
        {active > 0 && <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setType(''); setDecision(''); setLevel(''); setRange('all'); }}>Clear {active} filter{active > 1 ? 's' : ''}</button>}
      </div>
    </div>
  );

  const pagination = pages > 1 && (
    <div className="flex items-center justify-between border-t divider px-4 py-2 text-xs muted">
      <span>{page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}</span>
      <div className="flex gap-1"><button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" />Prev</button><button className="btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next<ChevronRight className="h-4 w-4" /></button></div>
    </div>
  );

  return { filtered, pageRows, controls, pagination };
}

export function exportCsv(rows, filename = 'screenings.csv') {
  const csv = toCsv(rows, [
    { label: 'ID', value: 'id' }, { label: 'Created', value: 'createdAt' }, { label: 'Officer', value: 'officerName' }, { label: 'Checkpoint', value: 'checkpoint' },
    { label: 'Document type', value: (r) => DOCUMENT_TYPE_LABEL[r.documentType] }, { label: 'Subject', value: 'subjectName' }, { label: 'Document number', value: 'documentNumber' }, { label: 'Nationality', value: 'nationality' },
    { label: 'Risk score', value: (r) => r.risk?.score }, { label: 'Risk level', value: (r) => r.risk?.level }, { label: 'Validation failed', value: (r) => r.validation?.failed }, { label: 'Tamper score', value: (r) => r.tampering?.score },
    { label: 'Face match %', value: (r) => r.face?.confidence }, { label: 'Decision', value: 'decision' }, { label: 'Decided at', value: 'decidedAt' }, { label: 'Note', value: 'decisionNote' },
  ]);
  downloadText(filename, csv);
}

export default function HistoryPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [rows, setRows] = useState(null);
  const [view, setView] = useState(() => (window.innerWidth < 640 ? 'cards' : 'table'));
  useEffect(() => { listScreenings({ user, mine: true, max: 500 }).then(setRows).catch(() => setRows([])); }, [user]);
  const { filtered, pageRows, controls, pagination } = useScreeningFilters(rows);

  return (
    <div>
      <PageHeader title="Screening history" subtitle="Your digital trail — every screening with its module outputs and decision."
        actions={<>
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'table', label: <LayoutList className="h-4 w-4" /> }, { value: 'cards', label: <LayoutGrid className="h-4 w-4" /> }]} />
          <button className="btn-secondary btn-sm" disabled={!filtered.length} onClick={() => exportCsv(filtered, `screenings-${new Date().toISOString().slice(0, 10)}.csv`)}><Download className="h-4 w-4" />CSV</button>
        </>} />
      <div className="mb-4">{controls}</div>
      {!rows ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        : filtered.length === 0 ? <EmptyState icon={History} title="No screenings match" body="Adjust the filters or run a new screening." action={<Link to="/screen" className="btn-primary">New screening</Link>} />
        : view === 'cards' ? <><ScreeningCards rows={pageRows} /><div className="card mt-3">{pagination}</div></>
        : <div className="card overflow-hidden"><ScreeningTable rows={pageRows} compact={settings.compactTables} />{pagination}</div>}
    </div>
  );
}
