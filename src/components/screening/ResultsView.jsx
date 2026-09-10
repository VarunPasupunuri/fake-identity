import { useState } from 'react';
import { ScanFace, FileText, ShieldAlert, ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, RiskGauge, RiskBadge, Badge, StatusIcon, AnnotatedImage, ProgressBar } from '../ui/index.jsx';
import { FIELD_LABELS } from '../../modules/validation/rules.js';
import { DOCUMENT_TYPE_LABEL } from '../../modules/types.js';
import { formatDate, cx, RISK_STYLES } from '../../lib/format.js';

const DATE_FIELDS = new Set(['dateOfBirth', 'expiryDate', 'validFrom', 'validUntil']);
const FIELD_ORDER = ['fullName', 'surname', 'givenNames', 'documentNumber', 'visaNumber', 'visaType', 'nationality', 'issuingCountry', 'dateOfBirth', 'gender', 'expiryDate', 'validFrom', 'validUntil', 'entries', 'stayDuration', 'optionalData'];

/**
 * Step 4 / detail view: all module outputs side by side.
 * `results` = { documentType, ocr, validation, tampering, face, risk, providers }
 * `images`  = { document, live } data URLs / download URLs
 */
export default function ResultsView({ results, images, children }) {
  const { documentType, ocr, validation, tampering, face, risk, providers } = results;
  return (
    <div className="space-y-5">
      <RiskPanel risk={risk} documentType={documentType} ocr={ocr} face={face} tampering={tampering}>{children}</RiskPanel>
      <div className="grid gap-5 lg:grid-cols-2">
        <ExtractedDataPanel ocr={ocr} validation={validation} provider={providers?.ocr} />
        <ValidationPanel validation={validation} />
        <TamperingPanel tampering={tampering} image={images?.document} provider={providers?.tamper} />
        <FacePanel face={face} images={images} provider={providers?.face} />
      </div>
    </div>
  );
}

