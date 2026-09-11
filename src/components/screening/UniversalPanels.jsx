/**
 * Results panels shared by every document type: the verification-signal
 * checklist, grouped evidence, assessment limitations, QR / barcode detail and
 * identity correlation. Everything shown comes from module output or fusion
 * evidence; sections hide themselves when the data does not exist.
 */
import { ListChecks, Layers, Info, QrCode, Users, CheckCircle2, AlertTriangle, XCircle, MinusCircle, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Badge, AnnotatedImage } from '../ui/index.jsx';
import { signalChecklist, groupEvidence, assessmentLimitations, SOURCE_LABEL } from './fusionView.js';
import { classifyDecodedContent } from '../../modules/barcode/decode.js';
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
