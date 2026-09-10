import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getScreening } from '../services/screenings.js';
import ResultsView from '../components/screening/ResultsView.jsx';
import { DecisionBadge, Spinner, EmptyState } from '../components/ui/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { formatDateTime } from '../lib/format.js';

export default function ScreeningDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState(undefined);
  useEffect(() => { getScreening(id).then(setRow).catch(() => setRow(null)); }, [id]);

  if (row === undefined) return <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>;
  if (!row) return <EmptyState title="Screening not found" body="It may have been recorded by another officer." action={<Link to="/history" className="btn-secondary">Back to history</Link>} />;

  return (
    <div className="space-y-5">
      <Link to="/history" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />History</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Screening {row.id}</h1>
          <p className="text-sm text-slate-500">{DOCUMENT_TYPE_LABEL[row.documentType]} · {formatDateTime(row.createdAt)} · {row.officerName} @ {row.checkpoint}</p>
        </div>
        <div className="text-right"><DecisionBadge decision={row.decision} />{row.decidedAt && <p className="mt-1 text-xs text-slate-500">Decided {formatDateTime(row.decidedAt)}</p>}{row.decisionNote && <p className="mt-1 max-w-xs text-xs text-slate-600">“{row.decisionNote}”</p>}</div>
      </div>
      <ResultsView results={row} images={{ document: row.documentImageUrl, live: row.liveImageUrl }} />
      <details className="card p-4 text-xs text-slate-600">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Audit record (JSON)</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-50 p-3">{JSON.stringify({ ...row, documentImageUrl: row.documentImageUrl ? '[image]' : null, liveImageUrl: row.liveImageUrl ? '[image]' : null, tampering: row.tampering && { ...row.tampering, evidence: { ...row.tampering.evidence, elaImage: row.tampering.evidence?.elaImage ? '[image]' : null } } }, null, 2)}</pre>
      </details>
    </div>
  );
}
