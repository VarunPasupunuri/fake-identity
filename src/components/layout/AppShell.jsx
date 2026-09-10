import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, ScanLine, History, LayoutDashboard, LogOut, Home, Menu, X, FlaskConical, Settings, Sun, Moon, WifiOff, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { Avatar, useOnline, Kbd } from '../ui/index.jsx';
import { cx } from '../../lib/format.js';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/screen', label: 'Screen', icon: ScanLine, primary: true },
  { to: '/history', label: 'History', icon: History },
  { to: '/admin', label: 'Admin', icon: LayoutDashboard, admin: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppShell() {
  const { user, isAdmin, signOut, isDemoMode } = useAuth();
  const { isDark, toggle } = useTheme();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('borderscreen:nav') === 'collapsed'; } catch { return false; } });
  const items = NAV.filter((n) => !n.admin || isAdmin);

  useEffect(() => { try { localStorage.setItem('borderscreen:nav', collapsed ? 'collapsed' : 'open'); } catch { /* ignore */ } }, [collapsed]);

  // Global shortcuts: g h / g s / g y / g a, and "n" for new screening
  useEffect(() => {
    let pendingG = false;
    const fn = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'g') { pendingG = true; setTimeout(() => { pendingG = false; }, 800); return; }
      if (pendingG) { const map = { h: '/', s: '/screen', y: '/history', a: '/admin', ',': '/settings' }; if (map[e.key]) navigate(map[e.key]); pendingG = false; return; }
      if (e.key === 'n') navigate('/screen');
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [navigate]);

  const onSignOut = async () => { await signOut(); navigate('/login'); };

  const linkCls = ({ isActive }) => cx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white', collapsed && 'justify-center px-0');

  const SidebarContent = ({ mobile = false }) => (
    <>
      <div className={cx('flex items-center gap-3 px-4 py-5', collapsed && !mobile && 'justify-center px-0')}>
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/40"><ShieldCheck className="h-5 w-5" /></span>
        {(!collapsed || mobile) && <div className="min-w-0"><p className="truncate text-base font-bold leading-tight text-white">BorderScreen</p><p className="truncate text-[11px] text-slate-400">MHA · SSB · PS 26188</p></div>}
        {mobile && <button className="ml-auto rounded-lg p-2 text-slate-400 hover:text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>}
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} onClick={() => setOpen(false)} title={n.label}>
            {({ isActive }) => (<>
              {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
              <n.icon className={cx('h-5 w-5 shrink-0', n.primary && !isActive && 'text-brand-400')} />
              {(!collapsed || mobile) && <span className="flex-1">{n.label}</span>}
              {(!collapsed || mobile) && n.primary && <Kbd>N</Kbd>}
            </>)}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className={cx('flex items-center gap-3 rounded-xl px-2 py-2', collapsed && !mobile && 'justify-center px-0')}>
          <Avatar name={user?.displayName} size="sm" />
          {(!collapsed || mobile) && <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{user?.displayName}</p><p className="truncate text-[11px] text-slate-400">{user?.role} · {settings.checkpoint}</p></div>}
          {(!collapsed || mobile) && <button onClick={onSignOut} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>}
        </div>
        {!mobile && <button onClick={() => setCollapsed((c) => !c)} className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-slate-500 hover:bg-white/5 hover:text-white">{collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}</button>}
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className={cx('sticky top-0 hidden h-dvh shrink-0 flex-col bg-brand-900 transition-[width] duration-200 lg:flex', collapsed ? 'w-[72px]' : 'w-64')}><SidebarContent /></aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-brand-900 shadow-2xl"><SidebarContent mobile /></aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b divider glass px-3 sm:px-6">
          <button className="btn-ghost btn-icon lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <Link to="/" className="flex items-center gap-2 lg:hidden"><ShieldCheck className="h-5 w-5 text-brand-500" /><span className="font-bold">BorderScreen</span></Link>
          <button onClick={() => navigate('/history')} className="ml-2 hidden min-h-9 items-center gap-2 rounded-lg border divider bg-[var(--surface-2)] px-3 text-xs muted hover:text-[var(--ink)] md:flex"><Search className="h-3.5 w-3.5" />Search screenings…<span className="ml-4 flex gap-1"><Kbd>G</Kbd><Kbd>Y</Kbd></span></button>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {!online && <span className="badge bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"><WifiOff className="h-3.5 w-3.5" /><span className="hidden sm:inline">Offline</span></span>}
            {isDemoMode && <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><FlaskConical className="h-3.5 w-3.5" /><span className="hidden sm:inline">Demo mode</span></span>}
            <span className="hidden rounded-lg border divider px-2 py-1 font-mono text-[11px] muted sm:inline">{settings.checkpoint}</span>
            <button onClick={toggle} className="btn-ghost btn-icon" aria-label="Toggle theme" title="Toggle theme">{isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-7xl"><Outlet /></div>
        </main>

        <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t divider glass pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition', isActive ? 'text-brand-600 dark:text-brand-300' : 'muted')}>
                {n.primary ? <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/40 ring-4 ring-[var(--bg)]"><n.icon className="h-6 w-6" /></span> : <n.icon className="h-5 w-5" />}
                {n.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
