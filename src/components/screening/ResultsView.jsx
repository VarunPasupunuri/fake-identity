import { useState } from 'react';
import { ScanFace, FileText, ShieldAlert, ListChecks, ChevronDown, ChevronUp, Gauge, LayoutGrid, QrCode } from 'lucide-react';
import { Card, RiskBadge, Badge, StatusIcon, AnnotatedImage, ProgressBar, Tabs } from '../ui/index.jsx';
import { FIELD_LABELS } from '../../modules/validation/rules.js';
import { DOCUMENT_TYPE_LABEL } from '../../modules/types.js';
import { getProfile, expectedFieldKeys } from '../../modules/documents/registry.js';
import { issuerStatusLabel } from '../../modules/issuer/index.js';
import { DATE_FIELD_KEYS, IDENTIFIER_FIELD_KEYS } from '../../modules/documents/fields.js';
import { formatDate, cx, RISK_STYLES } from '../../lib/format.js';
import { DecisionPanel, WhyPanel, EvidenceFusionPanel, CorrelationsPanel, EvidenceChainPanel, CounterfactualPanel } from './FusionPanels.jsx';
import { SignalsPanel, EvidenceGroupsPanel, LimitationsPanel, BarcodePanel, IdentityPanel, WatchlistPanel, WorkflowStrip, ModuleHeading, DetectionPanel } from './UniversalPanels.jsx';
import { AuthenticityPanel, TamperingIndicatorsPanel, FieldConsistencyPanel } from './AuthenticityPanel.jsx';

const DATE_FIELDS = new Set(DATE_FIELD_KEYS);
const ID_FIELDS = new Set([...IDENTIFIER_FIELD_KEYS, 'documentNumber', 'visaNumber']);
const LEGACY_ORDER = ['fullName', 'surname', 'givenNames', 'documentNumber', 'visaNumber', 'visaType', 'nationality', 'issuingCountry', 'dateOfBirth', 'gender', 'expiryDate', 'validFrom', 'validUntil', 'entries', 'stayDuration', 'optionalData'];
const HIDDEN_FIELDS = new Set(['marks', 'subjects']); // rendered as a table, not as a field chip

/**
 * Verification result. With fusion output (current pipeline) the order is:
 * system assessment → why → verification signals → conflicting evidence →
 * document data → validation → integrity → face → evidence chain → counterfactual.
 * Records without `fusion` (older screenings) fall back to the legacy RiskPanel.
 * `results` = { documentType, ocr, validation, tampering, face, risk, fusion?, providers }
 * `images`  = { document, live }
 * `mode`    is accepted for callers that render the same view in a different context (e.g. investigation) and is currently informational only.
 */
