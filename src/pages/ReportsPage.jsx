import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Download, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { listScreenings } from '../services/screenings.js';
import { PageHeader, Skeleton, EmptyState, RiskBadge, DecisionBadge, AiDecisionBadge, Table } from '../components/ui/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { formatDateTime, caseId } from '../lib/format.js';
import { downloadText } from '../lib/csv.js';
import { useScreeningFilters, exportCsv } from './HistoryPage.jsx';

function auditJson(row) {
  return JSON.stringify({ ...row, documentImageUrl: row.documentImageUrl ? '[inline image]' : null, liveImageUrl: row.liveImageUrl ? '[inline image]' : null, tampering: row.tampering && { ...row.tampering, evidence: { ...row.tampering.evidence, elaImage: row.tampering.evidence?.elaImage ? '[image]' : null } } }, null, 2);
}

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => { listScreenings({ user, mine: !isAdmin, max: 500 }).then(setRows).catch(() => setRows([])); }, [user, isAdmin]);
  const { filtered, pageRows, controls, pagination } = useScreeningFilters(rows);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Case reports for officers and investigators: printable summary, machine-readable record, or a CSV of the current selection."
        actions={<button className="btn-secondary btn-sm" disabled={!filtered.length} onClick={() => exportCsv(filtered, `cases-${new Date().toISOString().slice(0, 10)}.csv`)}><Download className="h-4 w-4" aria-hidden="true" />Export CSV ({filtered.length})</button>} />
      <div className="mb-4">{controls}</div>
      {!rows ? <Skeleton className="h-40 w-full" /> : filtered.length === 0 ? <EmptyState icon={FileText} title="No cases match" /> : (
        <div className="card overflow-hidden">
          <Table minWidth={760}>
            <thead><tr><th>Case</th><th>Document</th><th>Subject</th><th>Assessment</th><th>Decision</th><th>Date</th><th className="text-right">Report</th></tr></thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="t-code">{caseId(r)}</td>
                  <td>{DOCUMENT_TYPE_LABEL[r.documentType]}</td>
                  <td><Link to={`/investigations/${r.id}`} className="font-medium text-[var(--brand)] hover:underline">{r.subjectName || 'Unknown'}</Link></td>
                  <td><span className="flex flex-wrap items-center gap-1.5"><AiDecisionBadge decision={r.aiDecision || r.fusion?.decision} /><RiskBadge level={r.risk?.level} score={r.risk?.score} /></span></td>
                  <td><DecisionBadge decision={r.decision} /></td>
                  <td className="muted whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link to={`/investigations/${r.id}?print=1`} className="btn-ghost btn-sm" title="Open printable report"><Printer className="h-4 w-4" aria-hidden="true" />Print</Link>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => downloadText(`case-${caseId(r)}.json`, auditJson(r), 'application/json')} title="Download case record"><Download className="h-4 w-4" aria-hidden="true" />JSON</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {pagination}
        </div>
      )}
    </div>
  );
}