export function RiskPanel({ risk, documentType, ocr, face, tampering, children }) {
  if (!risk) return <Card title="Risk score"><p className="text-sm text-red-600">Risk score unavailable — one or more modules failed.</p>{children}</Card>;
  const s = RISK_STYLES[risk.level];
  const grouped = { validation: 0, tampering: 0, face: 0, ocr: 0 };
  for (const f of risk.factors) grouped[f.source] = (grouped[f.source] || 0) + f.points;
  return (
    <section className={cx('card overflow-hidden border', s.border)}>
      <div className={cx('grid gap-5 p-4 sm:p-5', children ? 'lg:grid-cols-[auto_minmax(0,1fr)_16rem]' : 'lg:grid-cols-[auto_minmax(0,1fr)]', s.bg)}>
        <div className="flex items-center justify-center"><RiskGauge score={risk.score} level={risk.level} /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={risk.level} />
            <Badge tone="slate">{DOCUMENT_TYPE_LABEL[documentType]}</Badge>
            <Badge tone="blue">Recommended: {risk.recommendation}</Badge>
          </div>
          <h2 className="mt-2 truncate text-xl font-bold text-slate-900">{ocr?.fields?.fullName || 'Unknown subject'}</h2>
          <p className="text-sm text-slate-600">{ocr?.fields?.documentNumber || ocr?.fields?.visaNumber || 'No document number'} · {ocr?.fields?.nationality || '—'}</p>
          <p className="mt-2 text-sm text-slate-700">{risk.summary}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <Contribution label="Validation" pts={grouped.validation} max={45} />
            <Contribution label="Tampering" pts={grouped.tampering} max={48} extra={tampering ? `${Math.round(tampering.score)}% likely` : null} />
            <Contribution label="Face match" pts={grouped.face} max={45} extra={face ? `${Math.round(face.confidence)}% match` : null} />
            <Contribution label="OCR quality" pts={grouped.ocr} max={6} extra={ocr ? `${Math.round(ocr.confidence * 100)}% conf.` : null} />
          </dl>
        </div>
        {children && <div className="flex flex-col justify-center gap-2">{children}</div>}
      </div>
      {risk.factors.length > 0 && (
        <details className="border-t border-slate-200/70 bg-white px-4 py-2 text-sm sm:px-5">
          <summary className="cursor-pointer py-1 font-medium text-slate-700">What drove this score ({risk.factors.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {risk.factors.map((f) => (
              <li key={f.id} className="flex items-start gap-3 py-2">
                <span className={cx('w-12 shrink-0 text-right font-mono text-xs font-semibold', f.points > 0 ? 'text-red-600' : 'text-emerald-600')}>{f.points > 0 ? '+' : ''}{f.points}</span>
                <div className="min-w-0"><p className="font-medium text-slate-800">{f.label} <span className="text-xs font-normal text-slate-400">· {f.source}</span></p><p className="text-xs text-slate-500">{f.detail}</p></div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Contribution({ label, pts, max, extra }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">+{pts} pts{extra && <span className="font-normal text-slate-500"> · {extra}</span>}</dd>
      <ProgressBar value={(pts / max) * 100} tone={pts === 0 ? 'bg-emerald-400' : pts / max > 0.5 ? 'bg-red-500' : 'bg-amber-500'} />
    </div>
  );
}

export function ExtractedDataPanel({ ocr, validation, provider }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!ocr?.fields) return <Card title="Extracted data"><p className="text-sm text-red-600">OCR failed — no text could be extracted. Verify the document manually.</p></Card>;
  const failedFields = new Set((validation?.checks || []).filter((c) => c.status === 'fail' && c.field).map((c) => c.field));
  const warnFields = new Set((validation?.checks || []).filter((c) => c.status === 'warn' && c.field).map((c) => c.field));
  const keys = FIELD_ORDER.filter((k) => ocr.fields[k] !== undefined);
  return (
    <Card title="Extracted data" subtitle={`${provider || ocr.provider} · ${Math.round(ocr.confidence * 100)}% confidence${ocr.mrz ? ` · MRZ ${ocr.mrz.format}` : ''}`} actions={<FileText className="h-4 w-4 text-slate-400" />}>
      {keys.length === 0 ? <p className="text-sm text-slate-500">No fields could be extracted.</p> : (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {keys.map((k) => (
            <div key={k} className={cx('rounded-lg border px-3 py-2', failedFields.has(k) ? 'border-red-200 bg-red-50' : warnFields.has(k) ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50')}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{FIELD_LABELS[k] || k}</dt>
              <dd className="truncate text-sm font-medium text-slate-900">{DATE_FIELDS.has(k) ? formatDate(ocr.fields[k]) : ocr.fields[k]}</dd>
            </div>
          ))}
        </dl>
      )}
      {ocr.mrz && (
        <div className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-5 text-emerald-300 sm:text-xs">
          {ocr.mrz.lines.map((l, i) => <div key={i} className="whitespace-pre">{l}</div>)}
        </div>
      )}
      <button type="button" className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600" onClick={() => setShowRaw((v) => !v)}>{showRaw ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{showRaw ? 'Hide' : 'Show'} raw OCR text</button>
      {showRaw && <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap">{ocr.rawText || '(empty)'}</pre>}
    </Card>
  );
}

export function ValidationPanel({ validation }) {
  if (!validation) return <Card title="Validation"><p className="text-sm text-red-600">Validation did not run.</p></Card>;
  const order = { fail: 0, warn: 1, pass: 2, skip: 3 };
  const checks = [...validation.checks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <Card title="Validation" subtitle={`${validation.passed} passed · ${validation.failed} failed · ${validation.warnings} warnings`} actions={<ListChecks className="h-4 w-4 text-slate-400" />}>
      <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-2">
            <StatusIcon status={c.status} className="mt-0.5 h-4.5 w-4.5 shrink-0" />
            <div className="min-w-0"><p className="text-sm font-medium text-slate-800">{c.label}</p><p className="text-xs text-slate-500">{c.detail}</p></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TamperingPanel({ tampering, image, provider }) {
  const [view, setView] = useState('regions');
  if (!tampering) return <Card title="Tampering detection"><p className="text-sm text-red-600">Tampering analysis failed.</p></Card>;
  const sevTone = { high: 'red', medium: 'amber', low: 'slate' };
  const boxes = tampering.flags.filter((f) => f.region).map((f) => ({ ...f.region, tone: f.severity, label: f.label }));
  const meta = tampering.evidence?.metadata || {};
  return (
    <Card title="Tampering detection" subtitle={`${provider || tampering.provider} · ${Math.round(tampering.score)}% tampering likelihood`} actions={<ShieldAlert className={cx('h-4 w-4', tampering.score >= 50 ? 'text-red-500' : tampering.score >= 25 ? 'text-amber-500' : 'text-slate-400')} />}>
      <ProgressBar value={tampering.score} tone={tampering.score >= 50 ? 'bg-red-500' : tampering.score >= 25 ? 'bg-amber-500' : 'bg-emerald-500'} />
      {image && (
        <div className="mt-3">
          <div className="mb-2 flex gap-1 text-xs">
            <button type="button" className={cx('rounded-md px-2 py-1 font-medium', view === 'regions' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')} onClick={() => setView('regions')}>Flagged regions</button>
            {tampering.evidence?.elaImage && <button type="button" className={cx('rounded-md px-2 py-1 font-medium', view === 'ela' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')} onClick={() => setView('ela')}>ELA heat-map</button>}
          </div>
          <AnnotatedImage src={view === 'ela' ? tampering.evidence.elaImage : image} boxes={boxes} alt="Document with flagged regions" className="w-full" />
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {tampering.flags.length === 0 && <li className="text-sm text-emerald-700">No tampering indicators found.</li>}
        {tampering.flags.map((f) => (
          <li key={f.id} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <Badge tone={sevTone[f.severity]} className="mt-0.5 shrink-0">{f.severity}</Badge>
            <div className="min-w-0"><p className="text-sm font-medium text-slate-800">{f.label}{f.field && <span className="ml-1 text-xs font-normal text-slate-400">· {FIELD_LABELS[f.field] || f.field}</span>}</p><p className="text-xs text-slate-500">{f.detail}</p></div>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div><dt className="text-slate-400">Software</dt><dd className="truncate">{meta.software || '—'}</dd></div>
        <div><dt className="text-slate-400">Camera</dt><dd className="truncate">{meta.camera || '—'}</dd></div>
        <div><dt className="text-slate-400">Captured</dt><dd className="truncate">{meta.created ? new Date(meta.created).toLocaleString() : '—'}</dd></div>
        <div><dt className="text-slate-400">Modified</dt><dd className="truncate">{meta.modified ? new Date(meta.modified).toLocaleString() : '—'}</dd></div>
      </dl>
    </Card>
  );
}

export function FacePanel({ face, images, provider }) {
  if (!face) return <Card title="Face verification"><p className="text-sm text-amber-700">Face verification was skipped or failed — no live photo was compared.</p></Card>;
  const compared = face.documentFaceFound && face.liveFaceFound;
  const tone = !compared ? 'text-slate-400' : face.confidence >= 75 ? 'text-emerald-600' : face.confidence >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <Card title="Face verification" subtitle={`${provider || face.provider}${face.distance != null ? ` · distance ${face.distance}` : ''}`} actions={<ScanFace className="h-4 w-4 text-slate-400" />}>
      <div className="flex items-center gap-4">
        <div><p className={cx('text-3xl font-bold tabular-nums', tone)}>{compared ? `${Math.round(face.confidence)}%` : '—'}</p><p className="text-xs text-slate-500">match confidence</p></div>
        {compared ? <Badge tone={face.match ? 'green' : 'red'}>{face.match ? 'Match' : 'No match'}</Badge> : <Badge tone="amber">Not compared</Badge>}
      </div>
      <ProgressBar value={compared ? face.confidence : 0} tone={face.confidence >= 75 ? 'bg-emerald-500' : face.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'} />
      {face.note && <p className="mt-2 text-xs text-amber-700">{face.note}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><p className="mb-1 text-xs font-semibold text-slate-500">Document photo</p>{images?.document ? <AnnotatedImage src={images.document} boxes={face.documentFaceBox ? [{ ...face.documentFaceBox, tone: 'face' }] : []} alt="Document" className="w-full" /> : <Placeholder />}</div>
        <div><p className="mb-1 text-xs font-semibold text-slate-500">Live capture</p>{images?.live ? <AnnotatedImage src={images.live} boxes={face.liveFaceBox ? [{ ...face.liveFaceBox, tone: 'face' }] : []} alt="Live" className="w-full" /> : <Placeholder />}</div>
      </div>
    </Card>
  );
}

function Placeholder() { return <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">No image</div>; }
