/**
 * Results panels shared by every document type: the verification-signal
 * checklist, grouped evidence, assessment limitations, QR / barcode detail and
 * identity correlation. Everything shown comes from module output or fusion
 * evidence; sections hide themselves when the data does not exist.
 */
import { ListChecks, Layers, Info, QrCode, Users, CheckCircle2, AlertTriangle, XCircle, MinusCircle, HelpCircle, ScanSearch, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Badge, AnnotatedImage, StatusText } from '../ui/index.jsx';
import { signalChecklist, groupEvidence, assessmentLimitations, SOURCE_LABEL } from './fusionView.js';
import { classifyDecodedContent } from '../../modules/barcode/decode.js';
import { getProfile } from '../../modules/documents/registry.js';
import { ISSUER_NOTICE } from '../../modules/issuer/index.js';
import { cx, caseId, formatDate } from '../../lib/format.js';

const SIGNAL_ICON = {
  pass: [CheckCircle2, 'status-ok'],
  warn: [AlertTriangle, 'status-warn'],
  fail: [XCircle, 'status-danger'],
  unavailable: [HelpCircle, 'status-neutral'],
  not_applicable: [MinusCircle, 'status-neutral'],
  info: [MinusCircle, 'status-neutral'],
};
const SIGNAL_TEXT = { pass: 'Pass', warn: 'Attention', fail: 'Fail', unavailable: 'Unavailable', not_applicable: 'Not applicable', info: 'Info' };

