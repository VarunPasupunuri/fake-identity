import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, History, ArrowRight, ShieldAlert, Gauge, Files, Flag, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { listScreenings, computeStats } from '../services/screenings.js';
import { Stat, Card, RiskBadge, DecisionBadge, EmptyState, Skeleton, Kbd } from '../components/ui/index.jsx';
import { Sparkline, BarChart, Donut, VIZ } from '../components/charts/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { timeAgo, lastNDays } from '../lib/format.js';
import { useDocumentThumbnails } from '../hooks/useScreeningImages.js';

export default function HomePage() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [rows, setRows] = useState(null);

  useEffect(() => { listScreenings({ user, mine: !isAdmin, max: 300 }).then(setRows).catch(() => setRows([])); }, [user, isAdmin]);
  const thumbs = useDocumentThumbnails(rows ? rows.slice(0, 6) : []);
  const stats = rows ? computeStats(rows) : null;
  const days = useMemo(() => (rows ? lastNDays(rows, 7) : []), [rows]);
  const trend = days.map((d) => d.rows.length);
  const flaggedTrend = days.map((d) => d.rows.filter((r) => r.decision === 'flag' || r.decision === 'reject').length);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pending = rows?.filter((r) => !r.decision) || [];

  return (
    <div className="space-y-6">
      {/* Hero strip */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-900 p-6 text-white sm:p-8 animate-fade-in">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-600/50 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-slate-300">{greeting}, {user?.displayName?.split(' ').slice(-1)[0]}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Checkpoint {settings.checkpoint}</h1>
            <p className="mt-2 max-w-lg text-sm text-slate-300">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {stats ? `${stats.todayCount} screened today` : '…'}{pending.length ? ` · ${pending.length} awaiting decision` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/screen" className="btn-primary min-w-48 bg-white text-brand-900 shadow-white/20 hover:bg-brand-50"><ScanLine className="h-5 w-5" />Start screening<span className="ml-1 hidden sm:inline"><Kbd>N</Kbd></span></Link>
            <Link to="/history" className="btn border border-white/20 bg-white/5 text-white hover:bg-white/10"><History className="h-5 w-5" />History</Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Screened (7 days)" value={trend.reduce((a, b) => a + b, 0)} hint={`${stats?.todayCount ?? 0} today`} icon={Files} spark={<Sparkline values={trend} />} loading={!rows} />
        <Stat label="Flagged / rejected" value={stats ? `${stats.flaggedPct}%` : '—'} hint={stats ? `${stats.byDecision.flag + stats.byDecision.reject} of ${stats.total}` : ''} icon={Flag} spark={<Sparkline values={flaggedTrend} color={VIZ.crit} />} loading={!rows} tone={stats?.flaggedPct > 25 ? 'text-amber-600' : undefined} />
        <Stat label="High-risk hits" value={stats?.byLevel.high ?? '—'} hint="score ≥ 60" icon={ShieldAlert} loading={!rows} tone={stats?.byLevel.high ? 'text-red-600' : undefined} />
        <Stat label="Average risk score" value={stats?.avgRisk ?? '—'} hint="0 clean · 100 certain forgery" icon={Gauge} loading={!rows} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Activity — last 7 days" subtitle="Screenings per day" className="lg:col-span-2" icon={Clock}>
          {!rows ? <Skeleton className="h-44 w-full" /> : <BarChart height={190} data={days.map((d) => ({ label: d.label, values: { total: d.rows.length } }))} series={[{ key: 'total', label: 'Screenings', color: VIZ.blue }]} showTable />}
        </Card>
        <Card title="Decisions" subtitle="All time" icon={Gauge}>
          {!rows ? <Skeleton className="h-44 w-full" /> : (
            <Donut size={140} slices={[
              { key: 'accept', label: 'Accepted', value: stats.byDecision.accept, color: VIZ.good, icon: CheckCircle2 },
              { key: 'flag', label: 'Flagged', value: stats.byDecision.flag, color: VIZ.warn, icon: Flag },
              { key: 'reject', label: 'Rejected', value: stats.byDecision.reject, color: VIZ.crit, icon: XCircle },
              { key: 'pending', label: 'Pending', value: stats.byDecision.pending, color: VIZ.muted, icon: Clock },
            ]} />
          )}
        </Card>
      </div>

      <Card title="Recent screenings" subtitle={isAdmin ? 'Across all officers' : 'Your latest work'} icon={History} padded={false} actions={<Link to="/history" className="btn-ghost btn-sm">View all<ArrowRight className="h-3.5 w-3.5" /></Link>}>
        {!rows ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={History} title="No screenings yet" body="Start a screening to build your audit trail." action={<Link to="/screen" className="btn-primary">New screening</Link>} /></div>
        ) : (
          <ul className="divide-y divider">
            {rows.slice(0, 6).map((r, i) => (
              <li key={r.id} className="animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                <Link to={`/history/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-2)] sm:px-5">
                  {thumbs[r.id] ? <img src={thumbs[r.id]} alt="" className="hidden h-10 w-14 rounded-md object-cover sm:block" /> : <span className="hidden h-10 w-14 items-center justify-center rounded-md bg-[var(--surface-2)] sm:flex"><Files className="h-4 w-4 faint" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.subjectName || 'Unknown subject'}</p>
                    <p className="truncate text-xs muted">{DOCUMENT_TYPE_LABEL[r.documentType]} · <span className="font-mono">{r.documentNumber || '—'}</span> · {timeAgo(r.createdAt)}{isAdmin ? ` · ${r.officerName}` : ''}</p>
                  </div>
                  <RiskBadge level={r.risk?.level} score={r.risk?.score} />
                  <span className="hidden sm:inline"><DecisionBadge decision={r.decision} /></span>
                  <ArrowRight className="hidden h-4 w-4 faint sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
