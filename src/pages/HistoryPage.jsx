import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, History, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { listScreenings } from '../services/screenings.js';
import { RiskBadge, DecisionBadge, AiDecisionBadge, EmptyState, Skeleton, PageHeader, Segmented, Table } from '../components/ui/index.jsx';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { formatDateTime, timeAgo, caseId } from '../lib/format.js';
import { toCsv, downloadText } from '../lib/csv.js';
import { useDocumentThumbnails } from '../hooks/useScreeningImages.js';

const RANGES = [{ value: 'all', label: 'All time' }, { value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }];

const statusOf = (r) => (r.decision ? 'Decided' : 'Pending');

/** Case table: Case ID · Date · Document · Subject · Risk · Assessment · Decision · Officer · Status */
export function CaseTable({ rows, showOfficer = false, compact = false, linkBase = '/history' }) {
  return (
    <Table compact={compact} minWidth={showOfficer ? 960 : 860}>
      <thead>
        <tr><th>Case ID</th><th>Date</th><th>Document type</th><th>Subject</th><th>Risk</th><th>Assessment</th><th>Decision</th>{showOfficer && <th>Officer</th>}<th>Status</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="t-code"><Link to={`${linkBase}/${r.id}`} className="text-[var(--brand)] hover:underline">{caseId(r)}</Link></td>
            <td className="muted whitespace-nowrap" title={formatDateTime(r.createdAt)}>{formatDateTime(r.createdAt)}</td>
            <td>{DOCUMENT_TYPE_LABEL[r.documentType]}<span className="block t-code muted">{r.documentNumber || '—'}</span></td>
            <td className="font-medium">{r.subjectName || 'Unknown'}<span className="block t-caption">{r.nationality || '—'}</span></td>
            <td><RiskBadge level={r.risk?.level} score={r.risk?.score} /></td>
            <td><AiDecisionBadge decision={r.aiDecision || r.fusion?.decision} /></td>
            <td><DecisionBadge decision={r.decision} /></td>
            {showOfficer && <td>{r.officerName}<span className="block t-caption">{r.checkpoint}</span></td>}
            <td className="muted">{statusOf(r)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Compact case cards for phones. */
export function CaseCards({ rows, showOfficer, linkBase = '/history' }) {
  const thumbs = useDocumentThumbnails(rows);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`${linkBase}/${r.id}`} className="card flex gap-3 p-3 hover:bg-[var(--surface-2)]">
            {thumbs[r.id] ? <img src={thumbs[r.id]} alt="" className="h-14 w-18 shrink-0 rounded-sm hairline object-cover" /> : <span className="h-14 w-18 shrink-0 rounded-sm bg-[var(--surface-2)]" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2"><span className="t-code muted">{caseId(r)}</span><DecisionBadge decision={r.decision} /></div>
              <p className="truncate text-sm font-medium">{r.subjectName || 'Unknown'}</p>
              <p className="truncate t-caption">{DOCUMENT_TYPE_LABEL[r.documentType]} · {r.documentNumber || '—'}{showOfficer ? ` · ${r.officerName}` : ''}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><RiskBadge level={r.risk?.level} score={r.risk?.score} /><AiDecisionBadge decision={r.aiDecision || r.fusion?.decision} /><span className="ml-auto t-caption">{timeAgo(r.createdAt)}</span></div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Backwards-compatible names used by AdminPage
export const ScreeningTable = CaseTable;
export const ScreeningCards = CaseCards;

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
      (!needle || [r.subjectName, r.documentNumber, r.officerName, r.checkpoint, r.nationality, r.id, caseId(r)].some((v) => String(v || '').toLowerCase().includes(needle))),
    );
  }, [rows, q, type, decision, level, range]);

  useEffect(() => { setPage(0); }, [q, type, decision, level, range]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const active = [type, decision, level, range !== 'all' ? range : ''].filter(Boolean).length + (q ? 1 : 0);

  const controls = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative col-span-2 lg:col-span-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 faint" aria-hidden="true" /><input className="input pl-9" placeholder="Search case ID, subject, document number, officer…" aria-label="Search cases" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input" aria-label="Document type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All document types</option>{DOCUMENT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        <select className="input" aria-label="Officer decision" value={decision} onChange={(e) => setDecision(e.target.value)}><option value="">All decisions</option><option value="accept">Approved</option><option value="flag">Review</option><option value="reject">Rejected</option><option value="pending">Pending</option></select>
        <select className="input" aria-label="Risk level" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All risk levels</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented size="sm" value={range} onChange={setRange} options={RANGES} />
        {active > 0 && <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setType(''); setDecision(''); setLevel(''); setRange('all'); }}>Clear {active} filter{active > 1 ? 's' : ''}</button>}
      </div>
    </div>
  );

  const pagination = pages > 1 && (
    <div className="flex items-center justify-between border-t divider px-4 py-2 t-caption">
      <span>{page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}</span>
      <div className="flex gap-1"><button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button><button className="btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button></div>
    </div>
  );

  return { filtered, pageRows, controls, pagination };
}

