import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { DEMO_USERS } from '../services/auth.js';

export default function LoginPage() {
  const { signIn, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await signIn(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-brand-900 lg:flex-row">
      <div className="flex flex-1 flex-col justify-center px-6 py-10 text-white lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3"><ShieldCheck className="h-10 w-10 text-brand-500" /><div><h1 className="text-2xl font-bold">BorderScreen</h1><p className="text-sm text-slate-400">AI-Based Fake Identity & Document Screening</p></div></div>
          <ul className="space-y-3 text-sm text-slate-300">
            <li>• OCR extraction of passports, visas, IDs, licences and permits</li>
            <li>• Format, expiry and MRZ checksum validation</li>
            <li>• Tampering detection with region-level evidence</li>
            <li>• Live face verification against the document photo</li>
            <li>• Single risk score with a full audit trail</li>
          </ul>
          <p className="mt-8 text-xs text-slate-500">Ministry of Home Affairs · Sashastra Seema Bal · SIH PS 26188</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-t-3xl bg-white px-6 py-10 lg:rounded-none lg:px-16">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Officer sign in</h2>
          <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="officer@ssb.gov.in" /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}</button>
          {isDemoMode && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Demo mode — Firebase not configured</p>
              <p className="mt-1">Use a demo account (password <code>demo1234</code>):</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEMO_USERS.map((u) => <button type="button" key={u.uid} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-mono hover:bg-amber-100" onClick={() => { setEmail(u.email); setPassword(u.password); }}>{u.email} ({u.role})</button>)}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
