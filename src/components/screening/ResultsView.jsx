import { useState } from 'react';
import { ScanFace, FileText, ShieldAlert, ListChecks, ChevronDown, ChevronUp, Gauge, LayoutGrid } from 'lucide-react';
import { Card, RiskGauge, RiskBadge, Badge, StatusIcon, AnnotatedImage, ProgressBar, Tabs } from '../ui/index.jsx';
import { FIELD_LABELS } from '../../modules/validation/rules.js';
import { DOCUMENT_TYPE_LABEL } from '../../modules/types.js';
import { formatDate, cx, RISK_STYLES } from '../../lib/format.js';
import { DecisionPanel, WhyPanel, EvidenceFusionPanel, CorrelationsPanel, EvidenceChainPanel, CounterfactualPanel } from './FusionPanels.jsx';

const DATE_FIELDS = new Set(['dateOfBirth', 'expiryDate', 'validFrom', 'validUntil']);
const FIELD_ORDER = ['fullName', 'surname', 'givenNames', 'documentNumber', 'visaNumber', 'visaType', 'nationality', 'issuingCountry', 'dateOfBirth', 'gender', 'expiryDate', 'validFrom', 'validUntil', 'entries', 'stayDuration', 'optionalData'];

/**
 * Results screen. With fusion output (new pipeline) the order is:
 * decision → risk + confidence → why → evidence fusion / trust → correlations →
 * document + fields → validation → forensics → face → evidence chain → counterfactual.
 * Records without `fusion` (older screenings) fall back to the legacy RiskPanel.
 * `results` = { documentType, ocr, validation, tampering, face, risk, fusion?, providers }
 * `images`  = { document, live }
 */
export default function ResultsView({ results, images, children }) {
  const { documentType, ocr, validation, tampering, face, risk, fusion, providers } = results;
  const [tab, setTab] = useState('all');
  const tabs = [
    { value: 'all', label: 'Overview', icon: LayoutGrid },
    { value: 'data', label: 'Data', icon: FileText, count: Object.keys(ocr?.fields || {}).length },
    { value: 'checks', label: 'Checks', icon: ListChecks, count: validation?.failed || 0 },
    { value: 'tamper', label: 'Tampering', icon: ShieldAlert, count: tampering?.flags?.length || 0 },
    { value: 'face', label: 'Face', icon: ScanFace },
  ];
  const show = (k) => tab === 'all' || tab === k;
  const hasFusion = Boolean(fusion && fusion.decision);
  return (
    <div className="space-y-5">
      {hasFusion
        ? <DecisionPanel fusion={fusion} documentType={documentType} ocr={ocr}>{children}</DecisionPanel>
        : <RiskPanel risk={risk} documentType={documentType} ocr={ocr} face={face} tampering={tampering}>{children}</RiskPanel>}
      {hasFusion && tab === 'all' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <WhyPanel fusion={fusion} />
          <EvidenceFusionPanel fusion={fusion} />
        </div>
      )}
      {hasFusion && tab === 'all' && <CorrelationsPanel fusion={fusion} />}
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="lg:hidden" />
      <div className="grid gap-5 lg:grid-cols-2">
        {show('data') && <ExtractedDataPanel ocr={ocr} validation={validation} provider={providers?.ocr} />}
        {show('checks') && <ValidationPanel validation={validation} />}
        {show('tamper') && <TamperingPanel tampering={tampering} image={images?.document} provider={providers?.tamper} />}
        {show('face') && <FacePanel face={face} images={images} provider={providers?.face} />}
      </div>
      {hasFusion && tab === 'all' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <EvidenceChainPanel fusion={fusion} />
          <CounterfactualPanel fusion={fusion} />
        </div>
      )}
    </div>
  );
}

