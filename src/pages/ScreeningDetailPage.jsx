import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Printer, Copy, Download, Clock, User, MapPin, FileText, ScanSearch } from 'lucide-react';
import { getScreening, recordDecision } from '../services/screenings.js';
import ResultsView from '../components/screening/ResultsView.jsx';
import DecisionBar from '../components/screening/DecisionBar.jsx';
import { DecisionBadge, AiDecisionBadge, Spinner, EmptyState, PageHeader, Badge, Card, StatusText } from '../components/ui/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { formatDateTime, caseId } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { downloadText } from '../lib/csv.js';
import { useScreeningImages } from '../hooks/useScreeningImages.js';
import { PRODUCT_NAME } from '../components/brand/Logo.jsx';

function auditJson(row) {
  return { ...row, documentImageUrl: row.documentImageUrl ? '[inline image]' : null, liveImageUrl: row.liveImageUrl ? '[inline image]' : null, tampering: row.tampering && { ...row.tampering, evidence: { ...row.tampering.evidence, elaImage: row.tampering.evidence?.elaImage ? '[image]' : null } } };
}

export function WatchlistPanel({ watchlist }) {
  if (!watchlist) return null;
  const status = watchlist.status;
  const st = status === 'clear' ? 'pass' : status === 'confirmed_match' || status === 'match' ? 'fail' : status === 'unavailable' ? 'unavailable' : 'warn';
  const top = watchlist.matches?.[0];
  return (
    <Card title="Watchlist result" subtitle={watchlist.source} icon={ScanSearch}>
      <StatusText status={st} className="font-medium text-[var(--ink)]">{{ clear: 'No match', confirmed_match: 'Confirmed match', match: 'Confirmed match', possible_match: 'Possible match — requires officer review', possible: 'Possible match — requires officer review', unavailable: 'Check unavailable' }[status] || status}</StatusText>
      <p className="mt-2 t-body-sm muted">{watchlist.explanation}</p>
      {top && <dl className="mt-3 grid grid-cols-2 gap-2 t-body-sm"><div><dt className="t-caption">Record</dt><dd className="t-code">{top.recordId}</dd></div><div><dt className="t-caption">Match type</dt><dd>{String(top.matchType || '').replace('_', ' ')}</dd></div><div><dt className="t-caption">Confidence</dt><dd className="tabular">{Math.round((top.confidence || 0) * 100)}%</dd></div><div><dt className="t-caption">Fields used</dt><dd>{(watchlist.fieldsUsed || []).join(', ') || '—'}</dd></div></dl>}
      {watchlist.synthetic && <p className="mt-3 t-caption">Synthetic demonstration list — not a government database.</p>}
    </Card>
  );
}

