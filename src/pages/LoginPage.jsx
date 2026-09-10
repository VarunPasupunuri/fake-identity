import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { DEMO_USERS } from '../services/auth.js';
import { useToast } from '../context/ToastContext.jsx';
import Logo, { LogoMark, PRODUCT_TAGLINE } from '../components/brand/Logo.jsx';
import { Alert } from '../components/ui/index.jsx';

export default function LoginPage() {
  const { signIn, isDemoMode } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = await signIn(email, password);
      toast.success(`Signed in as ${u.displayName || u.email}`);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Statement panel */}
      <section className="hidden flex-col justify-between border-r divider bg-[var(--surface)] p-10 md:flex lg:p-14">
        <Logo size="md" />
        <div className="max-w-md">
          <LogoMark size={56} className="mb-8 text-[var(--brand)]" />
          <h1 className="t-display">Secure document verification for identity screening teams.</h1>
          <p className="mt-4 t-body muted">Extract, validate and compare identity documents, review evidence-based risk assessments, and keep a complete case record for every decision.</p>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 t-body-sm">
            {[['Document extraction', 'Printed fields and machine readable zone'], ['Consistency checks', 'Formats, expiry, check digits, cross-zone agreement'], ['Integrity analysis', 'Image alteration and metadata forensics'], ['Face comparison', 'Live capture against the document photo'], ['Watchlist screening', 'Configured list, provider-based'], ['Evidence-based assessment', 'Risk, confidence and a full evidence trail']].map(([t, d]) => (
              <div key={t}><dt className="font-medium text-[var(--ink)]">{t}</dt><dd className="muted">{d}</dd></div>
            ))}
          </dl>
        </div>
        <p className="t-caption">Smart India Hackathon 2026 · Problem statement 26188 · Ministry of Home Affairs</p>
      </section>

      {/* Sign-in */}
      <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 md:hidden"><Logo size="md" tagline /></div>
          <h2 className="t-h1">Sign in</h2>
          <p className="mt-1 t-body-sm muted">{PRODUCT_TAGLINE}</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="officer@agency.gov.in" /></div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative"><input id="password" className="input pr-11" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 btn-ghost btn-icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button></div>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Sign in'}</button>
          </form>
          {isDemoMode && (
            <div className="mt-6 border-t divider pt-5">
              <p className="t-label">Demo environment</p>
              <p className="mt-1 t-caption">Firebase is not configured. Use a demonstration account (password <span className="t-code">demo1234</span>).</p>
              <ul className="mt-3 divide-y divider hairline rounded-md">
                {DEMO_USERS.map((u) => (
                  <li key={u.uid}>
                    <button type="button" className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]" onClick={() => { setEmail(u.email); setPassword(u.password); }}>
                      <span><span className="block font-medium">{u.displayName}</span><span className="block t-code muted">{u.email}</span></span><span className="badge badge-neutral">{u.role}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-8 t-caption">Authorised personnel only. All activity is recorded in the audit log.</p>
        </div>
      </section>
    </div>
  );
}
