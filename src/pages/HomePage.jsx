import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, History, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { listScreenings, computeStats } from '../services/screenings.js';
import { Stat, Card, RiskBadge, DecisionBadge, EmptyState } from '../components/ui/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { timeAgo } from '../lib/format.js';

export default function HomePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);

  useEffect(() => { listScreenings({ user, mine: true, max: 100 }).then(setRows).catch(() => setRows([])); }, [user]);
  const stats = rows ? computeStats(rows) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {user?.displayName?.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500">{user?.checkpoint || 'Checkpoint'} · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Link to="/screen" className="btn-primary sm:min-w-56"><ScanLine className="h-5 w-5" />Start new screening</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Screened today" value={stats ? stats.todayCount : '—'} />
        <Stat label="My screenings" value={stats ? stats.total : '—'} />
        <Stat label="Flagged / rejected" value={stats ? `${stats.flaggedPct}%` : '—'} tone={stats?.flaggedPct > 25 ? 'text-amber-600' : undefined} />
        <Stat label="Avg. risk score" value={stats ? stats.avgRisk : '—'} />
      </div>

      <Card title="Recent screenings" actions={<Link to="/history" className="text-xs font-semibold text-brand-600 hover:underline">View all</Link>}>
        {!rows ? <p className="text-sm text-slate-500">Loading…</p> : rows.length === 0 ? (
          <EmptyState icon={History} title="No screenings yet" body="Start a screening to build your audit trail." action={<Link to="/screen" className="btn-primary">New screening</Link>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.slice(0, 6).map((r) => (
              <li key={r.id}>
                <Link to={`/history/${r.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.subjectName || 'Unknown subject'}</p>
                    <p className="truncate text-xs text-slate-500">{DOCUMENT_TYPE_LABEL[r.documentType]} · {r.documentNumber || '—'} · {timeAgo(r.createdAt)}</p>
                  </div>
                  <RiskBadge level={r.risk?.level} score={r.risk?.score} />
                  <DecisionBadge decision={r.decision} />
                  <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
