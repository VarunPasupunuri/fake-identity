import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, FileImage, ScanFace, ListChecks, Gauge, RotateCcw, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useScreeningPipeline } from '../hooks/useScreeningPipeline.js';
import { useDocumentPreflight } from '../hooks/useDocumentPreflight.js';
import { createScreening, listIdentityHistory } from '../services/screenings.js';
import DocumentUpload from '../components/screening/DocumentUpload.jsx';
import LivePhotoCapture from '../components/screening/LivePhotoCapture.jsx';
import ProcessingSteps from '../components/screening/ProcessingSteps.jsx';
import VerdictView from '../components/screening/VerdictView.jsx';
import { PageHeader } from '../components/ui/index.jsx';
import { resolveProviders } from '../modules/registry.js';
import { resolveSelection, getProfile, AUTO_DETECT } from '../modules/documents/registry.js';
import { DEMO_DOCUMENTS } from '../modules/documents/fixtures.js';
import { SCENARIO_OPTIONS, scenarioProfile } from '../modules/documents/scenarios.js';
import { generateMockDocumentImage } from '../modules/documents/mockImageGenerator.js';
import { cx } from '../lib/format.js';

/**
 * One document, one screening. The document is provided EITHER by camera capture
 * OR by file upload — never both, and the two are never compared with each other.
 *
 * Step 2 is optional: a photograph of the person presenting the document enables
 * face verification against the portrait printed on that same document. Skipping
 * it costs that one check and is reported as such; it never blocks the screening.
 */
const STEPS = [
  { label: 'Document', icon: FileImage },
  { label: 'Presented person', icon: ScanFace, optional: true },
  { label: 'Verification', icon: ListChecks },
  { label: 'Assessment', icon: Gauge },
];