export function SignalsPanel({ fusion }) {
  const rows = signalChecklist(fusion);
  if (!rows.length) return null;
  return (
    <Card title="Verification signals" subtitle="What was checked and how each check ended" icon={ListChecks} padded={false}>
      <ul className="divide-y divider" aria-label="Verification signals">
        {rows.map((r) => {
          const [Icon, tone] = SIGNAL_ICON[r.status] || SIGNAL_ICON.info;
          return (
            <li key={r.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
              <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="t-body font-medium">{r.label}</p>
                {r.detail && <p className="t-caption muted">{r.detail}</p>}
              </div>
              <span className="t-caption tabular muted">{SIGNAL_TEXT[r.status] || r.status}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function EvidenceList({ items, empty, tone }) {
  if (!items.length) return <p className="t-caption muted">{empty}</p>;
  return (
    <ul className="divide-y divider">
      {items.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-2">
          <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', tone)} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="t-body-sm font-medium">{e.label}<span className="ml-2 t-caption faint">{SOURCE_LABEL[e.source] || e.source}</span></p>
            <p className="t-caption muted">{e.explanation}</p>
          </div>
          {e.riskContribution > 0 && <span className="shrink-0 t-code tabular status-danger">+{e.riskContribution}</span>}
        </li>
      ))}
    </ul>
  );
}

export function EvidenceGroupsPanel({ fusion }) {
  const g = groupEvidence(fusion);
  return (
    <Card title="Evidence" subtitle="Supporting, conflicting and unavailable evidence behind the assessment" icon={Layers}>
      <div className="grid gap-5 md:grid-cols-3">
        <section aria-labelledby="ev-supporting">
          <h3 id="ev-supporting" className="t-label mb-1">Supporting evidence <span className="t-caption tabular muted">{g.supporting.length}</span></h3>
          <EvidenceList items={g.supporting} empty="No passing checks." tone="bg-[var(--ok)]" />
        </section>
        <section aria-labelledby="ev-conflicting">
          <h3 id="ev-conflicting" className="t-label mb-1">Conflicting evidence <span className="t-caption tabular muted">{g.conflicting.length}</span></h3>
          <EvidenceList items={g.conflicting} empty="No failing or warning findings." tone="bg-[var(--danger)]" />
        </section>
        <section aria-labelledby="ev-unavailable">
          <h3 id="ev-unavailable" className="t-label mb-1">Unavailable checks <span className="t-caption tabular muted">{g.unavailable.length}</span></h3>
          <EvidenceList items={g.unavailable} empty="Every configured check produced a result." tone="bg-[var(--neutral)]" />
        </section>
      </div>
    </Card>
  );
}

export function LimitationsPanel({ fusion, results }) {
  const items = assessmentLimitations(fusion, results);
  return (
    <Card title="Assessment limitations" subtitle="What this screening could not establish" icon={Info}>
      <ul className="space-y-2 t-body-sm">
        {items.map((l) => <li key={l.id} className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 faint" aria-hidden="true" /><span>{l.text}</span></li>)}
      </ul>
      <p className="mt-3 border-t divider pt-3 t-caption muted">{ISSUER_NOTICE}</p>
    </Card>
  );
}

export function BarcodePanel({ barcode, validation, image }) {
  if (!barcode) return null;
  const checks = (validation?.checks || []).filter((c) => /^barcode_/.test(c.id));
  const codes = barcode.codes || [];
  const boxes = codes.filter((c) => c.region).map((c) => ({ ...c.region, tone: 'face', label: c.format }));
  const tone = barcode.status === 'detected' ? 'ok' : barcode.status === 'unreadable' ? 'warn' : 'neutral';
  const label = { detected: `${codes.length} decoded`, not_found: 'None detected', unreadable: 'Unreadable', unavailable: 'Not analysed' }[barcode.status] || barcode.status;
  return (
    <Card title="QR / barcode" subtitle={`${barcode.provider || 'reader'}${barcode.engine ? ` · ${barcode.engine}` : ''}`} icon={QrCode} actions={<Badge tone={tone}>{label}</Badge>}>
      <p className="t-body-sm muted">{barcode.explanation}</p>
      {codes.length > 0 && (
        <ul className="mt-3 divide-y divider">
          {codes.map((c, i) => {
            const kind = classifyDecodedContent(c.rawValue);
            return (
              <li key={i} className="py-2">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="outline">{c.format}</Badge><span className="t-caption muted">{kind.kind === 'url' ? `link · ${kind.host}` : kind.kind}</span>{kind.suspicious && <Badge tone="warn">unusual link</Badge>}</div>
                <pre className="mt-1 max-h-24 overflow-auto rounded-sm bg-[var(--surface-2)] p-2 t-code whitespace-pre-wrap break-all">{c.rawValue}</pre>
              </li>
            );
          })}
        </ul>
      )}
      {image && boxes.length > 0 && <div className="mt-3"><AnnotatedImage src={image} boxes={boxes} alt="Document with decoded code regions" className="w-full" maxH="max-h-60" /></div>}
      {checks.length > 0 && (
        <ul className="mt-3 divide-y divider">
          {checks.map((c) => <li key={c.id} className="flex items-start gap-2 py-2 t-body-sm"><Badge tone={c.status === 'pass' ? 'ok' : c.status === 'fail' ? 'danger' : c.status === 'warn' ? 'warn' : 'neutral'}>{c.status === 'skip' ? 'info' : c.status}</Badge><span><span className="font-medium">{c.label}.</span> <span className="muted">{c.detail}</span></span></li>)}
        </ul>
      )}
      <p className="mt-3 t-caption faint">A code proves only what it encodes. Agreement with the printed fields is a consistency signal, not an authenticity check; links are never opened automatically.</p>
    </Card>
  );
}

const STRENGTH_TONE = { strong: 'danger', moderate: 'warn', weak: 'neutral' };
const KIND_LABEL = { repeat_document: 'Repeated document', same_identity: 'Possible repeated identity', conflicting_identity: 'Conflicting identity record', name_match: 'Name resemblance' };

export function IdentityPanel({ identity, linkBase = '/history' }) {
  if (!identity) return null;
  const links = identity.links || [];
  return (
    <Card title="Identity correlation" subtitle={identity.status === 'unavailable' ? 'Not performed' : `${identity.recordsCompared ?? 0} prior record(s) compared`} icon={Users} actions={<Badge tone={identity.status === 'unavailable' ? 'neutral' : links.length ? 'warn' : 'ok'}>{identity.status === 'unavailable' ? 'Unavailable' : links.length ? `${links.length} potential` : 'None found'}</Badge>}>
      <p className="t-body-sm muted">{identity.explanation}</p>
      {links.length > 0 && (
        <ul className="mt-3 divide-y divider">
          {links.map((l) => (
            <li key={l.screeningId} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STRENGTH_TONE[l.strength] || 'neutral'}>{l.strength}</Badge>
                <p className="t-body font-medium">{KIND_LABEL[l.kind] || l.kind}</p>
                <Link to={`${linkBase}/${l.screeningId}`} className="ml-auto t-code text-[var(--brand)] hover:underline">{caseId({ id: l.screeningId, createdAt: l.createdAt })}</Link>
              </div>
              <p className="mt-1 t-caption muted">{l.explanation}</p>
              <p className="mt-1 t-caption faint">{l.createdAt ? formatDate(l.createdAt) : ''}{l.matchedFields.length ? ` · agrees on ${l.matchedFields.join(', ')}` : ''}{l.conflicts.length ? ` · differs on ${l.conflicts.join(', ')}` : ''}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 t-caption faint">Correlations are indicative only and never assert that two records are the same person; the officer decides.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Watchlist screening                                                  */
/* ------------------------------------------------------------------ */
export function WatchlistPanel({ watchlist }) {
  if (!watchlist) return null;
  const status = watchlist.status;
  const st = status === 'clear' ? 'pass' : status === 'confirmed_match' || status === 'match' ? 'fail' : status === 'unavailable' ? 'unavailable' : 'warn';
  const top = watchlist.matches?.[0];
  return (
    <Card title="Watchlist screening" subtitle={watchlist.source} icon={ScanSearch} actions={watchlist.synthetic ? <Badge tone="warn" dot>Synthetic list</Badge> : null}>
      <StatusText status={st} className="font-medium text-[var(--ink)]">{{ clear: 'CLEAR', confirmed_match: 'CONFIRMED MATCH', match: 'CONFIRMED MATCH', possible_match: 'POSSIBLE MATCH — requires officer review', possible: 'POSSIBLE MATCH — requires officer review', unavailable: 'UNAVAILABLE' }[status] || status}</StatusText>
      <p className="mt-2 t-body-sm muted">{watchlist.explanation}</p>
      {top && <dl className="mt-3 grid grid-cols-2 gap-2 t-body-sm"><div><dt className="t-caption">Record</dt><dd className="t-code">{top.recordId}</dd></div><div><dt className="t-caption">Match type</dt><dd>{String(top.matchType || '').replace('_', ' ')}</dd></div><div><dt className="t-caption">Match confidence</dt><dd className="tabular">{Math.round((top.confidence || 0) * 100)}%</dd></div><div><dt className="t-caption">Fields used</dt><dd>{(watchlist.fieldsUsed || []).join(', ') || '—'}</dd></div></dl>}
      {watchlist.synthetic && <p className="mt-3 t-caption faint">Synthetic demonstration list — not a government, police or immigration database.</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow strip: the SIH module chain with each module's outcome      */
/* ------------------------------------------------------------------ */
const CHAIN = [
  { id: 'ocr', module: '01', label: 'OCR extraction', match: (e) => e.source === 'ocr' },
  { id: 'validation', module: '02', label: 'Document validation', match: (e) => e.source === 'validation' && e.category !== 'barcode' },
  { id: 'tampering', module: '03', label: 'Tampering detection', match: (e) => e.source === 'tampering' },
  { id: 'face', module: '04', label: 'Face verification', match: (e) => e.source === 'face' },
  { id: 'watchlist', label: 'Watchlist', match: (e) => e.source === 'watchlist' },
  { id: 'fusion', label: 'Evidence fusion', match: null },
];

const CHAIN_TONE = { pass: 'status-ok', warn: 'status-warn', fail: 'status-danger', unavailable: 'status-neutral', not_applicable: 'faint', info: 'status-neutral' };
const CHAIN_LABEL = { pass: 'PASS', warn: 'WARNING', fail: 'FAIL', unavailable: 'UNAVAILABLE', not_applicable: 'N/A', info: 'INFO' };

/** Worst status among a module's evidence; `not_applicable` and `unavailable` are never failures. */
export function moduleStatus(fusion, match) {
  const items = (fusion?.evidence || []).filter(match);
  if (!items.length) return 'unavailable';
  if (items.some((e) => e.id === 'face:not_applicable')) return 'not_applicable';
  const usable = items.filter((e) => e.status !== 'unavailable');
  if (!usable.length) return 'unavailable';
  if (usable.some((e) => e.status === 'fail')) return 'fail';
  if (usable.some((e) => e.status === 'warn')) return 'warn';
  return 'pass';
}

export function WorkflowStrip({ fusion, correlations = 0 }) {
  if (!fusion) return null;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="workflow-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id="workflow-heading" className="t-label">Screening workflow</p>
        <p className="t-caption muted">{correlations > 0 ? `${correlations} correlated signal${correlations === 1 ? '' : 's'} between modules` : 'No cross-module correlations'}</p>
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Module chain">
        {CHAIN.map((c) => {
          const status = c.id === 'fusion' ? 'pass' : moduleStatus(fusion, c.match);
          return (
            <li key={c.id} className="rounded-sm hairline px-3 py-2">
              {c.module && <p className="t-code tabular faint">MODULE {c.module}</p>}
              <p className="t-body-sm font-medium leading-tight">{c.label}</p>
              <p className={cx('mt-1 t-caption tabular font-medium', CHAIN_TONE[status])}>{c.id === 'fusion' ? 'COMPLETE' : CHAIN_LABEL[status]}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Section heading that numbers the four mandatory SIH modules on the results page. */
/**
 * Document type detection — what kind of document this is, and the clues behind it.
 * Deliberately separate from every authenticity panel: an unrecognised type says
 * nothing about whether a document has been altered.
 */
export function DetectionPanel({ classification, documentType, preflight }) {
  if (!classification) return null;
  // When the officer fixes the type, the pipeline classifier is told the answer, so its
  // "confidence" is the officer's assertion rather than a measurement. The preflight check
  // ran BEFORE the pipeline and without that hint, so it is the honest detection to show.
  const independent = preflight?.classification || (classification.overridden ? null : classification);
  const detectedId = preflight?.detectedType || independent?.type || null;
  const detectedLabel = detectedId ? getProfile(detectedId).label : null;
  const evidence = independent?.signals || (classification.overridden ? [] : classification.signals) || [];
  const alternatives = preflight?.alternatives?.length ? preflight.alternatives : independent?.alternatives || [];
  const basis = !independent
    ? 'Not independently detected'
    : independent.basis === 'mrz' ? 'Machine readable zone' : independent.basis === 'fallback' ? 'No specific type recognised' : 'Text and layout signals';
  return (
    <Card title="Document type detection" subtitle="What kind of document was presented" icon={ScanSearch}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="t-label">Detected document</dt>
          <dd className="mt-1 t-body font-medium">{detectedLabel || 'Not detected'}</dd>
        </div>
        <div>
          <dt className="t-label">Classification confidence</dt>
          <dd className="mt-1 t-body tabular">{independent ? `${Math.round((independent.confidence || 0) * 100)}%` : 'Not measured'}</dd>
        </div>
        <div>
          <dt className="t-label">Basis</dt>
          <dd className="mt-1 t-body-sm muted">{basis}</dd>
        </div>
      </dl>

      <p className="mt-3 t-body-sm muted">
        {classification.overridden && preflight?.selectedLabel
          ? `The officer selected ${preflight.selectedLabel}. The detection above was run independently, before screening, without being told that selection.`
          : classification.overridden
            ? `The officer set the document type to ${getProfile(documentType).label}; no independent detection was recorded for this screening.`
            : `Screening applied the ${getProfile(documentType).label.toLowerCase()} rule set.`}
      </p>

      {alternatives.length > 0 && (
        <p className="mt-2 t-body-sm">Document type uncertain — competing possibilities: {alternatives.map((a) => a.label).join(', ')}.</p>
      )}

      {evidence.length > 0 && (
        <div className="mt-4 border-t divider pt-3">
          <p className="t-label">Detection evidence</p>
          <ul className="mt-2 space-y-1.5">
            {evidence.slice(0, 8).map((e) => (
              <li key={e.label} className="flex items-start gap-2 t-body-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 faint" aria-hidden="true" />
                <span>{e.label} detected</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 border-t divider pt-3 t-caption muted">
        Document type detection identifies what kind of document this is. It is not an authenticity check, and an unrecognised
        document type does not indicate a fake document.
      </p>
    </Card>
  );
}

export function ModuleHeading({ module, title, note }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b divider pb-2">
      {module && <span className="t-code tabular faint">MODULE {module}</span>}
      <h2 className="t-h3">{title}</h2>
      {note && <span className="t-caption muted">{note}</span>}
    </div>
  );
}
