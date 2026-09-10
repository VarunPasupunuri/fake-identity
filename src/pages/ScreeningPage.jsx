import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, FlaskConical } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useScreeningPipeline } from '../hooks/useScreeningPipeline.js';
import { createScreening, recordDecision } from '../services/screenings.js';
import DocumentUpload from '../components/screening/DocumentUpload.jsx';
import LivePhotoCapture from '../components/screening/LivePhotoCapture.jsx';
import ProcessingSteps from '../components/screening/ProcessingSteps.jsx';
import ResultsView from '../components/screening/ResultsView.jsx';
import DecisionBar from '../components/screening/DecisionBar.jsx';
import { getProviderConfig } from '../modules/registry.js';
import { cx } from '../lib/format.js';

const STEPS = ['Document', 'Live photo', 'Processing', 'Results'];

export default function ScreeningPage() {
  const { user } = useAuth();
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
  const config = getProviderConfig();

  const start = async () => {
    setStep(2);
    setSaveError('');
    const out = await pipeline.run({ documentType, documentImage: docImage.dataUrl, documentFile: docImage.file, liveImage: liveImage?.dataUrl, options: { useMock, scenario } });
    if (!out) return;
    try {
      const id = await createScreening({ user, documentType, images: { document: docImage.dataUrl, live: liveImage?.dataUrl }, ...out });
      setScreeningId(id);
    } catch (e) {
      console.error(e);
      setSaveError(`Could not save screening: ${e.message}`);
    }
    setStep(3);
  };

  const decide = async ({ decision, note }) => {
    if (!screeningId) return;
    await recordDecision(screeningId, { decision, note });
    setDecided(decision);
    setTimeout(() => navigate(`/history/${screeningId}`), 600);
  };

  const restart = () => { pipeline.reset(); setStep(0); setDocImage(null); setLiveImage(null); setScreeningId(null); setDecided(null); };

  useEffect(() => () => pipeline.reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">New screening</h1><p className="text-sm text-slate-500">Scan the document, capture a live photo, review the result and decide.</p></div>
        {step < 2 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} className="h-4 w-4 accent-brand-600" /><FlaskConical className="h-4 w-4 text-slate-400" />Use mock module outputs</label>
            {useMock && (
              <select className="input min-h-10 w-auto py-1.5 text-xs" value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="clean">Scenario: genuine document</option><option value="suspicious">Scenario: forged document</option></select>
            )}
          </div>
        )}
      </div>

      <Stepper step={step} />

      {step === 0 && <DocumentUpload documentType={documentType} onDocumentType={setDocumentType} image={docImage} onImage={setDocImage} onNext={() => setStep(1)} />}
      {step === 1 && <LivePhotoCapture image={liveImage} onImage={setLiveImage} onBack={() => setStep(0)} onNext={start} />}
      {step === 2 && <ProcessingSteps steps={pipeline.steps} providers={useMock ? { ocr: 'mock', tamper: 'mock', face: 'mock' } : config} documentImage={docImage?.dataUrl} />}
      {step === 3 && pipeline.results && (
        <>
          {saveError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>}
          <ResultsView results={pipeline.results} images={{ document: docImage?.dataUrl, live: liveImage?.dataUrl }}>
            {decided ? (
              <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" />Decision recorded</div>
            ) : (
              <DecisionBar recommendation={pipeline.results.risk?.recommendation} onDecide={decide} busy={!screeningId} />
            )}
          </ResultsView>
          <div className="flex justify-between">
            <button type="button" className="btn-secondary" onClick={restart}>Start another screening</button>
            <details className="text-xs text-slate-500"><summary className="cursor-pointer">Module timings</summary><ul className="mt-1 space-y-0.5">{Object.entries(pipeline.steps).map(([k, v]) => <li key={k}>{k}: {v.durationMs != null ? `${v.durationMs} ms` : v.status}</li>)}</ul></details>
          </div>
        </>
      )}
      {step === 3 && !pipeline.results && (
        <div className="card p-6 text-center"><p className="text-sm text-red-700">The pipeline did not complete. Check the module errors above and try again.</p><button className="btn-secondary mt-3" onClick={restart}>Start over</button></div>
      )}
    </div>
  );
}

function Stepper({ step }) {
  return (
    <ol className="grid grid-cols-4 gap-1 sm:gap-2">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-col gap-1">
          <div className={cx('h-1.5 rounded-full', i < step ? 'bg-emerald-500' : i === step ? 'bg-brand-600' : 'bg-slate-200')} />
          <span className={cx('text-[11px] font-medium sm:text-xs', i === step ? 'text-brand-700' : i < step ? 'text-emerald-700' : 'text-slate-400')}>{i + 1}. {label}</span>
        </li>
      ))}
    </ol>
  );
}
