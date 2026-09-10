import { useEffect, useState } from 'react';
import { Settings, Cpu, Monitor, MapPin, Trash2, Info, Sun, Moon, Laptop, CheckCircle2, XCircle, Loader2, Keyboard } from 'lucide-react';
import { PageHeader, Card, Segmented, Toggle, Kbd, Badge } from '../components/ui/index.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PROVIDER_OPTIONS } from '../modules/registry.js';
import { isFirebaseConfigured } from '../lib/firebase.js';
import { isSupabaseConfigured, STORAGE_BUCKET } from '../services/storage.js';
import { demoStore } from '../services/demoStore.js';
import { cx } from '../lib/format.js';

const MODULES = [
  { key: 'ocr', label: 'OCR extraction' },
  { key: 'tamper', label: 'Tampering detection' },
  { key: 'face', label: 'Face verification' },
];

export default function SettingsPage() {
  const { settings, update, setProvider, reset } = useSettings();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const { isDemoMode } = useAuth();
  const [assets, setAssets] = useState(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    const checks = [
      ['OCR worker', `${base}ocr/worker.min.js`], ['OCR English data', `${base}ocr/lang/eng.traineddata.gz`],
      ['Face detector', `${base}models/ssd_mobilenetv1_model-weights_manifest.json`], ['Face recogniser', `${base}models/face_recognition_model-weights_manifest.json`],
    ];
    Promise.all(checks.map(async ([label, url]) => { try { const r = await fetch(url, { method: 'HEAD' }); return { label, ok: r.ok }; } catch { return { label, ok: false }; } })).then(setAssets);
  }, []);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Device-level preferences for this checkpoint console." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Appearance" icon={Monitor}>
          <Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: <span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5" />Light</span> }, { value: 'dark', label: <span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5" />Dark</span> }, { value: 'system', label: <span className="flex items-center gap-1"><Laptop className="h-3.5 w-3.5" />System</span> }]} />
          <div className="mt-3 divide-y divider">
            <Toggle checked={settings.captureGuide} onChange={(v) => update({ captureGuide: v })} label="Capture guides" hint="Show framing overlays and quality warnings when scanning" />
            <Toggle checked={settings.autoRunAfterCapture} onChange={(v) => update({ autoRunAfterCapture: v })} label="Auto-run after live capture" hint="Start processing immediately once a live photo is taken" />
            <Toggle checked={settings.compactTables} onChange={(v) => update({ compactTables: v })} label="Compact tables" hint="Denser rows in history and audit log" />
          </div>
        </Card>

        <Card title="Checkpoint" icon={MapPin}>
          <label className="label" htmlFor="cp">Checkpoint identifier</label>
          <input id="cp" className="input font-mono" value={settings.checkpoint} onChange={(e) => update({ checkpoint: e.target.value.toUpperCase() })} />
          <p className="mt-2 text-xs muted">Recorded on every screening created from this device. Used for admin breakdowns.</p>
        </Card>

        <Card title="Screening modules" subtitle="Each module is swappable; the UI is provider-agnostic" icon={Cpu} className="lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            {MODULES.map((m) => (
              <fieldset key={m.key}>
                <legend className="label">{m.label}</legend>
                <div className="space-y-2">
                  {PROVIDER_OPTIONS[m.key].map((o) => {
                    const disabled = o.cloud && !isFirebaseConfigured;
                    const active = settings.providers[m.key] === o.value;
                    return (
                      <button type="button" key={o.value} disabled={disabled} onClick={() => setProvider(m.key, o.value)} className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-500/10' : 'divider hover:bg-[var(--surface-2)]', disabled && 'opacity-50')}>
                        <span className={cx('mt-0.5 h-4 w-4 shrink-0 rounded-full border-2', active ? 'border-brand-600 bg-brand-600' : 'border-[var(--ink-3)]')} />
                        <span className="min-w-0"><span className="block text-sm font-medium">{o.label}</span><span className="block text-xs muted">{disabled ? 'Requires Firebase configuration' : o.hint}</span></span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </Card>

        <Card title="On-device model assets" subtitle="Self-hosted so screening works without internet" icon={Info}>
          <ul className="space-y-2 text-sm">
            {(assets || [{ label: 'Checking…' }]).map((a) => <li key={a.label} className="flex items-center gap-2">{a.ok === undefined ? <Loader2 className="h-4 w-4 animate-spin faint" /> : a.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}<span>{a.label}</span>{a.ok === false && <Badge tone="red">missing</Badge>}</li>)}
          </ul>
          <p className="mt-3 text-xs muted">Missing assets? Run <code className="font-mono">npm install</code> (copies them from node_modules into <code className="font-mono">public/</code>).</p>
        </Card>

        <Card title="Keyboard shortcuts" icon={Keyboard}>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {[['N', 'New screening'], ['G H', 'Home'], ['G Y', 'History'], ['G A', 'Admin'], ['A / F / R', 'Accept / Flag / Reject on results'], ['Esc', 'Close panels']].map(([k, l]) => <li key={k} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2"><span className="muted">{l}</span><span className="flex gap-1">{k.split(' ').map((x, i) => <Kbd key={i}>{x}</Kbd>)}</span></li>)}
          </ul>
        </Card>

        <Card title="Data" icon={Trash2} className="lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-medium">Environment</p><p className="text-xs muted">{isDemoMode ? 'Demo mode — screenings are stored in this browser only.' : `Connected to Firebase project ${import.meta.env.VITE_FIREBASE_PROJECT_ID}.`}</p><p className="text-xs muted">Image storage: {isDemoMode ? 'inline (browser)' : isSupabaseConfigured ? `Supabase private bucket "${STORAGE_BUCKET}" (signed URLs)` : 'NOT configured — images fall back to inline storage'}</p></div>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => { reset(); toast.info('Settings reset to defaults'); }}>Reset settings</button>
              {isDemoMode && <button className="btn-danger btn-sm" onClick={() => { if (confirm('Delete all demo screenings stored in this browser?')) { demoStore.clear('screenings'); toast.success('Demo data cleared'); } }}>Clear demo data</button>}
            </div>
          </div>
        </Card>
      </div>
      <p className="mt-6 flex items-center gap-1 text-xs faint"><Settings className="h-3 w-3" />BorderScreen v{__APP_VERSION__} · providers {settings.providers.ocr} / {settings.providers.tamper} / {settings.providers.face}</p>
    </div>
  );
}