export default function ScreeningPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const pipeline = useScreeningPipeline();
  const [step, setStep] = useState(0);
  const [documentType, setDocumentType] = useState(AUTO_DETECT);
  const [docImage, setDocImage] = useState(null);
  const [liveImage, setLiveImage] = useState(null);
  const [useMock, setUseMock] = useState(false);
  const [scenario, setScenario] = useState('clean_passport');
  const [mockDocument, setMockDocument] = useState('passport');
  const [history, setHistory] = useState([]);
  const [screeningId, setScreeningId] = useState(null);
  const [saveError, setSaveError] = useState('');
  const startedRef = useRef(false);
  const providers = resolveProviders(useMock ? { useMock: true, providers: settings.providers } : { providers: settings.providers });
  // A manually selected type whose profile has no holder photograph skips the live-photo step entirely.
  const selection = resolveSelection(documentType);
  const selectedProfile = selection.type ? getProfile(selection.type) : null;
  const faceApplies = !selectedProfile || selectedProfile.face !== 'not_applicable';

  // Preflight document-type check: one lightweight OCR on the document image,
  // compared with the selected type before any expensive module starts.
  const preflight = useDocumentPreflight({ providers: settings.providers, useMock, scenario, mockDocument });
  useEffect(() => {
    if (!docImage) { preflight.reset(); return; }
    preflight.check(docImage, documentType);
  }, [docImage, documentType, useMock, scenario, mockDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate mock document image when sample mode is enabled and scenario changes.
  useEffect(() => {
    if (!useMock) { setDocImage(null); return; }
    let live = true;
    generateMockDocumentImage(mockDocument, scenario).then((img) => {
      if (live) setDocImage(img);
    }).catch((e) => {
      console.error('Failed to generate mock document:', e);
      if (live) setDocImage(null);
    });
    return () => { live = false; };
  }, [useMock, scenario, mockDocument]);

  // Prior screenings power identity correlation; a failure here never blocks a screening.
  useEffect(() => {
    let live = true;
    listIdentityHistory({ user, max: 25 }).then((rows) => live && setHistory(rows || [])).catch(() => live && setHistory([]));
    return () => { live = false; };
  }, [user]);

  const start = async () => {
    if (startedRef.current) return;
    // Hard stop: a blocking type mismatch must never reach the screening modules.
    // Wait for a check still running rather than reading its absent result as a
    // pass — otherwise a document of the wrong type gets through by being quick.
    const pre = await preflight.settle();
    if (pre?.blocking || preflight.blocking) return;
    startedRef.current = true;
    setStep(2);
    setSaveError('');
    const out = await pipeline.run({ documentType, documentImage: docImage.analysisUrl || docImage.dataUrl, documentFile: docImage.file, liveImage: liveImage?.dataUrl, options: { useMock, scenario, mockDocument, providers: settings.providers, history, inputSource: docImage.source === 'camera' ? 'camera' : 'upload', preflight: pre || preflight.result, preflightOcr: preflight.takeOcr(docImage), preflightOcrImage: docImage.analysisUrl || docImage.dataUrl } });
    if (!out) { startedRef.current = false; return; }
    try {
      const id = await createScreening({ user: { ...user, checkpoint: settings.checkpoint }, requestedType: documentType, images: { document: docImage.dataUrl, live: liveImage?.dataUrl }, ...out, onWarning: (msg) => toast.warn('Image storage fallback', msg) });
      setScreeningId(id);
    } catch (e) {
      console.error(e);
      setSaveError(`Could not save screening: ${e.message}`);
      toast.error('Screening not saved', e.message);
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const restart = () => { pipeline.reset(); preflight.reset(); startedRef.current = false; setStep(0); setDocImage(null); setLiveImage(null); setScreeningId(null); setSaveError(''); };
  // The document alone is enough to screen. Adding a photo of the person is a
  // separate, explicit choice, not a gate in front of the result.
  const afterDocument = () => { if (preflight.blocking) return; return start(); };
  const addPersonPhoto = () => { if (preflight.blocking) return; setStep(1); };

  // Auto-run after live capture when enabled in settings
  useEffect(() => { if (settings.autoRunAfterCapture && step === 1 && liveImage && docImage) start(); }, [liveImage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => pipeline.reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader title="Screen document" subtitle="Capture or upload one document, then review the authenticity result and record a decision."
        actions={step < 2 && (
          <div className="flex flex-wrap items-center gap-2 t-body-sm">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md hairline px-3"><input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /><FlaskConical className="h-4 w-4 faint" aria-hidden="true" />Sample documents</label>
            {useMock && <select className="input input-sm w-auto" aria-label="Sample document type" value={mockDocument} onChange={(e) => setMockDocument(e.target.value)}>{DEMO_DOCUMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>}
            {useMock && (
              <select className="input input-sm w-auto" aria-label="Sample case" value={scenario} onChange={(e) => setScenario(e.target.value)}>
                <optgroup label="Screening cases">{SCENARIO_OPTIONS.filter((o) => o.sih).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
                <optgroup label="Document quality cases">{SCENARIO_OPTIONS.filter((o) => !o.sih).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
              </select>
            )}
            {!useMock && <Link to="/settings" className="btn-ghost btn-sm">Providers <span className="t-code">{providers.ocr} · {providers.tamper} · {providers.face}</span><ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>}
          </div>
        )} />

      {useMock && step < 2 && (
        <p className="-mt-2 mb-4 t-caption muted">
          <span className="font-medium text-[var(--ink)]">Sample document.</span> {scenarioProfile(scenario).summary} Designed to produce <span className="font-medium text-[var(--ink)]">{scenarioProfile(scenario).expected}</span>; the assessment is still derived from the evidence.
        </p>
      )}

      <Stepper step={step} />

      <div className="mt-6" key={step}>
        {step === 0 && <div className="animate-fade-in"><DocumentUpload documentType={documentType} onDocumentType={setDocumentType} image={docImage} onImage={setDocImage} onNext={afterDocument} showGuide={settings.captureGuide} nextLabel="Run screening" preflight={preflight} secondaryAction={faceApplies ? { label: 'Add photo of person (optional)', onClick: addPersonPhoto } : null} /></div>}
        {step === 1 && <div className="animate-fade-in"><LivePhotoCapture image={liveImage} onImage={setLiveImage} onBack={() => setStep(0)} onNext={start} showGuide={settings.captureGuide} /></div>}
        {step === 2 && <div className="animate-fade-in"><ProcessingSteps steps={pipeline.steps} providers={providers} documentImage={docImage?.dataUrl} /></div>}
        {step === 3 && pipeline.results && (
          <div className="animate-fade-in space-y-6">
            {saveError && <div className="alert alert-danger">{saveError}</div>}
            <VerdictView results={pipeline.results} images={{ document: docImage?.dataUrl }} />
            {/* Navigation only. The officer records the decision on the saved case,
                so the result screen itself carries nothing but the verdict. */}
            <div className="flex flex-wrap items-center justify-center gap-3 pb-20 lg:pb-0">
              <button type="button" className="btn-secondary" onClick={restart}><RotateCcw className="h-4 w-4" aria-hidden="true" />Screen another document</button>
              {screeningId && <Link to={`/history/${screeningId}`} className="btn-ghost">Open case</Link>}
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
            <span className={cx('flex items-center gap-1.5 t-caption', state === 'active' ? 'font-medium text-[var(--ink)]' : state === 'done' ? 'text-[var(--ok)]' : '')}><s.icon className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">{i + 1}. </span>{s.label}{s.optional && <span className="faint"> (optional)</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}
