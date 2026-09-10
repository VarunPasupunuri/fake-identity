import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Loader2, ScanText, ListChecks, ShieldAlert, ScanFace, Gauge, Eye, EyeOff, FlaskConical } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { DEMO_USERS } from '../services/auth.js';
import { useToast } from '../context/ToastContext.jsx';

const FEATURES = [
  { icon: ScanText, title: 'OCR extraction', body: 'Passports, visas, IDs, licences, permits — MRZ aware.' },
  { icon: ListChecks, title: 'Rule validation', body: 'ICAO check digits, expiry, formats, cross-zone consistency.' },
  { icon: ShieldAlert, title: 'Tampering detection', body: 'Error-level analysis and metadata forensics with evidence.' },
  { icon: ScanFace, title: 'Face verification', body: 'Live capture matched against the document photo.' },
  { icon: Gauge, title: 'Risk score', body: 'One explainable score to accept, flag, or reject fast.' },
];

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
      toast.success(`Welcome back, ${u.displayName?.split(' ')[0] || 'officer'}`);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
          <div className="flex items-center gap-3 animate-fade-in">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/40"><ShieldCheck className="h-6 w-6" /></span>
            <div><p className="text-lg font-bold leading-tight">BorderScreen</p><p className="text-xs text-slate-400">AI-Based Fake Identity & Document Screening</p></div>
          </div>
          <div className="my-10 max-w-xl animate-slide-up">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">Ministry of Home Affairs · Sashastra Seema Bal · SIH PS 26188</p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">Screen a traveller's document in <span className="bg-gradient-to-r from-brand-300 to-cyan-300 bg-clip-text text-transparent">under a minute.</span></h1>
            <p className="mt-4 text-base text-slate-300">Scan, verify, and decide with a complete digital trail for every checkpoint.</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f, i) => (
                <li key={f.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm animate-slide-up" style={{ animationDelay: `${120 + i * 60}ms` }}>
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                  <div><p className="text-sm font-semibold">{f.title}</p><p className="text-xs text-slate-400">{f.body}</p></div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">Runs on tablets and handheld scanners · works offline for on-device modules</p>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5 animate-slide-up">
          <div><h2 className="text-2xl font-bold tracking-tight">Officer sign in</h2><p className="mt-1 text-sm muted">Use your issued credentials to access the checkpoint console.</p></div>
          <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="officer@ssb.gov.in" /></div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <div className="relative"><input id="password" className="input pr-11" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 faint hover:text-[var(--ink)]" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}</button>
          {isDemoMode && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="flex items-center gap-1.5 font-semibold"><FlaskConical className="h-3.5 w-3.5" />Demo mode — Firebase not configured</p>
              <p className="mt-1">Tap an account to fill the form (password <code className="font-mono">demo1234</code>).</p>
              <div className="mt-2 grid gap-2">
                {DEMO_USERS.map((u) => (
                  <button type="button" key={u.uid} className="flex items-center justify-between rounded-lg border border-amber-300/60 bg-white/70 px-3 py-2 text-left hover:bg-white dark:bg-white/5 dark:hover:bg-white/10" onClick={() => { setEmail(u.email); setPassword(u.password); }}>
                    <span><span className="block font-semibold">{u.displayName}</span><span className="font-mono opacity-80">{u.email}</span></span><span className="badge bg-amber-200/70 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">{u.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-center text-[11px] faint">Authorised personnel only. All activity is logged.</p>
        </form>
      </section>
    </div>
  );
}