export function RiskPanel({ risk, documentType, ocr, face, tampering, children }) {
  const [open, setOpen] = useState(false);
  if (!risk) return <Card title="Risk score" icon={Gauge}><p className="text-sm text-red-600">Risk score unavailable — one or more modules failed.</p>{children}</Card>;
  const s = RISK_STYLES[risk.level];
  const grouped = { validation: 0, tampering: 0, face: 0, ocr: 0 };
  for (const f of risk.factors) grouped[f.source] = (grouped[f.source] || 0) + f.points;
  return (
    <section className={cx('card overflow-hidden border animate-slide-up', s.border)}>
      <div className={cx('grid gap-5 p-4 sm:p-6', children ? 'lg:grid-cols-[auto_minmax(0,1fr)_17rem]' : 'lg:grid-cols-[auto_minmax(0,1fr)]', s.bg)}>
        <div className="flex items-center justify-center"><RiskGauge score={risk.score} level={risk.level} /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={risk.level} />
            <Badge tone="slate">{DOCUMENT_TYPE_LABEL[documentType]}</Badge>
            <Badge tone="blue">Suggested: {risk.recommendation}</Badge>
          </div>
          <h2 className="mt-2 truncate text-2xl font-bold tracking-tight">{ocr?.fields?.fullName || 'Unknown subject'}</h2>
          <p className="text-sm muted"><span className="font-mono">{ocr?.fields?.documentNumber || ocr?.fields?.visaNumber || 'No document number'}</span> · {ocr?.fields?.nationality || '—'}{ocr?.fields?.dateOfBirth ? ` · born ${formatDate(ocr.fields.dateOfBirth)}` : ''}</p>
          <p className="mt-2 text-sm">{risk.summary}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
            <Contribution label="Validation" pts={grouped.validation} max={45} />
            <Contribution label="Tampering" pts={grouped.tampering} max={48} extra={tampering ? `${Math.round(tampering.score)}% likely` : 'n/a'} />
            <Contribution label="Face match" pts={grouped.face} max={45} extra={face && face.documentFaceFound && face.liveFaceFound ? `${Math.round(face.confidence)}% match` : 'not compared'} />
            <Contribution label="OCR quality" pts={grouped.ocr} max={30} extra={ocr ? `${Math.round(ocr.confidence * 100)}% conf.` : 'failed'} />
          </dl>
        </div>
        {children && <div className="flex flex-col justify-center gap-2">{children}</div>}
      </div>
      {risk.factors.length > 0 && (
        <div className="border-t divider bg-[var(--surface)] px-4 py-2 text-sm sm:px-6">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-1 font-medium">What drove this score ({risk.factors.length}){open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
          {open && (
            <ul className="mt-2 divide-y divider animate-fade-in">
              {risk.factors.map((f) => (
                <li key={f.id} className="flex items-start gap-3 py-2">
                  <span className={cx('w-12 shrink-0 text-right font-mono text-xs font-semibold', f.points > 0 ? 'text-red-600' : 'text-emerald-600')}>{f.points > 0 ? '+' : ''}{f.points}</span>
                  <div className="min-w-0"><p className="font-medium">{f.label} <span className="text-xs font-normal faint">· {f.source}</span></p><p className="text-xs muted">{f.detail}</p></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Contribution({ label, pts, max, extra }) {
  return (
    <div>
      <dt className="muted">{label}</dt>
      <dd className="font-semibold">+{pts} pts{extra && <span className="font-normal muted"> · {extra}</span>}</dd>
      <ProgressBar value={(pts / max) * 100} tone={pts === 0 ? 'bg-emerald-400' : pts / max > 0.5 ? 'bg-red-500' : 'bg-amber-500'} className="mt-1" />
    </div>
  );
}

export function ExtractedDataPanel({ ocr, validation, provider }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!ocr?.fields) return <Card title="Extracted data" icon={FileText}><p className="text-sm text-red-600">OCR failed — no text could be extracted. Verify the document manually.</p></Card>;
  const failedFields = new Set((validation?.checks || []).filter((c) => c.status === 'fail' && c.field).map((c) => c.field));
  const warnFields = new Set((validation?.checks || []).filter((c) => c.status === 'warn' && c.field).map((c) => c.field));
  const keys = FIELD_ORDER.filter((k) => ocr.fields[k] !== undefined);
  return (
    <Card title="Extracted data" subtitle={`${provider || ocr.provider} · ${Math.round(ocr.confidence * 100)}% confidence${ocr.mrz ? ` · MRZ ${ocr.mrz.format}` : ' · no MRZ'}`} icon={FileText}>
      {keys.length === 0 ? <p className="text-sm muted">No fields could be extracted.</p> : (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {keys.map((k) => (
            <div key={k} className={cx('rounded-xl border px-3 py-2', failedFields.has(k) ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10' : warnFields.has(k) ? 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10' : 'divider bg-[var(--surface-2)]')}>
              <dt className="text-[10px] font-semibold uppercase tracking-wider faint">{FIELD_LABELS[k] || k}</dt>
              <dd className={cx('truncate text-sm font-medium', (k === 'documentNumber' || k === 'visaNumber') && 'font-mono')}>{DATE_FIELDS.has(k) ? formatDate(ocr.fields[k]) : ocr.fields[k]}</dd>
            </div>
          ))}
        </dl>
      )}
      {ocr.mrz && (
        <div className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-5 text-emerald-300 sm:text-xs">
          {ocr.mrz.lines.map((l, i) => <div key={i} className="whitespace-pre">{l}</div>)}
        </div>
      )}
      <button type="button" className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-300" onClick={() => setShowRaw((v) => !v)}>{showRaw ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{showRaw ? 'Hide' : 'Show'} raw OCR text</button>
      {showRaw && <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-[var(--surface-2)] p-3 text-xs whitespace-pre-wrap">{ocr.rawText || '(empty)'}</pre>}
    </Card>
  );
}

export function ValidationPanel({ validation }) {
  const [filter, setFilter] = useState('all');
  if (!validation) return <Card title="Validation" icon={ListChecks}><p className="text-sm text-red-600">Validation did not run.</p></Card>;
  const order = { fail: 0, warn: 1, pass: 2, skip: 3 };
  const checks = [...validation.checks].sort((a, b) => order[a.status] - order[b.status]).filter((c) => filter === 'all' || c.status === filter);
  return (
    <Card title="Validation" subtitle={`${validation.passed} passed · ${validation.failed} failed · ${validation.warnings} warnings`} icon={ListChecks}
      actions={<div className="flex gap-1">{['all', 'fail', 'warn', 'pass'].map((f) => <button key={f} onClick={() => setFilter(f)} className={cx('rounded-md px-2 py-1 text-[11px] font-semibold capitalize', filter === f ? 'bg-[var(--ink)] text-[var(--surface)]' : 'bg-[var(--surface-2)] muted')}>{f}</button>)}</div>}>
      <ul className="max-h-[440px] divide-y divider overflow-y-auto">
        {checks.length === 0 && <li className="py-3 text-sm muted">Nothing in this category.</li>}
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-2.5">
            <StatusIcon status={c.status} className="mt-0.5 h-4.5 w-4.5 shrink-0" />
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{c.label}</p><p className="text-xs muted">{c.detail}</p></div>
            {c.status === 'fail' && <Badge tone={c.severity === 'critical' ? 'red' : 'amber'}>{c.severity}</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TamperingPanel({ tampering, image, provider }) {
  const [view, setView] = useState('regions');
  if (!tampering) return <Card title="Tampering detection" icon={ShieldAlert}><p className="text-sm text-red-600">Tampering analysis failed.</p></Card>;
  const sevTone = { high: 'red', medium: 'amber', low: 'slate' };
  const boxes = tampering.flags.filter((f) => f.region).map((f) => ({ ...f.region, tone: f.severity, label: f.label }));
  const meta = tampering.evidence?.metadata || {};
  const level = tampering.score >= 50 ? 'high' : tampering.score >= 25 ? 'medium' : 'low';
  return (
    <Card title="Tampering detection" subtitle={`${provider || tampering.provider} · ${Math.round(tampering.score)}% tampering likelihood`} icon={ShieldAlert} actions={<RiskBadge level={level} />}>
      <ProgressBar value={tampering.score} tone={RISK_STYLES[level].solid} />
      {image && (
        <div className="mt-3">
          <div className="mb-2 flex gap-1 text-xs">
            <button type="button" className={cx('rounded-md px-2 py-1 font-semibold', view === 'regions' ? 'bg-[var(--ink)] text-[var(--surface)]' : 'bg-[var(--surface-2)] muted')} onClick={() => setView('regions')}>Flagged regions</button>
            {tampering.evidence?.elaImage && <button type="button" className={cx('rounded-md px-2 py-1 font-semibold', view === 'ela' ? 'bg-[var(--ink)] text-[var(--surface)]' : 'bg-[var(--surface-2)] muted')} onClick={() => setView('ela')}>ELA heat-map</button>}
          </div>
          <AnnotatedImage src={view === 'ela' ? tampering.evidence.elaImage : image} boxes={boxes} alt="Document with flagged regions" className="w-full" />
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {tampering.flags.length === 0 && <li className="flex items-center gap-2 text-sm text-emerald-600"><StatusIcon status="pass" className="h-4 w-4" />No tampering indicators found.</li>}
        {tampering.flags.map((f) => (
          <li key={f.id} className="flex items-start gap-2 rounded-xl border divider bg-[var(--surface-2)] px-3 py-2">
            <Badge tone={sevTone[f.severity]} className="mt-0.5 shrink-0">{f.severity}</Badge>
            <div className="min-w-0"><p className="text-sm font-medium">{f.label}{f.field && <span className="ml-1 text-xs font-normal faint">· {FIELD_LABELS[f.field] || f.field}</span>}</p><p className="text-xs muted">{f.detail}</p></div>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {[['Software', meta.software], ['Camera', meta.camera], ['Captured', meta.created ? new Date(meta.created).toLocaleString() : null], ['Modified', meta.modified ? new Date(meta.modified).toLocaleString() : null]].map(([k, v]) => <div key={k}><dt className="faint">{k}</dt><dd className="truncate">{v || '—'}</dd></div>)}
      </dl>
    </Card>
  );
}

export function FacePanel({ face, images, provider }) {
  if (!face) return <Card title="Face verification" icon={ScanFace}><p className="text-sm text-amber-700 dark:text-amber-300">Face verification was skipped or failed — no live photo was compared.</p></Card>;
  const compared = face.documentFaceFound && face.liveFaceFound;
  const tone = !compared ? 'faint' : face.confidence >= 75 ? 'text-emerald-600' : face.confidence >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <Card title="Face verification" subtitle={`${provider || face.provider}${face.distance != null ? ` · distance ${face.distance}` : ''}`} icon={ScanFace}>
      <div className="flex items-center gap-4">
        <div><p className={cx('text-4xl font-bold leading-none', tone)}>{compared ? `${Math.round(face.confidence)}%` : '—'}</p><p className="mt-1 text-xs muted">match confidence</p></div>
        {compared ? <Badge tone={face.match ? 'green' : 'red'}>{face.match ? 'Match' : 'No match'}</Badge> : <Badge tone="amber">Not compared</Badge>}
      </div>
      <ProgressBar value={compared ? face.confidence : 0} tone={face.confidence >= 75 ? 'bg-emerald-500' : face.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'} className="mt-3" />
      {face.note && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{face.note}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><p className="mb-1 text-xs font-semibold muted">Document photo</p>{images?.document ? <AnnotatedImage src={images.document} boxes={face.documentFaceBox ? [{ ...face.documentFaceBox, tone: 'face' }] : []} alt="Document" className="w-full" maxH="max-h-60" /> : <Placeholder />}</div>
        <div><p className="mb-1 text-xs font-semibold muted">Live capture</p>{images?.live ? <AnnotatedImage src={images.live} boxes={face.liveFaceBox ? [{ ...face.liveFaceBox, tone: 'face' }] : []} alt="Live" className="w-full" maxH="max-h-60" /> : <Placeholder />}</div>
      </div>
    </Card>
  );
}

function Placeholder() { return <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[var(--surface-2)] text-xs faint">No image</div>; }