export default function ScreeningDetailPage({ investigation = false }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const [row, setRow] = useState(undefined);
  useEffect(() => { setRow(undefined); getScreening(id).then(setRow).catch(() => setRow(null)); }, [id]);
  const images = useScreeningImages(row);
  useEffect(() => { if (row && params.get('print') === '1') setTimeout(() => window.print(), 400); }, [row, params]);

  if (row === undefined) return <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>;
  if (!row) return <EmptyState title="Case not found" body="It may have been recorded by another officer or removed." action={<Link to="/history" className="btn-secondary btn-sm">Back to history</Link>} />;

  const canDecide = !row.decision && row.officerId === user?.uid;
  const decide = async ({ decision, note }) => {
    await recordDecision(row.id, { decision, note });
    setRow({ ...row, decision, decisionNote: note || null, decidedAt: new Date().toISOString(), status: 'decided' });
    toast.success(`Officer decision recorded: ${decision}`);
  };

  const timeline = [
    { t: row.createdAt, label: 'Document screened', body: `${DOCUMENT_TYPE_LABEL[row.documentType]} · ${row.officerName} · ${row.checkpoint}` },
    row.ocr && { t: row.createdAt, label: 'Verification completed', body: `Extraction ${row.providers?.ocr} · integrity ${row.providers?.tamper} · face ${row.providers?.face}${row.providers?.watchlist ? ` · watchlist ${row.providers.watchlist}` : ''}${typeof row.processingMs === 'number' ? ` · ${(row.processingMs / 1000).toFixed(1)} s` : ''}` },
    (row.aiDecision || row.fusion?.decision) && { t: row.createdAt, label: `System assessment: ${(row.aiDecision || row.fusion?.decision).replace('_', ' ')}`, body: row.fusion?.rationale || '' },
    row.decidedAt && { t: row.decidedAt, label: `Officer decision: ${row.decision}`, body: row.decisionNote ? `“${row.decisionNote}”` : 'No officer note' },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader crumbs={[{ label: investigation ? 'Investigations' : 'Screening history', to: investigation ? '/investigations' : '/history' }, { label: caseId(row) }]}
        title={row.subjectName || 'Unknown subject'}
        subtitle={`${caseId(row)} · ${DOCUMENT_TYPE_LABEL[row.documentType]} · ${row.documentNumber || 'no document number'} · ${formatDateTime(row.createdAt)}`}
        actions={<div className="no-print flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success('Link copied'); }}><Copy className="h-4 w-4" aria-hidden="true" />Copy link</button>
          <button className="btn-secondary btn-sm" onClick={() => downloadText(`case-${caseId(row)}.json`, JSON.stringify(auditJson(row), null, 2), 'application/json')}><Download className="h-4 w-4" aria-hidden="true" />Case record</button>
          <button className="btn-primary btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" />Print report</button>
        </div>} />

      {/* Case overview strip */}
      <section className="mb-6 grid gap-x-8 gap-y-3 border-b divider pb-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Case overview">
        <div><p className="t-label flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden="true" />Officer</p><p className="text-sm font-medium">{row.officerName}</p></div>
        <div><p className="t-label flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />Checkpoint</p><p className="text-sm font-medium">{row.checkpoint}</p></div>
        <div><p className="t-label">System assessment</p><p className="mt-0.5"><AiDecisionBadge decision={row.aiDecision || row.fusion?.decision} /></p></div>
        <div><p className="t-label">Officer decision</p><p className="mt-0.5 flex flex-wrap items-center gap-2"><DecisionBadge decision={row.decision} />{row.decidedAt && <span className="t-caption">{formatDateTime(row.decidedAt)}</span>}</p></div>
      </section>

      <ResultsView results={row} images={images} mode={investigation ? 'investigation' : 'review'}>
        {canDecide ? <DecisionBar recommendation={row.risk?.recommendation} aiDecision={row.aiDecision || row.fusion?.decision} onDecide={decide} sticky={false} /> : (
          <div className="rounded-md hairline p-3 text-sm">
            <p className="t-label">Officer decision</p>
            <p className="mt-1 flex items-center gap-2"><DecisionBadge decision={row.decision} />{row.decidedAt && <span className="t-caption">{formatDateTime(row.decidedAt)}</span>}</p>
            {row.decisionNote && <p className="mt-2 muted">“{row.decisionNote}”</p>}
            {!row.decision && <p className="mt-2 t-caption">Awaiting a decision by the screening officer.</p>}
          </div>
        )}
      </ResultsView>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <WatchlistPanel watchlist={row.watchlist} />
        <Card title="Verification timeline" icon={Clock}>
          <ol className="space-y-4 border-l divider pl-4">
            {timeline.map((e, i) => <li key={i} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--brand)] ring-4 ring-[var(--surface)]" aria-hidden="true" /><p className="text-sm font-medium">{e.label}</p>{e.body && <p className="t-body-sm muted">{e.body}</p>}<p className="t-caption">{formatDateTime(e.t)}</p></li>)}
          </ol>
        </Card>
      </div>

      <p className="mt-8 hidden t-caption print:block"><FileText className="mr-1 inline h-3 w-3" aria-hidden="true" />{PRODUCT_NAME} case report · {caseId(row)} · generated {new Date().toLocaleString()} · {row.officerName}</p>
      <Badge tone="neutral" className="sr-only">{row.id}</Badge>
    </div>
  );
}
