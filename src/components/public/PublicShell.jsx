/**
 * PUBLIC SITE SHELL
 *
 * The header, navigation and footer shared by every page a visitor can reach
 * without signing in. Deliberately the same type scale, spacing and colour
 * tokens as the application behind it: a product whose website and console look
 * like two different pieces of software does not read as one.
 */
import { useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from '../brand/Logo.jsx';
import { cx } from '../../lib/format.js';

export const PUBLIC_NAV = [
  { to: '/about', label: 'About' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/features', label: 'Features' },
  { to: '/supported-documents', label: 'Documents' },
  { to: '/security', label: 'Security' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

export default function PublicShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="sticky top-0 z-30 border-b divider bg-[var(--surface)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 page-gutter">
          <Link to="/" className="shrink-0" aria-label="Identity Sentinel — home"><Logo size="md" /></Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Site">
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.to} to={n.to}
                className={({ isActive }) => cx('rounded-sm px-3 py-2 text-sm transition-colors', isActive ? 'font-medium text-[var(--ink)]' : 'muted hover:text-[var(--ink)]')}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Link to="/login" className="btn-secondary btn-sm hidden sm:inline-flex">Sign in</Link>
            <button type="button" className="btn-ghost btn-icon lg:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}>
              {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="border-t divider lg:hidden" aria-label="Site">
            <div className="mx-auto max-w-7xl page-gutter py-2">
              {PUBLIC_NAV.map((n) => (
                <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)}
                  className={({ isActive }) => cx('block rounded-sm px-2 py-2.5 text-sm', isActive ? 'font-medium text-[var(--ink)]' : 'muted')}>
                  {n.label}
                </NavLink>
              ))}
              <Link to="/login" onClick={() => setOpen(false)} className="btn-secondary mt-2 w-full">Sign in</Link>
            </div>
          </nav>
        )}
      </header>

      <main key={pathname} className="flex-1">
        <Outlet />
      </main>

      <PublicFooter />
    </div>
  );
}

/** Page heading used at the top of every inner public page. */
export function PageIntro({ eyebrow, title, lede }) {
  return (
    <section className="border-b divider bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl page-gutter py-14 md:py-20">
        {eyebrow && <p className="t-label">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl t-display">{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-base leading-relaxed muted">{lede}</p>}
      </div>
    </section>
  );
}

/** A standard content band, so vertical rhythm is the same on every page. */
export function Section({ title, lede, children, bordered = false }) {
  return (
    <section className={cx('py-14 md:py-20', bordered && 'border-t divider')}>
      <div className="mx-auto max-w-7xl page-gutter">
        {title && <h2 className="max-w-3xl t-h1">{title}</h2>}
        {lede && <p className="mt-3 max-w-2xl text-base leading-relaxed muted">{lede}</p>}
        {(title || lede) && children && <div className="mt-10">{children}</div>}
        {!title && !lede && children}
      </div>
    </section>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t divider bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl page-gutter py-12">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Logo size="md" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed muted">
              Document verification for teams who have to decide whether an identity document in front of them is genuine.
            </p>
          </div>

          <FooterColumn title="Product" links={[
            { to: '/features', label: 'Features' },
            { to: '/how-it-works', label: 'How it works' },
            { to: '/supported-documents', label: 'Supported documents' },
          ]} />
          <FooterColumn title="Company" links={[
            { to: '/about', label: 'About us' },
            { to: '/contact', label: 'Contact' },
            { to: '/faq', label: 'FAQ' },
          ]} />
          <FooterColumn title="Trust" links={[
            { to: '/security', label: 'Security' },
            { to: '/login', label: 'Sign in' },
          ]} />
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t divider pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-caption">© {new Date().getFullYear()} Identity Sentinel. All rights reserved.</p>
          <p className="t-caption">
            Identity Sentinel analyses documents. It does not itself confirm a record with an issuing authority.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <p className="t-label">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.to}><Link to={l.to} className="text-sm muted hover:text-[var(--ink)]">{l.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
