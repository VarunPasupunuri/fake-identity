import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, FlaskConical, FileImage, ScanFace, ListChecks, Gauge, RotateCcw, ExternalLink } from 'lucide-react';
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
  { label: 'Verification', icon: ListChecks },
  { label: 'Result', icon: Gauge },
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
      const id = await createScreening({ user: { ...user, checkpoint: settings.checkpoint }, documentType, images: { document: docImage.dataUrl, live: liveImage?.dataUrl }, ...out, onWarning: (msg) => toast.warn('Image storage fallback', msg) });
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
      <PageHeader title="Screen document" subtitle="Provide the document, capture the presented person, then review the verification result and record a decision."
        actions={step < 2 && (
          <div className="flex flex-wrap items-center gap-2 t-body-sm">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md hairline px-3"><input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /><FlaskConical className="h-4 w-4 faint" aria-hidden="true" />Demonstration data</label>
            {useMock && <select className="input input-sm w-auto" aria-label="Demonstration scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="clean">Scenario: genuine document</option><option value="suspicious">Scenario: altered document</option></select>}
            {!useMock && <Link to="/settings" className="btn-ghost btn-sm">Providers <span className="t-code">{providers.ocr} · {providers.tamper} · {providers.face}</span><ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>}
          </div>
        )} />

      <Stepper step={step} />

      <div className="mt-6" key={step}>
        {step === 0 && <div className="animate-fade-in"><DocumentUpload documentType={documentType} onDocumentType={setDocumentType} image={docImage} onImage={setDocImage} onNext={() => setStep(1)} showGuide={settings.captureGuide} /></div>}
        {step === 1 && <div className="animate-fade-in"><LivePhotoCapture image={liveImage} onImage={setLiveImage} onBack={() => setStep(0)} onNext={start} showGuide={settings.captureGuide} /></div>}
        {step === 2 && <div className="animate-fade-in"><ProcessingSteps steps={pipeline.steps} providers={providers} documentImage={docImage?.dataUrl} /></div>}
        {step === 3 && pipeline.results && (
          <div className="animate-fade-in space-y-5">
            {saveError && <div className="alert alert-danger">{saveError}</div>}
            <ResultsView results={pipeline.results} images={{ document: docImage?.dataUrl, live: liveImage?.dataUrl }}>
              {decided ? (
                <div className="flex items-center gap-2 rounded-md hairline px-3 py-3 text-sm font-medium status-ok"><Check className="h-4 w-4" aria-hidden="true" />Decision recorded — opening case…</div>
              ) : (
                <DecisionBar recommendation={pipeline.results.risk?.recommendation} aiDecision={pipeline.results.fusion?.decision} onDecide={decide} busy={!screeningId} />
              )}
            </ResultsView>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-20 lg:pb-0">
              <button type="button" className="btn-secondary" onClick={restart}><RotateCcw className="h-4 w-4" aria-hidden="true" />Screen another document</button>
              <p className="t-caption tabular">{typeof pipeline.results.durationMs === 'number' ? `Verification completed in ${(pipeline.results.durationMs / 1000).toFixed(1)} s` : ''}</p>
            </div>
          </div>
        )}
        {step === 3 && !pipeline.results && (
          <div className="empty"><p className="text-sm status-danger">Verification did not complete. Review the stage errors and try again.</p><button className="btn-secondary mt-4" onClick={restart}>Start over</button></div>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Screening steps">
      {STEPS.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'active' : 'todo';
        return (
          <li key={s.label} className="flex flex-col gap-1.5" aria-current={state === 'active' ? 'step' : undefined}>
            <div className={cx('h-1 rounded-xs', state === 'done' ? 'bg-[var(--ok)]' : state === 'active' ? 'bg-[var(--brand)]' : 'bg-[var(--border)]')} />
            <span className={cx('flex items-center gap-1.5 t-caption', state === 'active' ? 'font-medium text-[var(--ink)]' : state === 'done' ? 'text-[var(--ok)]' : '')}><s.icon className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">{i + 1}. </span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
