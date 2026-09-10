import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Users, Download, ShieldAlert, Files, Flag, Gauge, CheckCircle2, XCircle, Clock, MapPin, Activity, UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listScreenings, computeStats } from '../services/screenings.js';
import { listUsers, setUserRole } from '../services/auth.js';
import { Stat, Card, Skeleton, EmptyState, PageHeader, Tabs, Avatar, Badge } from '../components/ui/index.jsx';
import { BarChart, Donut, HBars, VIZ, Sparkline } from '../components/charts/index.jsx';
import { ScreeningTable, useScreeningFilters, exportCsv } from './HistoryPage.jsx';
import { DOCUMENT_TYPE_LABEL } from '../modules/types.js';
import { lastNDays } from '../lib/format.js';

const DECISION_SERIES = [
  { key: 'accept', label: 'Accepted', color: VIZ.good, icon: CheckCircle2 },
  { key: 'flag', label: 'Flagged', color: VIZ.warn, icon: Flag },
  { key: 'reject', label: 'Rejected', color: VIZ.crit, icon: XCircle },
];

export default function AdminPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState('overview');
  useEffect(() => { listScreenings({ user, mine: false, max: 1000 }).then(setRows).catch(() => setRows([])); }, [user]);
  const stats = rows ? computeStats(rows) : null;
  const days = useMemo(() => (rows ? lastNDays(rows, 14) : []), [rows]);

  const byOfficer = useMemo(() => {
    if (!rows) return [];
    const m = {};
    for (const r of rows) { const k = r.officerName || r.officerId; m[k] = m[k] || { name: k, total: 0, flagged: 0, risk: 0, last: null }; m[k].total++; if (r.decision === 'flag' || r.decision === 'reject') m[k].flagged++; m[k].risk += r.risk?.score || 0; if (!m[k].last || r.createdAt > m[k].last) m[k].last = r.createdAt; }
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [rows]);

  return (
    <div>
      <PageHeader title="Administration" subtitle={rows ? `All checkpoints · ${rows.length} cases loaded` : 'Loading…'} actions={<button className="btn-secondary btn-sm" disabled={!rows?.length} onClick={() => exportCsv(rows, `audit-${new Date().toISOString().slice(0, 10)}.csv`)}><Download className="h-4 w-4" aria-hidden="true" />Export CSV</button>} />
      <Tabs className="mb-5 max-w-xl" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview', icon: LayoutDashboard }, { value: 'audit', label: 'Audit log', icon: Files, count: rows?.length }, { value: 'officers', label: 'Officers', icon: Users }, { value: 'users', label: 'Users & roles', icon: UserCog }]} />

      {tab === 'overview' && (
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label="Documents screened" value={stats?.total ?? '—'} hint={`${stats?.todayCount ?? 0} today`} icon={Files} loading={!rows} spark={<Sparkline values={days.map((d) => d.rows.length)} />} />
            <Stat label="Flagged / rejected" value={stats ? `${stats.flaggedPct}%` : '—'} hint={stats ? `${stats.byDecision.flag} flagged · ${stats.byDecision.reject} rejected` : ''} icon={Flag} loading={!rows} tone={stats?.flaggedPct > 25 ? 'text-amber-600' : undefined} />
            <Stat label="High risk" value={stats?.byLevel.high ?? '—'} hint={stats ? `${stats.byLevel.medium} medium · ${stats.byLevel.low} low` : ''} icon={ShieldAlert} loading={!rows} tone={stats?.byLevel.high ? 'text-red-600' : undefined} />
            <Stat label="Avg. risk score" value={stats?.avgRisk ?? '—'} hint="0 clean · 100 certain forgery" icon={Gauge} loading={!rows} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Screenings — last 14 days" subtitle="By officer decision" className="lg:col-span-2" icon={Activity}>
              {!rows ? <Skeleton className="h-52 w-full" /> : <BarChart height={210} data={days.map((d) => ({ label: d.label === 'Today' ? 'Today' : new Date(d.iso).getDate().toString(), values: { accept: d.rows.filter((r) => r.decision === 'accept').length, flag: d.rows.filter((r) => r.decision === 'flag').length, reject: d.rows.filter((r) => r.decision === 'reject').length } }))} series={DECISION_SERIES} showTable />}
            </Card>
            <Card title="Risk distribution" subtitle="Computed before the officer decided" icon={Gauge}>
              {!rows ? <Skeleton className="h-52 w-full" /> : <Donut size={150} slices={[{ key: 'low', label: 'Low (<30)', value: stats.byLevel.low, color: VIZ.good, icon: CheckCircle2 }, { key: 'medium', label: 'Medium (30–59)', value: stats.byLevel.medium, color: VIZ.warn, icon: Flag }, { key: 'high', label: 'High (≥60)', value: stats.byLevel.high, color: VIZ.crit, icon: ShieldAlert }]} />}
            </Card>
            <Card title="By document type" icon={Files}>
              {!rows ? <Skeleton className="h-40 w-full" /> : <HBars rows={Object.entries(stats.byType).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => ({ label: DOCUMENT_TYPE_LABEL[k] || k, note: `${v.total ? Math.round((v.flagged / v.total) * 100) : 0}% flagged`, values: { ok: v.total - v.flagged, flagged: v.flagged } }))} series={[{ key: 'ok', label: 'Accepted / pending', color: VIZ.blue }, { key: 'flagged', label: 'Flagged / rejected', color: VIZ.crit, icon: Flag }]} />}
            </Card>
            <Card title="By checkpoint" icon={MapPin}>
              {!rows ? <Skeleton className="h-40 w-full" /> : <HBars rows={Object.entries(stats.byCheckpoint).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => ({ label: k, note: `${v.total ? Math.round((v.flagged / v.total) * 100) : 0}% flagged`, values: { ok: v.total - v.flagged, flagged: v.flagged } }))} series={[{ key: 'ok', label: 'Accepted / pending', color: VIZ.blue }, { key: 'flagged', label: 'Flagged / rejected', color: VIZ.crit, icon: Flag }]} />}
            </Card>
            <Card title="Decisions" icon={Clock}>
              {!rows ? <Skeleton className="h-40 w-full" /> : <Donut size={130} slices={[...DECISION_SERIES.map((s) => ({ ...s, value: stats.byDecision[s.key] })), { key: 'pending', label: 'Pending', value: stats.byDecision.pending, color: VIZ.muted, icon: Clock }]} />}
            </Card>
          </div>
        </div>
      )}

      {tab === 'audit' && <AuditLog rows={rows} compact={settings.compactTables} />}

      {tab === 'officers' && (
        <Card title="Officer activity" subtitle="Volume, flag rate and average risk per officer" icon={Users} padded={false}>
          {!rows ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : byOfficer.length === 0 ? <div className="p-5"><EmptyState icon={Users} title="No activity yet" /></div> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-[11px] font-semibold uppercase tracking-wider faint"><tr><th className="px-4 py-2.5">Officer</th><th className="px-4 py-2.5">Screenings</th><th className="px-4 py-2.5">Flag rate</th><th className="px-4 py-2.5">Avg. risk</th><th className="px-4 py-2.5">Last active</th></tr></thead>
              <tbody className="divide-y divider">{byOfficer.map((o) => <tr key={o.name}><td className="flex items-center gap-2 px-4 py-2.5"><Avatar name={o.name} size="sm" /><span className="font-medium">{o.name}</span></td><td className="px-4 py-2.5 tabular-nums">{o.total}</td><td className="px-4 py-2.5 tabular-nums">{Math.round((o.flagged / o.total) * 100)}%</td><td className="px-4 py-2.5 tabular-nums">{Math.round(o.risk / o.total)}</td><td className="px-4 py-2.5 text-xs muted">{o.last ? new Date(o.last).toLocaleString() : '—'}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'users' && <UsersPanel />}
    </div>
  );
}

function AuditLog({ rows, compact }) {
  const { filtered, pageRows, controls, pagination } = useScreeningFilters(rows, 25);
  return (
    <Card title="Audit log" subtitle="Searchable record of every screening, officer and decision" icon={Files} padded={false} actions={<button className="btn-secondary btn-sm" disabled={!filtered.length} onClick={() => exportCsv(filtered)}><Download className="h-4 w-4" />CSV ({filtered.length})</button>}>
      <div className="border-b divider p-4">{controls}</div>
      {!rows ? <div className="p-5"><Skeleton className="h-40 w-full" /></div> : filtered.length === 0 ? <div className="p-5"><EmptyState icon={LayoutDashboard} title="No matching screenings" /></div> : <><ScreeningTable rows={pageRows} showOfficer compact={compact} />{pagination}</>}
    </Card>
  );
}

function UsersPanel() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { listUsers().then(setUsers).catch((e) => { toast.error('Could not load users', e.message); setUsers([]); }); }, [toast]);
  const change = async (u, role) => {
    setBusy(u.uid);
    try { await setUserRole(u.uid, role, u.checkpoint); setUsers((all) => all.map((x) => (x.uid === u.uid ? { ...x, role } : x))); toast.success(`${u.displayName || u.email} is now ${role}`); }
    catch (e) { toast.error('Role change failed', e.message); } finally { setBusy(null); }
  };
  return (
    <Card title="Users & roles" subtitle="Officers can screen; admins can also view all records and manage users" icon={UserCog} padded={false}>
      {!users ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : (
        <ul className="divide-y divider">
          {users.map((u) => (
            <li key={u.uid} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={u.displayName || u.email} size="sm" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{u.displayName || u.email}{u.uid === me.uid && <span className="ml-2 text-xs font-normal faint">(you)</span>}</p><p className="truncate text-xs muted">{u.email} · {u.checkpoint || 'no checkpoint'}</p></div>
              <Badge tone={u.role === 'admin' ? 'blue' : 'slate'}>{u.role}</Badge>
              <select className="input min-h-9 w-auto py-1 text-xs" value={u.role} disabled={busy === u.uid || u.uid === me.uid} onChange={(e) => change(u, e.target.value)}><option value="officer">officer</option><option value="admin">admin</option></select>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
