import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ScanLine, History, LayoutDashboard, LogOut, Menu, X, Settings, Sun, Moon, WifiOff, ChevronsLeft, ChevronsRight, FolderSearch, FileText, ShieldCheck, FlaskConical, MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { Avatar, useOnline, Kbd } from '../ui/index.jsx';
import Logo, { LogoMark } from '../brand/Logo.jsx';
import { cx } from '../../lib/format.js';

/** Workflow-ordered navigation. `group` separates operations from system sections. */
const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, group: 'Operations', mobile: true },
  { to: '/screen', label: 'Screen document', short: 'Screen', icon: ScanLine, group: 'Operations', mobile: true, kbd: 'N' },
  { to: '/history', label: 'Screening history', short: 'History', icon: History, group: 'Operations', mobile: true },
  { to: '/investigations', label: 'Investigations', short: 'Cases', icon: FolderSearch, group: 'Operations', mobile: true },
  { to: '/reports', label: 'Reports', icon: FileText, group: 'Operations' },
  { to: '/admin', label: 'Administration', icon: ShieldCheck, group: 'System', admin: true },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'System' },
];

const NAV_KEY = 'identity-sentinel:nav';

export default function AppShell() {
  const { user, isAdmin, signOut, isDemoMode } = useAuth();
  const { isDark, toggle } = useTheme();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(NAV_KEY) === 'collapsed'; } catch { return false; } });
  const items = NAV.filter((n) => !n.admin || isAdmin);
  const groups = [...new Set(items.map((n) => n.group))];

  useEffect(() => { try { localStorage.setItem(NAV_KEY, collapsed ? 'collapsed' : 'open'); } catch { /* ignore */ } }, [collapsed]);

  // Keyboard: n → new screening; g then h/s/y/i/r/a/, → navigate
  useEffect(() => {
    let pendingG = false;
    const fn = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'g') { pendingG = true; setTimeout(() => { pendingG = false; }, 800); return; }
      if (pendingG) { const map = { h: '/', s: '/screen', y: '/history', i: '/investigations', r: '/reports', a: '/admin', ',': '/settings' }; if (map[e.key]) navigate(map[e.key]); pendingG = false; return; }
      if (e.key === 'n') navigate('/screen');
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [navigate]);

  const onSignOut = async () => { await signOut(); navigate('/login'); };

  const link = ({ isActive }) => cx('flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm transition-colors', isActive ? 'bg-[var(--brand-soft)] font-medium text-[var(--ink)]' : 'muted hover:bg-[var(--surface-2)] hover:text-[var(--ink)]', collapsed && 'justify-center px-0');

  const Nav = ({ mobile = false }) => (
    <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Primary">
      {groups.map((g) => (
        <div key={g} className="mb-4">
          {(!collapsed || mobile) && <p className="mb-1 px-2.5 t-label">{g}</p>}
          <ul className="space-y-0.5">
            {items.filter((n) => n.group === g).map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className={link} onClick={() => setOpen(false)} title={collapsed && !mobile ? n.label : undefined} aria-label={collapsed && !mobile ? n.label : undefined}>
                  <n.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {(!collapsed || mobile) && <span className="flex-1 truncate">{n.label}</span>}
                  {(!collapsed || mobile) && n.kbd && <Kbd>{n.kbd}</Kbd>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const UserBlock = ({ mobile = false }) => (
    <div className="border-t divider p-3">
      <div className={cx('flex items-center gap-2.5', collapsed && !mobile && 'justify-center')}>
        <Avatar name={user?.displayName} size="sm" />
        {(!collapsed || mobile) && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.displayName}</p><p className="truncate t-caption">{user?.role} · {settings.checkpoint}</p></div>}
        {(!collapsed || mobile) && <button onClick={onSignOut} className="btn-ghost btn-icon" title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
      {!mobile && <button onClick={() => setCollapsed((c) => !c)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm py-1.5 t-caption hover:bg-[var(--surface-2)]" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden="true" /> : <><ChevronsLeft className="h-4 w-4" aria-hidden="true" />Collapse</>}</button>}
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop / tablet rail */}
      <aside className={cx('sticky top-0 hidden h-dvh shrink-0 flex-col border-r divider bg-[var(--surface)] transition-[width] duration-150 md:flex', collapsed ? 'w-16' : 'w-60')}>
        <div className={cx('flex h-14 items-center border-b divider px-4', collapsed && 'justify-center px-0')}>
          {collapsed ? <LogoMark size={22} className="text-[var(--brand)]" /> : <Logo size="sm" />}
        </div>
        <Nav />
        <UserBlock />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[rgba(17,19,22,0.45)] animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overlay rounded-none">
            <div className="flex h-14 items-center justify-between border-b divider px-4"><Logo size="sm" /><button className="btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" aria-hidden="true" /></button></div>
            <Nav mobile />
            <UserBlock mobile />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: context, not chrome */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b divider bg-[var(--surface)] page-gutter">
          <button className="btn-ghost btn-icon md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" aria-hidden="true" /></button>
          <span className="md:hidden"><Logo size="sm" /></span>
          <div className="ml-auto flex items-center gap-2">
            {!online && <span className="badge badge-danger"><WifiOff className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Offline</span></span>}
            {isDemoMode && <span className="badge badge-warn"><FlaskConical className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Demo environment</span></span>}
            <span className="hidden t-caption sm:inline">Checkpoint <span className="t-code text-[var(--ink)]">{settings.checkpoint}</span></span>
            <button onClick={toggle} className="btn-ghost btn-icon" aria-label="Toggle theme" title="Toggle theme">{isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}</button>
          </div>
        </header>

        <main className="flex-1 page-gutter pb-24 pt-6 md:pb-10">
          <div className="mx-auto w-full max-w-7xl"><Outlet /></div>
        </main>

        {/* Mobile bottom tabs */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 sticky-bar pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Primary">
          <div className="grid grid-cols-5">
            {items.filter((n) => n.mobile).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-[var(--brand)]' : 'muted')}>
                <n.icon className="h-5 w-5" aria-hidden="true" />{n.short || n.label}
              </NavLink>
            ))}
            <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium muted"><MoreHorizontal className="h-5 w-5" aria-hidden="true" />More</button>
          </div>
        </nav>
      </div>
    </div>
  );
}
