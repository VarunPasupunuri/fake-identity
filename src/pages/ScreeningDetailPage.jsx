import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Copy, Clock, User, MapPin, FileText, Cpu, Download } from 'lucide-react';
import { getScreening } from '../services/screenings.js';
import ResultsView from '../components/screening/ResultsView.jsx';
import { DecisionBadge, Spinner, EmptyState, PageHeader, Avatar } from '../components/ui/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { formatDateTime } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { downloadText } from '../lib/csv.js';

export default function ScreeningDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [row, setRow] = useState(undefined);
  useEffect(() => { setRow(undefined); getScreening(id).then(setRow).catch(() => setRow(null)); }, [id]);

  if (row === undefined) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>;
  if (!row) return <EmptyState title="Screening not found" body="It may have been recorded by another officer or deleted." action={<Link to="/history" className="btn-secondary">Back to history</Link>} />;

  const audit = { ...row, documentImageUrl: row.documentImageUrl ? '[image]' : null, liveImageUrl: row.liveImageUrl ? '[image]' : null, tampering: row.tampering && { ...row.tampering, evidence: { ...row.tampering.evidence, elaImage: row.tampering.evidence?.elaImage ? '[image]' : null } } };
  const timeline = [
    { t: row.createdAt, label: 'Screening created', body: `${DOCUMENT_TYPE_LABEL[row.documentType]} scanned by ${row.officerName} at ${row.checkpoint}` },
    row.ocr && { t: row.createdAt, label: 'Modules completed', body: `OCR ${row.providers?.ocr} · tampering ${row.providers?.tamper} · face ${row.providers?.face}` },
    row.decidedAt && { t: row.decidedAt, label: `Decision: ${row.decision}`, body: row.decisionNote ? `“${row.decisionNote}”` : 'No officer note' },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader crumbs={[{ label: 'History', to: '/history' }, { label: row.id }]} title={row.subjectName || 'Unknown subject'} subtitle={`${DOCUMENT_TYPE_LABEL[row.documentType]} · ${row.documentNumber || 'no number'} · ${formatDateTime(row.createdAt)}`}
        actions={<div className="no-print flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success('Link copied'); }}><Copy className="h-4 w-4" />Copy link</button>
          <button className="btn-secondary btn-sm" onClick={() => downloadText(`screening-${row.id}.json`, JSON.stringify(audit, null, 2), 'application/json')}><Download className="h-4 w-4" />JSON</button>
          <button className="btn-primary btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" />Print report</button>
        </div>} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="surface flex items-center gap-3 p-3"><Avatar name={row.officerName} size="sm" /><div className="min-w-0"><p className="text-[11px] uppercase tracking-wider faint">Officer</p><p className="truncate text-sm font-semibold">{row.officerName}</p></div></div>
        <div className="surface flex items-center gap-3 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)]"><MapPin className="h-4 w-4 faint" /></span><div><p className="text-[11px] uppercase tracking-wider faint">Checkpoint</p><p className="text-sm font-semibold">{row.checkpoint}</p></div></div>
        <div className="surface flex items-center gap-3 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)]"><Clock className="h-4 w-4 faint" /></span><div className="min-w-0"><p className="text-[11px] uppercase tracking-wider faint">Decision</p><p className="flex items-center gap-2 text-sm font-semibold"><DecisionBadge decision={row.decision} />{row.decidedAt && <span className="truncate text-xs font-normal muted">{formatDateTime(row.decidedAt)}</span>}</p></div></div>
      </div>

      <ResultsView results={row} images={{ document: row.documentImageUrl, live: row.liveImageUrl }} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 faint" />Timeline</h3>
          <ol className="mt-3 space-y-4 border-l divider pl-4">
            {timeline.map((e, i) => <li key={i} className="relative"><span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-[var(--surface)]" /><p className="text-sm font-medium">{e.label}</p><p className="text-xs muted">{e.body}</p><p className="text-[11px] faint">{formatDateTime(e.t)}</p></li>)}
          </ol>
        </section>
        <details className="card p-5 text-xs">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 faint" />Audit record (JSON)</summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-[var(--surface-2)] p-3">{JSON.stringify(audit, null, 2)}</pre>
        </details>
      </div>
      <p className="mt-6 hidden text-center text-[10px] text-slate-500 print:block"><FileText className="mr-1 inline h-3 w-3" />BorderScreen report · {row.id} · generated {new Date().toLocaleString()} · <User className="mx-1 inline h-3 w-3" />{row.officerName}</p>
    </div>
  );
}