export function exportCsv(rows, filename = 'cases.csv') {
  const csv = toCsv(rows, [
    { label: 'Case ID', value: (r) => caseId(r) }, { label: 'Record ID', value: 'id' }, { label: 'Created', value: 'createdAt' }, { label: 'Officer', value: 'officerName' }, { label: 'Checkpoint', value: 'checkpoint' },
    { label: 'Document type', value: (r) => DOCUMENT_TYPE_LABEL[r.documentType] }, { label: 'Subject', value: 'subjectName' }, { label: 'Document number', value: 'documentNumber' }, { label: 'Nationality', value: 'nationality' },
    { label: 'Risk score', value: (r) => r.risk?.score }, { label: 'Risk level', value: (r) => r.risk?.level }, { label: 'Confidence', value: (r) => r.confidence ?? '' }, { label: 'System assessment', value: (r) => r.aiDecision || r.fusion?.decision || '' },
    { label: 'Validation failed', value: (r) => r.validation?.failed }, { label: 'Integrity score', value: (r) => r.tampering?.score }, { label: 'Face match %', value: (r) => r.face?.confidence }, { label: 'Watchlist', value: (r) => r.watchlist?.status || '' },
    { label: 'Officer decision', value: 'decision' }, { label: 'Decided at', value: 'decidedAt' }, { label: 'Note', value: 'decisionNote' }, { label: 'Processing ms', value: (r) => r.processingMs ?? '' },
  ]);
  downloadText(filename, csv);
}

export default function HistoryPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [rows, setRows] = useState(null);
  useEffect(() => { listScreenings({ user, mine: true, max: 500 }).then(setRows).catch(() => setRows([])); }, [user]);
  const { filtered, pageRows, controls, pagination } = useScreeningFilters(rows);

  return (
    <div>
      <PageHeader title="Screening history" subtitle="Every screening you have recorded, with its assessment and decision."
        actions={<button className="btn-secondary btn-sm" disabled={!filtered.length} onClick={() => exportCsv(filtered, `screenings-${new Date().toISOString().slice(0, 10)}.csv`)}><Download className="h-4 w-4" aria-hidden="true" />Export CSV</button>} />
      <div className="mb-4">{controls}</div>
      {!rows ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        : filtered.length === 0 ? <EmptyState icon={History} title="No screenings match" body="Adjust the filters or screen a new document." action={<Link to="/screen" className="btn-primary btn-sm">Screen document</Link>} />
        : <>
            <div className="hidden md:block card overflow-hidden"><CaseTable rows={pageRows} compact={settings.compactTables} />{pagination}</div>
            <div className="md:hidden"><CaseCards rows={pageRows} />{pagination && <div className="card mt-2">{pagination}</div>}</div>
          </>}
    </div>
  );
}