export default function ResultsView({ results, images, children, linkBase = '/history', caseRef }) {
  const inputSource = results.inputSource || null;
  const { documentType, ocr, validation, tampering, barcode, face, watchlist, identity, risk, fusion, providers, classification, authenticity, issuer } = results;
  const profile = getProfile(documentType);
  const faceApplies = profile.face !== 'not_applicable';
  const [tab, setTab] = useState('all');
  const tabs = [
    { value: 'all', label: 'Overview', icon: LayoutGrid },
    { value: 'data', label: '01 Data', icon: FileText, count: Object.keys(ocr?.fields || {}).length },
    { value: 'checks', label: '02 Checks', icon: ListChecks, count: validation?.failed || 0 },
    { value: 'tamper', label: '03 Integrity', icon: ShieldAlert, count: tampering?.flags?.length || 0 },
    ...(faceApplies || face ? [{ value: 'face', label: '04 Face', icon: ScanFace }] : []),
    ...(barcode || watchlist ? [{ value: 'other', label: 'Other', icon: QrCode, count: barcode?.codes?.length || 0 }] : []),
  ];
  const show = (k) => tab === 'all' || tab === k;
  const overview = tab === 'all';
  const hasFusion = Boolean(fusion && fusion.decision);
  if (!hasFusion) {
    // Records created before evidence fusion: legacy risk panel plus the module panels we can still render.
    return (
      <div className="space-y-5">
        <RiskPanel risk={risk} documentType={documentType} ocr={ocr} face={face} tampering={tampering}>{children}</RiskPanel>
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="lg:hidden" />
        <div className="grid gap-5 lg:grid-cols-2">
          {show('data') && <ExtractedDataPanel ocr={ocr} validation={validation} provider={providers?.ocr} documentType={documentType} />}
          {show('checks') && <ValidationPanel validation={validation} />}
          {show('tamper') && <TamperingPanel tampering={tampering} image={images?.document} provider={providers?.tamper} />}
          {show('face') && (faceApplies || face) && <FacePanel face={face} images={images} provider={providers?.face} applicability={profile.face} />}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* 1. DOCUMENT AUTHENTICITY — what the forensic and field evidence says about the document.
             The verification line comes from what the issuer module actually returned; the decision
             must never stand in for it, because a document-level assessment cannot confirm an
             issuer's record. */}
      <AuthenticityPanel
        authenticity={authenticity}
        risk={fusion?.risk?.score ?? null}
        confidence={fusion?.confidence?.score ?? null}
        documentLabel={profile.label}
        verificationStatus={issuerStatusLabel(issuer)}
      />

      {/* 2. Assessment, and the officer's decision. Deliberately separate from authenticity:
             a document with no tampering indicators can still need review (poor capture,
             expired, watchlist), and a tampered one still needs an officer to act. */}
      <DecisionPanel fusion={fusion} documentType={documentType} ocr={ocr} classification={classification} caseRef={caseRef} inputSource={inputSource}>{children}</DecisionPanel>

      {/* The module chain, so the workflow is visible at a glance */}
      {overview && <WorkflowStrip fusion={fusion} correlations={(fusion.correlations || []).filter((c) => c.kind !== 'supporting').length} />}

      {overview && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SignalsPanel fusion={fusion} />
          <WhyPanel fusion={fusion} />
        </div>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="lg:hidden" />

      {/* MODULE 01 — OCR EXTRACTION */}
      {show('data') && (
        <section className="space-y-3" aria-label="Module 01 OCR extraction">
          <ModuleHeading module="01" title="OCR extraction" note={ocr ? `${providers?.ocr || ocr.provider} · ${Math.round((ocr.confidence || 0) * 100)}% read confidence` : 'no output'} />
          <DetectionPanel classification={classification} documentType={documentType} preflight={results.preflight} />
          <ExtractedDataPanel ocr={ocr} validation={validation} provider={providers?.ocr} documentType={documentType} />
        </section>
      )}

      {/* MODULE 02 — DOCUMENT VALIDATION */}
      {show('checks') && (
        <section className="space-y-3" aria-label="Module 02 document validation">
          <ModuleHeading module="02" title="Document validation" note={validation ? `${validation.passed} passed · ${validation.failed} failed · ${validation.warnings} warnings` : 'did not run'} />
          <ValidationPanel validation={validation} />
        </section>
      )}

      {/* MODULE 03 — TAMPERING DETECTION */}
      {show('tamper') && (
        <section className="space-y-3" aria-label="Module 03 tampering detection">
          <ModuleHeading module="03" title="Tampering detection" note={tampering ? `${providers?.tamper || tampering.provider} · image forensics` : 'unavailable'} />
          <TamperingIndicatorsPanel authenticity={authenticity} />
          <FieldConsistencyPanel authenticity={authenticity} />
          <TamperingPanel tampering={tampering} image={images?.document} provider={providers?.tamper} />
        </section>
      )}

      {/* MODULE 04 — FACE VERIFICATION */}
      {show('face') && (faceApplies || face) && (
        <section className="space-y-3" aria-label="Module 04 face verification">
          <ModuleHeading module="04" title="Face verification" note={faceApplies ? (providers?.face || face?.provider || 'not performed') : 'not applicable to this document type'} />
          <FacePanel face={face} images={images} provider={providers?.face} applicability={profile.face} />
        </section>
      )}

      {/* Supporting checks */}
      {(show('other') || overview) && (watchlist || barcode || identity) && (
        <section className="space-y-3" aria-label="Supporting checks">
          <ModuleHeading title="Watchlist, codes and identity signals" note="supporting checks" />
          <div className="grid gap-5 lg:grid-cols-2">
            {watchlist && <WatchlistPanel watchlist={watchlist} />}
            {barcode && <BarcodePanel barcode={barcode} validation={validation} image={images?.document} />}
            {identity && <IdentityPanel identity={identity} linkBase={linkBase} />}
          </div>
        </section>
      )}

      {/* Evidence fusion */}
      {overview && (
        <section className="space-y-3" aria-label="Evidence fusion">
          <ModuleHeading title="Evidence fusion" note="how the modules combine into one assessment" />
          <EvidenceGroupsPanel fusion={fusion} />
          <CorrelationsPanel fusion={fusion} />
          <div className="grid gap-5 lg:grid-cols-2">
            <EvidenceFusionPanel fusion={fusion} />
            <EvidenceChainPanel fusion={fusion} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <CounterfactualPanel fusion={fusion} />
            <LimitationsPanel fusion={fusion} results={results} />
          </div>
        </section>
      )}
    </div>
  );
}

/** Legacy risk panel for records that pre-date evidence fusion. */
export function RiskPanel({ risk, documentType, ocr, face, tampering, children }) {
  const [open, setOpen] = useState(false);
  if (!risk) return <Card title="Risk score" icon={Gauge}><p className="t-body-sm status-danger">Risk score unavailable — one or more checks failed.</p>{children}</Card>;
  const s = RISK_STYLES[risk.level];
  const grouped = { validation: 0, tampering: 0, face: 0, ocr: 0 };
  for (const f of risk.factors) grouped[f.source] = (grouped[f.source] || 0) + f.points;
  return (
    <section className="card overflow-hidden animate-slide-up">
      <div className={cx('grid gap-6 p-4 sm:p-6', children ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : 'lg:grid-cols-1')}>
        <div className="min-w-0">
          <p className="t-label">Risk assessment</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="t-display tabular">{risk.score}<span className="t-body muted"> / 100</span></span>
            <span className={cx('badge', s.badge)}>{String(risk.level).toUpperCase()}</span>
            <Badge tone="neutral">{DOCUMENT_TYPE_LABEL[documentType]}</Badge>
            <Badge tone="brand">Suggested: {risk.recommendation}</Badge>
          </div>
          <h2 className="mt-3 truncate t-h2">{ocr?.fields?.fullName || 'Unknown subject'}</h2>
          <p className="t-body-sm muted"><span className="t-code">{ocr?.fields?.documentNumber || ocr?.fields?.visaNumber || 'No document number'}</span> · {ocr?.fields?.nationality || '—'}{ocr?.fields?.dateOfBirth ? ` · born ${formatDate(ocr.fields.dateOfBirth)}` : ''}</p>
          <p className="mt-2 t-body">{risk.summary}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Contribution label="Validation" pts={grouped.validation} max={45} />
            <Contribution label="Integrity" pts={grouped.tampering} max={48} extra={tampering ? `${Math.round(tampering.score)}% likely` : 'n/a'} />
            <Contribution label="Face match" pts={grouped.face} max={45} extra={face && face.documentFaceFound && face.liveFaceFound ? `${Math.round(face.confidence)}% match` : 'not compared'} />
            <Contribution label="Extraction" pts={grouped.ocr} max={30} extra={ocr ? `${Math.round(ocr.confidence * 100)}% conf.` : 'failed'} />
          </dl>
        </div>
        {children && <div className="flex flex-col justify-start gap-2 border-t divider pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">{children}</div>}
      </div>
      {risk.factors.length > 0 && (
        <div className="border-t divider px-4 py-2 t-body-sm sm:px-6">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-1 font-medium">Risk factors ({risk.factors.length}){open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
          {open && (
            <ul className="mt-2 divide-y divider animate-fade-in">
              {risk.factors.map((f) => (
                <li key={f.id} className="flex items-start gap-3 py-2">
                  <span className={cx('w-12 shrink-0 text-right t-code tabular', f.points > 0 ? 'status-danger' : 'status-ok')}>{f.points > 0 ? '+' : ''}{f.points}</span>
                  <div className="min-w-0"><p className="font-medium">{f.label} <span className="t-caption faint">· {f.source}</span></p><p className="t-caption muted">{f.detail}</p></div>
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
      <dt className="t-label">{label}</dt>
      <dd className="t-body-sm font-medium tabular">+{pts} pts{extra && <span className="font-normal muted"> · {extra}</span>}</dd>
      <ProgressBar value={(pts / max) * 100} tone={pts === 0 ? 'bg-[var(--ok)]' : pts / max > 0.5 ? 'bg-[var(--danger)]' : 'bg-[var(--warn)]'} className="mt-1" />
    </div>
  );
}

export function ExtractedDataPanel({ ocr, validation, provider, documentType }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!ocr?.fields) return <Card title="Document data" icon={FileText}><p className="t-body-sm status-danger">Extraction failed — no text could be read. Verify the document manually.</p></Card>;
  const failedFields = new Set((validation?.checks || []).filter((c) => c.status === 'fail' && c.field).map((c) => c.field));
  const warnFields = new Set((validation?.checks || []).filter((c) => c.status === 'warn' && c.field).map((c) => c.field));
  const profile = getProfile(documentType);
  // Only fields relevant to the detected document type are shown, in the profile's order; derived duplicates are hidden.
  const order = profile.legacy ? LEGACY_ORDER : [...expectedFieldKeys(profile.id), ...LEGACY_ORDER];
  const derived = new Set(profile.legacy ? [] : [profile.subjectField !== 'fullName' ? 'fullName' : null, profile.primaryIdentifier !== 'documentNumber' ? 'documentNumber' : null].filter(Boolean));
  const keys = [...new Set(order)].filter((k) => ocr.fields[k] !== undefined && !HIDDEN_FIELDS.has(k) && !derived.has(k));
  const marks = Array.isArray(ocr.fields.marks) ? ocr.fields.marks : [];
  const render = (k) => {
    const v = ocr.fields[k];
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? x.subject || JSON.stringify(x) : x)).join(', ');
    if (DATE_FIELDS.has(k)) return formatDate(v);
    return String(v);
  };
  return (
    <Card title="Document data" subtitle={`${provider || ocr.provider} · ${Math.round(ocr.confidence * 100)}% extraction confidence${ocr.mrz ? ` · MRZ ${ocr.mrz.format}` : profile.legacy ? ' · no MRZ' : ` · ${profile.label}`}`} icon={FileText}>
      {keys.length === 0 && marks.length === 0 ? <p className="t-body-sm muted">No fields could be extracted.</p> : (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {keys.map((k) => (
            <div key={k} className={cx('rounded-sm border px-3 py-2', failedFields.has(k) ? 'border-[var(--danger)] bg-[var(--danger-soft)]' : warnFields.has(k) ? 'border-[var(--warn)] bg-[var(--warn-soft)]' : 'divider bg-[var(--surface-2)]')}>
              <dt className="t-label">{FIELD_LABELS[k] || k}</dt>
              <dd className={cx('truncate t-body font-medium', ID_FIELDS.has(k) && 't-code')} title={render(k)}>{render(k)}</dd>
            </div>
          ))}
        </dl>
      )}
      {marks.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="table table-compact" aria-label="Marks table">
            <thead><tr><th scope="col">Subject</th><th scope="col" className="text-right">Marks</th><th scope="col" className="text-right">Max</th><th scope="col">Grade</th></tr></thead>
            <tbody>{marks.map((r, i) => <tr key={i}><td>{r.subject}</td><td className="text-right tabular">{r.marks}</td><td className="text-right tabular">{r.max ?? '—'}</td><td>{r.grade || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {ocr.mrz && (
        <div className="mt-3 overflow-x-auto rounded-sm border divider bg-[var(--surface-2)] p-3 t-code leading-5">
          {ocr.mrz.lines.map((l, i) => <div key={i} className="whitespace-pre">{l}</div>)}
        </div>
      )}
      <button type="button" className="btn-ghost btn-sm mt-3 -ml-2" aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>{showRaw ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{showRaw ? 'Hide' : 'Show'} raw extracted text</button>
      {showRaw && <pre className="mt-2 max-h-56 overflow-auto rounded-sm bg-[var(--surface-2)] p-3 t-caption whitespace-pre-wrap">{ocr.rawText || '(empty)'}</pre>}
    </Card>
  );
}

export function ValidationPanel({ validation }) {
  const [filter, setFilter] = useState('all');
  if (!validation) return <Card title="Validation" icon={ListChecks}><p className="t-body-sm status-danger">Validation did not run.</p></Card>;
  const order = { fail: 0, warn: 1, pass: 2, skip: 3 };
  const checks = [...validation.checks].sort((a, b) => order[a.status] - order[b.status]).filter((c) => filter === 'all' || c.status === filter);
  return (
    <Card title="Validation" subtitle={`${validation.passed} passed · ${validation.failed} failed · ${validation.warnings} warnings`} icon={ListChecks}
      actions={<div className="flex gap-1" role="group" aria-label="Filter checks">{['all', 'fail', 'warn', 'pass'].map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cx('rounded-sm px-2 py-1 t-caption font-medium capitalize', filter === f ? 'bg-[var(--ink)] text-[var(--surface)]' : 'bg-[var(--surface-2)] muted')}>{f}</button>)}</div>}>
      <ul className="max-h-[440px] divide-y divider overflow-y-auto">
        {checks.length === 0 && <li className="py-3 t-body-sm muted">Nothing in this category.</li>}
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-2.5">
            <StatusIcon status={c.status} className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1"><p className="t-body font-medium">{c.label}</p><p className="t-caption muted">{c.detail}</p></div>
            {c.status === 'fail' && <Badge tone={c.severity === 'critical' ? 'danger' : 'warn'}>{c.severity}</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TamperingPanel({ tampering, image, provider }) {
  const [view, setView] = useState('regions');
  if (!tampering) return <Card title="Document integrity" icon={ShieldAlert}><p className="t-body-sm status-danger">Integrity analysis failed.</p></Card>;
  const sevTone = { high: 'danger', medium: 'warn', low: 'neutral' };
  const boxes = tampering.flags.filter((f) => f.region).map((f) => ({ ...f.region, tone: f.severity, label: f.label }));
  const meta = tampering.evidence?.metadata || {};
  const level = tampering.score >= 50 ? 'high' : tampering.score >= 25 ? 'medium' : 'low';
  return (
    <Card title="Document integrity" subtitle={`${provider || tampering.provider} · ${Math.round(tampering.score)}% manipulation likelihood`} icon={ShieldAlert} actions={<RiskBadge level={level} />}>
      <ProgressBar value={tampering.score} tone={RISK_STYLES[level].solid} />
      {image && (
        <div className="mt-3">
          <div className="mb-2 flex gap-1" role="group" aria-label="Integrity view">
            <button type="button" aria-pressed={view === 'regions'} className={cx('rounded-sm px-2 py-1 t-caption font-medium', view === 'regions' ? 'bg-[var(--ink)] text-[var(--surface)]' : 'bg-[var(--surface-2)] muted')} onClick={() => setView('regions')}>Flagged regions</button>
            {tampering.evidence?.elaImage && <button type="button" aria-pressed={view === 'ela'} className={cx('rounded-sm px-2 py-1 t-caption font-medium', view === 'ela' ? 'bg-[var(--ink)] text-[var(--surface)]' : 'bg-[var(--surface-2)] muted')} onClick={() => setView('ela')}>Error-level map</button>}
          </div>
          <AnnotatedImage src={view === 'ela' ? tampering.evidence.elaImage : image} boxes={boxes} alt="Document with flagged regions" className="w-full" />
        </div>
      )}
      <ul className="mt-3 divide-y divider">
        {tampering.flags.length === 0 && <li className="flex items-center gap-2 py-2 t-body-sm status-ok"><StatusIcon status="pass" className="h-4 w-4" />No manipulation indicators found.</li>}
        {tampering.flags.map((f) => (
          <li key={f.id} className="flex items-start gap-2 py-2.5">
            <Badge tone={sevTone[f.severity]} className="mt-0.5 shrink-0">{f.severity}</Badge>
            <div className="min-w-0"><p className="t-body font-medium">{f.label}{f.field && <span className="ml-1 t-caption faint">· {FIELD_LABELS[f.field] || f.field}</span>}</p><p className="t-caption muted">{f.detail}</p></div>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-2 t-caption">
        {[['Software', meta.software], ['Camera', meta.camera], ['Captured', meta.created ? new Date(meta.created).toLocaleString() : null], ['Modified', meta.modified ? new Date(meta.modified).toLocaleString() : null]].map(([k, v]) => <div key={k}><dt className="faint">{k}</dt><dd className="truncate">{v || '—'}</dd></div>)}
      </dl>
    </Card>
  );
}

export function FacePanel({ face, images, provider, applicability = 'required' }) {
  if (!face && applicability === 'not_applicable') return <Card title="Face comparison" icon={ScanFace} actions={<Badge tone="outline">Not applicable</Badge>}><p className="t-body-sm muted">This document type carries no holder photograph, so no biometric comparison applies. This is not a failure.</p></Card>;
  if (!face) return <Card title="Face comparison" icon={ScanFace}><p className="t-body-sm status-warn">Face comparison was skipped or failed — no live photo was compared.</p></Card>;
  const compared = face.documentFaceFound && face.liveFaceFound;
  const tone = !compared ? 'faint' : face.confidence >= 75 ? 'status-ok' : face.confidence >= 50 ? 'status-warn' : 'status-danger';
  return (
    <Card title="Face comparison" subtitle={`${provider || face.provider}${face.distance != null ? ` · distance ${face.distance}` : ''}`} icon={ScanFace}>
      <div className="flex items-center gap-4">
        <div><p className={cx('t-num tabular', tone)}>{compared ? `${Math.round(face.confidence)}%` : '—'}</p><p className="mt-1 t-caption muted">match confidence</p></div>
        {compared ? <Badge tone={face.match ? 'ok' : 'danger'}>{face.match ? 'Match' : 'No match'}</Badge> : <Badge tone="warn">Not compared</Badge>}
      </div>
      <ProgressBar value={compared ? face.confidence : 0} tone={face.confidence >= 75 ? 'bg-[var(--ok)]' : face.confidence >= 50 ? 'bg-[var(--warn)]' : 'bg-[var(--danger)]'} className="mt-3" />
      {face.note && <p className="mt-2 t-caption status-warn">{face.note}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><p className="mb-1 t-label">Document photo</p>{images?.document ? <AnnotatedImage src={images.document} boxes={face.documentFaceBox ? [{ ...face.documentFaceBox, tone: 'face' }] : []} alt="Document" className="w-full" maxH="max-h-60" /> : <Placeholder />}</div>
        <div><p className="mb-1 t-label">Live photo</p>{images?.live ? <AnnotatedImage src={images.live} boxes={face.liveFaceBox ? [{ ...face.liveFaceBox, tone: 'face' }] : []} alt="Live" className="w-full" maxH="max-h-60" /> : <Placeholder />}</div>
      </div>
    </Card>
  );
}

function Placeholder() { return <div className="flex aspect-[4/3] items-center justify-center rounded-sm bg-[var(--surface-2)] t-caption faint">No image</div>; }
