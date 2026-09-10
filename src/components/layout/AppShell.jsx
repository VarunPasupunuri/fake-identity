import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShieldCheck, ScanLine, History, LayoutDashboard, LogOut, Home, Menu, X, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { cx } from '../../lib/format.js';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/screen', label: 'New screening', icon: ScanLine },
  { to: '/history', label: 'History', icon: History },
  { to: '/admin', label: 'Admin', icon: LayoutDashboard, admin: true },
];

export default function AppShell() {
  const { user, isAdmin, signOut, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.admin || isAdmin);

  const onSignOut = async () => { await signOut(); navigate('/login'); };

  const link = ({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white');

  return (
    <div className="flex min-h-dvh bg-slate-50">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col bg-brand-900 text-white lg:flex">
        <Brand />
        <nav className="flex-1 space-y-1 px-3">
          {items.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}><n.icon className="h-5 w-5" />{n.label}</NavLink>)}
        </nav>
        <UserBlock user={user} onSignOut={onSignOut} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-brand-900 text-white shadow-xl">
            <div className="flex items-center justify-between pr-2"><Brand /><button className="p-2 text-slate-300" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-6 w-6" /></button></div>
            <nav className="flex-1 space-y-1 px-3">
              {items.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link} onClick={() => setOpen(false)}><n.icon className="h-5 w-5" />{n.label}</NavLink>)}
            </nav>
            <UserBlock user={user} onSignOut={onSignOut} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-6 w-6" /></button>
          <div className="flex items-center gap-2 lg:hidden"><ShieldCheck className="h-5 w-5 text-brand-600" /><span className="font-semibold">BorderScreen</span></div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {isDemoMode && <span className="badge bg-amber-100 text-amber-800"><FlaskConical className="h-3.5 w-3.5" />Demo mode · no Firebase</span>}
            <span className="hidden text-slate-500 sm:inline">{user?.checkpoint || 'Checkpoint'}</span>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-8 lg:px-8">
          <div className="mx-auto w-full max-w-6xl"><Outlet /></div>
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-brand-600' : 'text-slate-500')}>
              <n.icon className="h-5 w-5" />{n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      <ShieldCheck className="h-7 w-7 text-brand-500" />
      <div><p className="text-base font-bold leading-tight">BorderScreen</p><p className="text-[11px] text-slate-400">MHA · SSB · PS 26188</p></div>
    </div>
  );
}

function UserBlock({ user, onSignOut }) {
  return (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-semibold">{user?.displayName}</p>
      <p className="truncate text-xs text-slate-400">{user?.email} · {user?.role}</p>
      <button onClick={onSignOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
    </div>
  );
}
