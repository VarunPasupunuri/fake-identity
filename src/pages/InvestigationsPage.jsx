import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderSearch } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { listScreenings } from '../services/screenings.js';
import { PageHeader, Skeleton, EmptyState, Segmented } from '../components/ui/index.jsx';
import { CaseTable, CaseCards, useScreeningFilters } from './HistoryPage.jsx';

/** Cases that need attention: no officer decision yet, flagged, rejected, or a non-approve system assessment. */
export function needsInvestigation(r) {
  const sys = r.aiDecision || r.fusion?.decision || null;
  return !r.decision || r.decision === 'flag' || r.decision === 'reject' || (sys && sys !== 'approve');
}

export default function InvestigationsPage() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState(null);
  const [scope, setScope] = useState('open');
  useEffect(() => { listScreenings({ user, mine: !isAdmin, max: 500 }).then(setRows).catch(() => setRows([])); }, [user, isAdmin]);
  const base = rows ? rows.filter(needsInvestigation).filter((r) => scope === 'all' || (scope === 'open' ? !r.decision : Boolean(r.decision))) : null;
  const { filtered, pageRows, controls, pagination } = useScreeningFilters(base);

  return (
    <div>
      <PageHeader title="Investigations" subtitle="Cases awaiting an officer decision or carrying a review, reject or insufficient-evidence assessment."
        actions={<Segmented size="sm" value={scope} onChange={setScope} options={[{ value: 'open', label: 'Awaiting decision' }, { value: 'decided', label: 'Decided' }, { value: 'all', label: 'All flagged' }]} />} />
      <div className="mb-4">{controls}</div>
      {!rows ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        : filtered.length === 0 ? <EmptyState icon={FolderSearch} title="No cases in this view" body="Cases appear here when the system assessment is not APPROVE or an officer decision is pending." action={<Link to="/history" className="btn-secondary btn-sm">Open screening history</Link>} />
        : <>
            <div className="hidden md:block card overflow-hidden"><CaseTable rows={pageRows} showOfficer={isAdmin} linkBase="/investigations" />{pagination}</div>
            <div className="md:hidden"><CaseCards rows={pageRows} showOfficer={isAdmin} linkBase="/investigations" />{pagination}</div>
          </>}
    </div>
  );
}
