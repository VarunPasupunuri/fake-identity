import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, ArrowRight, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { listScreenings, computeStats } from '../services/screenings.js';
import { Card, RiskBadge, DecisionBadge, AiDecisionBadge, EmptyState, Skeleton, Table, Kbd } from '../components/ui/index.jsx';
import { BarChart, HBars, VIZ } from '../components/charts/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { timeAgo, lastNDays, caseId, cx } from '../lib/format.js';
import { CheckCircle2, Flag, XCircle } from 'lucide-react';

const DECISION_SERIES = [
  { key: 'accept', label: 'Approved', color: VIZ.good, icon: CheckCircle2 },
  { key: 'flag', label: 'Review', color: VIZ.warn, icon: Flag },
  { key: 'reject', label: 'Rejected', color: VIZ.crit, icon: XCircle },
];

function Metric({ label, value, hint, tone, loading }) {
  return (
    <div className="px-4 py-3 first:pl-0 last:pr-0 sm:px-6">
      <p className="t-label">{label}</p>
      {loading ? <Skeleton className="mt-1 h-7 w-16" /> : <p className={cx('mt-0.5 t-num', tone)}>{value}</p>}
      {hint && <p className="t-caption">{hint}</p>}
    </div>
  );
}

export default function HomePage() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [rows, setRows] = useState(null);
  useEffect(() => { listScreenings({ user, mine: !isAdmin, max: 300 }).then(setRows).catch(() => setRows([])); }, [user, isAdmin]);

  const stats = rows ? computeStats(rows) : null;
  const today = useMemo(() => (rows ? rows.filter((r) => (r.createdAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)) : []), [rows]);
  const todayCounts = { screened: today.length, accept: today.filter((r) => r.decision === 'accept').length, flag: today.filter((r) => r.decision === 'flag').length, reject: today.filter((r) => r.decision === 'reject').length };
  const pending = rows ? rows.filter((r) => !r.decision) : [];
  const highRisk = rows ? rows.filter((r) => r.risk?.level === 'high') : [];
  const timed = rows ? rows.filter((r) => typeof r.processingMs === 'number') : [];
  const avgMs = timed.length ? Math.round(timed.reduce((s, r) => s + r.processingMs, 0) / timed.length) : null;
  const days = useMemo(() => (rows ? lastNDays(rows, 7) : []), [rows]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="t-label">Verification operations</p>
          <h1 className="t-h1">Checkpoint {settings.checkpoint}</h1>
          <p className="mt-1 t-body-sm muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {user?.displayName}{isAdmin ? ' · all officers' : ''}</p>
        </div>
        <Link to="/screen" className="btn-primary sm:min-w-52"><ScanLine className="h-4 w-4" aria-hidden="true" />Screen document<Kbd>N</Kbd></Link>
      </div>

      {/* Today's activity: a metric strip, not tiles */}
      <section aria-labelledby="today-heading" className="border-y divider">
        <h2 id="today-heading" className="sr-only">Today's verification activity</h2>
        <div className="flex flex-wrap divide-x divide-[var(--border)]">
          <Metric label="Screened today" value={todayCounts.screened} loading={!rows} />
          <Metric label="Approved" value={todayCounts.accept} loading={!rows} />
          <Metric label="Review" value={todayCounts.flag} tone={todayCounts.flag ? 'status-warn' : undefined} loading={!rows} />
          <Metric label="Rejected" value={todayCounts.reject} tone={todayCounts.reject ? 'status-danger' : undefined} loading={!rows} />
          <Metric label="Pending review" value={pending.length} hint="no officer decision" tone={pending.length ? 'status-warn' : undefined} loading={!rows} />
          <Metric label="High-risk cases" value={highRisk.length} hint="risk score ≥ 60" tone={highRisk.length ? 'status-danger' : undefined} loading={!rows} />
          <Metric label="Avg. processing" value={avgMs === null ? '—' : `${(avgMs / 1000).toFixed(1)} s`} hint={timed.length ? `across ${timed.length} timed cases` : 'measured per case'} loading={!rows} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Pending reviews */}
        <Card title="Pending officer decisions" subtitle="Cases screened without a recorded decision" icon={Clock} padded={false} actions={<Link to="/investigations" className="btn-ghost btn-sm">All investigations<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}>
          {!rows ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : pending.length === 0 ? <div className="p-4"><EmptyState title="No pending decisions" body="Every screened case has an officer decision." /></div> : (
            <ul className="divide-y divider">
              {pending.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link to={`/investigations/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--surface-2)] sm:px-5">
                    <span className="t-code w-40 shrink-0 muted">{caseId(r)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.subjectName || 'Unknown subject'}</span><span className="block truncate t-caption">{DOCUMENT_TYPE_LABEL[r.documentType]} · {timeAgo(r.createdAt)}</span></span>
                    <AiDecisionBadge decision={r.aiDecision || r.fusion?.decision} prefix="System:" />
                    <RiskBadge level={r.risk?.level} score={r.risk?.score} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Decision distribution */}
        <Card title="Decision distribution" subtitle="Officer decisions, all time">
          {!rows ? <Skeleton className="h-24 w-full" /> : <HBars rows={[{ label: 'All cases', note: `${stats.total} total`, values: { accept: stats.byDecision.accept, flag: stats.byDecision.flag, reject: stats.byDecision.reject } }]} series={DECISION_SERIES} />}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {DECISION_SERIES.map((s) => <div key={s.key} className="rounded-sm bg-[var(--surface-2)] py-2"><dt className="t-caption">{s.label}</dt><dd className="t-num text-xl">{stats ? stats.byDecision[s.key] : '—'}</dd></div>)}
          </dl>
        </Card>
      </div>

      <Card title="Verification throughput" subtitle="Screenings per day, last 7 days">
        {!rows ? <Skeleton className="h-40 w-full" /> : <BarChart height={160} data={days.map((d) => ({ label: d.label, values: { total: d.rows.length } }))} series={[{ key: 'total', label: 'Screenings', color: VIZ.blue }]} showTable />}
      </Card>

      {/* Recent cases */}
      <Card title="Recent cases" subtitle={isAdmin ? 'Across all officers' : 'Your recent screenings'} padded={false} actions={<Link to="/history" className="btn-ghost btn-sm">Screening history<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}>
        {!rows ? <div className="p-4"><Skeleton className="h-32 w-full" /></div> : rows.length === 0 ? <div className="p-4"><EmptyState title="No cases yet" body="Screen a document to create the first case." action={<Link to="/screen" className="btn-primary btn-sm">Screen document</Link>} /></div> : (
          <Table minWidth={760}>
            <thead><tr><th>Case</th><th>Document</th><th>Subject</th><th>Assessment</th><th>Risk</th><th>Confidence</th><th>Decision</th><th>Time</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {rows.slice(0, 8).map((r) => (
                <tr key={r.id}>
                  <td className="t-code">{caseId(r)}</td>
                  <td>{DOCUMENT_TYPE_LABEL[r.documentType]}</td>
                  <td className="font-medium">{r.subjectName || 'Unknown'}</td>
                  <td><AiDecisionBadge decision={r.aiDecision || r.fusion?.decision} /></td>
                  <td><RiskBadge level={r.risk?.level} score={r.risk?.score} /></td>
                  <td className="num">{typeof r.confidence === 'number' ? `${r.confidence}%` : '—'}</td>
                  <td><DecisionBadge decision={r.decision} /></td>
                  <td className="muted whitespace-nowrap">{timeAgo(r.createdAt)}</td>
                  <td className="text-right"><Link to={`/history/${r.id}`} className="btn-ghost btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
