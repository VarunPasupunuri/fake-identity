import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, FlaskConical, FileImage, ScanFace, Cpu, Gauge, RotateCcw, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useScreeningPipeline } from '../hooks/useScreeningPipeline.js';
import { createScreening, recordDecision } from '../services/screenings.js';
import DocumentUpload from '../components/screening/DocumentUpload.jsx';
import LivePhotoCapture from '../components/screening/LivePhotoCapture.jsx';
import ProcessingSteps from '../components/screening/ProcessingSteps.jsx';
import ResultsView from '../components/screening/ResultsView.jsx';
import DecisionBar from '../components/screening/DecisionBar.jsx';
import { PageHeader } from '../components/ui/index.jsx';
import { resolveProviders } from '../modules/registry.js';
import { cx } from '../lib/format.js';

const STEPS = [
  { label: 'Document', icon: FileImage },
  { label: 'Live photo', icon: ScanFace },
  { label: 'Processing', icon: Cpu },
  { label: 'Results', icon: Gauge },
];

export default function ScreeningPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const pipeline = useScreeningPipeline();
  const [step, setStep] = useState(0);
  const [documentType, setDocumentType] = useState('passport');
  const [docImage, setDocImage] = useState(null);
  const [liveImage, setLiveImage] = useState(null);
  const [useMock, setUseMock] = useState(false);
  const [scenario, setScenario] = useState('clean');
  const [screeningId, setScreeningId] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [decided, setDecided] = useState(null);
  const startedRef = useRef(false);
  const providers = useMock ? { ocr: 'mock', tamper: 'mock', face: 'mock' } : resolveProviders({ providers: settings.providers });

  const start = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStep(2);
    setSaveError('');
    const out = await pipeline.run({ documentType, documentImage: docImage.dataUrl, documentFile: docImage.file, liveImage: liveImage?.dataUrl, options: { useMock, scenario, providers: settings.providers } });
    if (!out) { startedRef.current = false; return; }
    try {
      const id = await createScreening({ user: { ...user, checkpoint: settings.checkpoint }, documentType, images: { document: docImage.dataUrl, live: liveImage?.dataUrl }, ...out });
      setScreeningId(id);
    } catch (e) {
      console.error(e);
      setSaveError(`Could not save screening: ${e.message}`);
      toast.error('Screening not saved', e.message);
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const decide = async ({ decision, note }) => {
    if (!screeningId) return;
    await recordDecision(screeningId, { decision, note });
    setDecided(decision);
    toast.success(`Decision recorded: ${decision}`, 'Saved to the audit trail.');
    setTimeout(() => navigate(`/history/${screeningId}`), 700);
  };

  const restart = () => { pipeline.reset(); startedRef.current = false; setStep(0); setDocImage(null); setLiveImage(null); setScreeningId(null); setDecided(null); setSaveError(''); };

  // Auto-run after live capture when enabled in settings
  useEffect(() => { if (settings.autoRunAfterCapture && step === 1 && liveImage && docImage) start(); }, [liveImage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => pipeline.reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader title="New screening" subtitle="Scan the document, capture a live photo, review the evidence and decide."
        actions={step < 2 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border divider bg-[var(--surface)] px-3"><input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} className="h-4 w-4 accent-brand-600" /><FlaskConical className="h-4 w-4 faint" />Mock outputs</label>
            {useMock && <select className="input min-h-10 w-auto py-1.5 text-xs" value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="clean">Scenario: genuine document</option><option value="suspicious">Scenario: forged document</option></select>}
            {!useMock && <Link to="/settings" className="btn-ghost btn-sm">Providers: <span className="font-mono">{providers.ocr}/{providers.tamper}/{providers.face}</span><ExternalLink className="h-3 w-3" /></Link>}
          </div>
        )} />

      <Stepper step={step} />

      <div className="mt-6" key={step}>
        {step === 0 && <div className="animate-fade-in"><DocumentUpload documentType={documentType} onDocumentType={setDocumentType} image={docImage} onImage={setDocImage} onNext={() => setStep(1)} showGuide={settings.captureGuide} /></div>}
        {step === 1 && <div className="animate-fade-in"><LivePhotoCapture image={liveImage} onImage={setLiveImage} onBack={() => setStep(0)} onNext={start} showGuide={settings.captureGuide} /></div>}
        {step === 2 && <div className="animate-fade-in"><ProcessingSteps steps={pipeline.steps} providers={providers} documentImage={docImage?.dataUrl} /></div>}
        {step === 3 && pipeline.results && (
          <div className="animate-fade-in space-y-5">
            {saveError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{saveError}</p>}
            <ResultsView results={pipeline.results} images={{ document: docImage?.dataUrl, live: liveImage?.dataUrl }}>
              {decided ? (
                <div className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-3 text-sm font-semibold text-emerald-600"><Check className="h-4 w-4" />Decision recorded — opening record…</div>
              ) : (
                <DecisionBar recommendation={pipeline.results.risk?.recommendation} onDecide={decide} busy={!screeningId} />
              )}
            </ResultsView>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-20 lg:pb-0">
              <button type="button" className="btn-secondary" onClick={restart}><RotateCcw className="h-4 w-4" />Start another screening</button>
              <details className="text-xs muted"><summary className="cursor-pointer">Module timings</summary><ul className="mt-1 space-y-0.5 font-mono">{Object.entries(pipeline.steps).map(([k, v]) => <li key={k}>{k}: {v.durationMs != null ? `${v.durationMs} ms` : v.status}</li>)}</ul></details>
            </div>
          </div>
        )}
        {step === 3 && !pipeline.results && (
          <div className="card p-8 text-center"><p className="text-sm text-red-600">The pipeline did not complete. Check the module errors and try again.</p><button className="btn-secondary mt-4" onClick={restart}>Start over</button></div>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'active' : 'todo';
        return (
          <li key={s.label} className="flex flex-col gap-2">
            <div className={cx('h-1.5 rounded-full transition-colors duration-500', state === 'done' ? 'bg-emerald-500' : state === 'active' ? 'bg-brand-500' : 'bg-[var(--border)]')} />
            <span className={cx('flex items-center gap-1.5 text-[11px] font-semibold sm:text-xs', state === 'active' ? 'text-brand-600 dark:text-brand-300' : state === 'done' ? 'text-emerald-600' : 'faint')}><s.icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{i + 1}. </span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
