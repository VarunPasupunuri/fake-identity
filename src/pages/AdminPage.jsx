import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listScreenings, computeStats } from '../services/screenings.js';
import { Stat, Card, Spinner, EmptyState } from '../components/ui/index.jsx';
import { ScreeningTable, useScreeningFilters } from './HistoryPage.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { LayoutDashboard } from 'lucide-react';

export default function AdminPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => { listScreenings({ user, mine: false, max: 500 }).then(setRows).catch(() => setRows([])); }, [user]);
  const { filtered, controls } = useScreeningFilters(rows);
  const stats = rows ? computeStats(rows) : null;

  if (!rows) return <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Admin dashboard</h1><p className="text-sm text-slate-500">All checkpoints · last {rows.length} screenings</p></div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Documents screened" value={stats.total} hint={`${stats.todayCount} today`} />
        <Stat label="Flagged / rejected" value={`${stats.flaggedPct}%`} hint={`${stats.byDecision.flag} flagged · ${stats.byDecision.reject} rejected`} tone={stats.flaggedPct > 25 ? 'text-amber-600' : undefined} />
        <Stat label="High risk" value={stats.byLevel.high} hint={`${stats.byLevel.medium} medium · ${stats.byLevel.low} low`} tone={stats.byLevel.high ? 'text-red-600' : undefined} />
        <Stat label="Avg. risk score" value={stats.avgRisk} hint="0 = clean, 100 = certain forgery" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BreakdownCard title="By document type" data={stats.byType} labelFn={(k) => DOCUMENT_TYPE_LABEL[k] || k} />
        <BreakdownCard title="By checkpoint" data={stats.byCheckpoint} labelFn={(k) => k} />
      </div>

      <Card title="Audit log" subtitle="Searchable record of every screening, officer and decision">
        <div className="mb-4">{controls}</div>
        {filtered.length === 0 ? <EmptyState icon={LayoutDashboard} title="No matching screenings" /> : <ScreeningTable rows={filtered} showOfficer />}
      </Card>
    </div>
  );
}

function BreakdownCard({ title, data, labelFn }) {
  const entries = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, ...entries.map(([, v]) => v.total));
  return (
    <Card title={title}>
      {entries.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : (
        <ul className="space-y-3">
          {entries.map(([k, v]) => {
            const pct = v.total ? Math.round((v.flagged / v.total) * 100) : 0;
            return (
              <li key={k}>
                <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-medium text-slate-800">{labelFn(k)}</span><span className="text-xs text-slate-500">{v.total} screened · {pct}% flagged</span></div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="bg-emerald-500" style={{ width: `${((v.total - v.flagged) / max) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(v.flagged / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
