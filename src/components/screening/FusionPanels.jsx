/**
 * Results-screen panels for the Evidence Fusion output. Every value shown comes
 * from `results.fusion`; sections hide themselves when the data does not exist.
 */
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, ListChecks, Activity, Link2, GitBranch, ChevronDown, ChevronUp, ArrowDown, Info, ShieldQuestion, Scale } from 'lucide-react';
import { Card, Badge, StatusIcon, ProgressBar, AiDecisionBadge } from '../ui/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../../modules/types.js';
import { DECISION } from '../../modules/fusion/index.js';
import { DECISION_UI, fusionRows, topFactors, unavailableEvidence, pivotSentence, SOURCE_LABEL } from './fusionView.js';
import { formatDate, cx, RISK_STYLES } from '../../lib/format.js';
import { getProfile } from '../../modules/documents/registry.js';

const TONE = {
  green: { text: 'status-ok', badge: 'badge-ok', icon: CheckCircle2, bar: 'bg-[var(--ok)]' },
  amber: { text: 'status-warn', badge: 'badge-warn', icon: AlertTriangle, bar: 'bg-[var(--warn)]' },
  red: { text: 'status-danger', badge: 'badge-danger', icon: XCircle, bar: 'bg-[var(--danger)]' },
  slate: { text: 'status-neutral', badge: 'badge-neutral', icon: HelpCircle, bar: 'bg-[var(--neutral)]' },
};

const STATUS_LABEL = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', unavailable: 'UNAVAILABLE', info: 'INFO', not_applicable: 'N/A' };
const STATUS_TONE = { pass: 'ok', warn: 'warn', fail: 'danger', unavailable: 'neutral', info: 'info', not_applicable: 'outline' };
const SEVERITY_TONE = { critical: 'danger', high: 'danger', medium: 'warn', low: 'neutral', none: 'neutral' };

export function StatusChip({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>;
}

function Points({ value, suffix }) {
  return <span className="shrink-0 rounded-xs bg-[var(--surface-2)] px-1.5 py-0.5 t-code tabular status-danger">+{value}{suffix}</span>;
}

/* ------------------------------------------------------------------ */
/* 1 + 2 + 8: system assessment, risk vs confidence, insufficient state */
/* ------------------------------------------------------------------ */
export function DecisionPanel({ fusion, documentType, ocr, classification, children }) {
  const ui = DECISION_UI[fusion.decision] || DECISION_UI[DECISION.INSUFFICIENT];
  const t = TONE[ui.tone];
  const Icon = t.icon;
  const insufficient = fusion.decision === DECISION.INSUFFICIENT;
  const missing = unavailableEvidence(fusion);
  const risk = fusion.risk || { score: 0, level: 'low' };
  const conf = fusion.confidence || { score: 0, components: [] };
  const riskStyle = RISK_STYLES[risk.level] || RISK_STYLES.low;
  const f = ocr?.fields || {};
  const profile = getProfile(documentType);
  const issuerMissing = missing.some((e) => e.source === 'issuer');
  const otherMissing = missing.filter((e) => e.source !== 'issuer');
  const complete = otherMissing.length === 0;
  const subject = f.fullName || f[profile.subjectField] || 'Unknown subject';
  const identifier = f.documentNumber || f.visaNumber || f[profile.primaryIdentifier] || 'No document number';
  const subjectMeta = [f.nationality, f.dateOfBirth ? `born ${formatDate(f.dateOfBirth)}` : null, f.dateOfDeath ? `died ${formatDate(f.dateOfDeath)}` : null, f.institution || f.university || f.organization || f.issuingAuthority || null].filter(Boolean).join(' · ');
  return (
    <section className="card overflow-hidden animate-slide-up" aria-labelledby="system-assessment-heading">
      <div className={cx('grid gap-6 p-4 sm:p-6', children ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : 'lg:grid-cols-1')}>
        <div className="min-w-0">
          <p className="t-label">Document assessment</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Icon className={cx('h-7 w-7 shrink-0', t.text)} aria-hidden="true" />
            <h2 id="system-assessment-heading" className="t-display">{ui.label}</h2>
          </div>
          <p className="mt-2 t-body">{ui.headline}</p>
          {fusion.confidence?.usesMockProviders && <p className="mt-2"><Badge tone="warn" dot>Demo providers — not real analysis</Badge></p>}

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4" aria-label="Assessment summary">
            <div>
              <dt className="t-label">Risk score</dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="t-num tabular" aria-label={`risk ${risk.score} out of 100`}>{risk.score}<span className="t-body-sm muted"> / 100</span></span>
                <span className={cx("badge", riskStyle.badge)}>{String(risk.level).toUpperCase()}</span>
              </dd>
              <dd className="mt-1 t-caption muted">How suspicious the evidence is</dd>
            </div>
            <div>
              <dt className="t-label">Analysis confidence</dt>
              <dd className="mt-1 t-num tabular" aria-label={`confidence ${conf.score} out of 100`}>{conf.score}<span className="t-body-sm muted"> / 100</span></dd>
              <dd className="mt-1 t-caption muted">How complete the analysis is — not whether the document is genuine</dd>
            </div>
            <div>
              <dt className="t-label">Document type</dt>
              <dd className="mt-1 t-body font-medium">{DOCUMENT_TYPE_LABEL[documentType] || profile.label}</dd>
              <dd className="mt-1 t-caption muted">{classification ? (classification.overridden ? 'Selected by officer' : `Classification confidence ${Math.round((classification.confidence || 0) * 100)}%`) : 'Selected by officer'}</dd>
            </div>
            <div>
              <dt className="t-label">Verification status</dt>
              <dd className="mt-1 t-body font-medium">{fusion.decision === DECISION.VERIFIED ? 'Verified against issuer record' : complete ? 'Document-level analysis complete' : 'Analysis incomplete'}</dd>
              <dd className="mt-1 t-caption muted">{fusion.decision === DECISION.VERIFIED ? 'An issuer source confirmed the record' : issuerMissing ? `Issuer verification not performed${otherMissing.length ? ` · ${otherMissing.length} other check${otherMissing.length === 1 ? '' : 's'} unavailable` : ''}` : complete ? 'All configured checks produced a result' : `${otherMissing.length} check${otherMissing.length === 1 ? '' : 's'} unavailable`}</dd>
            </div>
          </dl>

          <div className="mt-5 border-t divider pt-4">
            <h3 className="truncate t-h2">{subject}</h3>
            <p className="t-body-sm muted"><span className="t-code">{identifier}</span>{subjectMeta ? ` · ${subjectMeta}` : ''}</p>
            <p className="mt-3 t-body">{fusion.rationale}</p>
          </div>

          {insufficient && missing.length > 0 && (
            <div className="mt-4 rounded-sm border border-dashed border-[var(--border-strong)] p-3">
              <p className="flex items-center gap-2 t-body font-semibold"><ShieldQuestion className="h-4 w-4 faint" aria-hidden="true" />Evidence that could not be obtained</p>
              <ul className="mt-2 space-y-1.5 t-body-sm muted">{missing.map((e) => <li key={e.id} className="flex items-start gap-2"><StatusChip status="unavailable" /><span>{e.explanation}</span></li>)}</ul>
              <p className="mt-2 t-caption muted">Unavailable evidence is never treated as proof of fraud. Complete the missing analysis or verify the document manually.</p>
            </div>
          )}
        </div>

        {children && <div className="flex flex-col justify-start gap-2 border-t divider pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">{children}</div>}
      </div>
    </section>
  );
}

/* ---------------------------------- */
/* 3: why this decision?               */
/* ---------------------------------- */
export function WhyPanel({ fusion }) {
  const factors = topFactors(fusion, 6);
  const insufficient = fusion.decision === DECISION.INSUFFICIENT;
  const missing = unavailableEvidence(fusion);
  const supporting = (fusion.correlations || []).filter((c) => c.kind === 'supporting');
  return (
    <Card title="Why this decision?" subtitle="Risk factors with the strongest weight in the assessment" icon={ListChecks}>
      {factors.length === 0 && !insufficient && (
        <div className="space-y-2 t-body-sm">
          <p className="flex items-center gap-2 status-ok"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />No evidence contributed risk.</p>
          {supporting.map((c) => <p key={c.id} className="t-caption muted">{c.explanation}</p>)}
          {missing.length > 0 && <p className="t-caption muted">{missing.length} check(s) unavailable — see the assessment above.</p>}
        </div>
      )}
      {factors.length > 0 && (
        <ol className="divide-y divider">
          {factors.map((x) => (
            <li key={x.id} className="flex items-start gap-3 py-2.5">
              <StatusIcon status={x.status === 'info' ? 'pass' : x.status} className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="t-body font-medium">{x.label}</p><Badge tone={SEVERITY_TONE[x.severity] || 'neutral'}>{x.severity}</Badge><span className="t-caption faint">{SOURCE_LABEL[x.source] || x.source}</span></div>
                <p className="t-caption muted">{x.detail}</p>
              </div>
              <Points value={x.points} />
            </li>
          ))}
        </ol>
      )}
      {insufficient && factors.length > 0 && <p className="mt-3 t-caption muted">These findings exist but the analysis is incomplete, so no automated assessment is defensible.</p>}
    </Card>
  );
}

/* ---------------------------------- */
/* 4 + 5: verification signals + trust */
/* ---------------------------------- */
export function EvidenceFusionPanel({ fusion }) {
  const rows = fusionRows(fusion);
  const overall = fusion.trust?.overall;
  return (
    <Card title="Trust profile" subtitle="Evidence dimensions with their trust scores" icon={Activity} padded={false}
      actions={overall?.available ? <span className="t-body-sm muted">Overall trust <span className="t-code tabular text-[var(--ink)]">{overall.score}</span> / 100</span> : <span className="t-caption faint">Overall trust unavailable</span>}>
      <div className="overflow-x-auto">
        <table className="table table-compact" aria-label="Trust profile">
          <thead>
            <tr><th scope="col">Signal</th><th scope="col">Finding</th><th scope="col" className="w-36">Trust</th><th scope="col" className="w-28">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="whitespace-nowrap font-medium">{r.label}</th>
                <td className="max-w-xs"><span className="line-clamp-2 t-body-sm muted">{r.findings.length ? r.findings.join(' · ') : r.unavailableReason || r.hint}</span></td>
                <td aria-label={`${r.label} trust ${r.trust === undefined ? 'not scored' : r.trust ?? 'unavailable'}`}>
                  {r.trust === undefined ? <span className="t-caption faint">—</span>
                    : r.status === 'not_applicable' ? <span className="t-caption faint">N/A</span>
                    : r.trust === null ? <span className="t-caption faint">Unavailable</span>
                      : <div className="flex items-center gap-2"><ProgressBar value={r.trust} tone={r.trust >= 75 ? 'bg-[var(--ok)]' : r.trust >= 50 ? 'bg-[var(--warn)]' : 'bg-[var(--danger)]'} className="w-16" /><span className="t-code tabular">{r.trust}</span></div>}
                </td>
                <td><StatusChip status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-1.5 border-t divider px-4 py-2 t-caption faint sm:px-5"><Info className="h-3 w-3" aria-hidden="true" />UNAVAILABLE means the check did not run or could not produce a result; it is not a failure.</p>
    </Card>
  );
}

/* ---------------------------------- */
/* 6: conflicting evidence             */
/* ---------------------------------- */
export function CorrelationsPanel({ fusion }) {
  const items = (fusion.correlations || []).filter((c) => c.kind !== 'supporting');
  if (!items.length) return null;
  const byId = Object.fromEntries((fusion.evidence || []).map((e) => [e.id, e]));
  const kindTone = { aggravating: 'danger', conflicting: 'warn', supporting: 'ok' };
  return (
    <Card title="Conflicting evidence" subtitle="Independent findings that point at the same field or region" icon={Link2}>
      <ul className="divide-y divider">
        {items.map((c) => (
          <li key={c.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={kindTone[c.kind]}>{c.kind}</Badge>
              <p className="t-body font-medium">{c.label}</p>
              {c.riskContribution > 0 && <span className="ml-auto"><Points value={c.riskContribution} suffix=" risk" /></span>}
            </div>
            <p className="mt-1 t-caption muted">{c.explanation}</p>
            <div className="mt-2 flex flex-wrap gap-1">{c.refs.map((r) => <span key={r} className="badge badge-outline">{byId[r]?.label || r}</span>)}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------- */
/* 7: evidence chain                   */
/* ---------------------------------- */
export function EvidenceChainPanel({ fusion }) {
  const [open, setOpen] = useState(false);
  const ev = fusion.evidence || [];
  const bySource = {};
  for (const e of ev) bySource[e.source] = (bySource[e.source] || 0) + 1;
  const findings = ev.filter((e) => e.status === 'fail' || e.status === 'warn');
  const unavailable = ev.filter((e) => e.status === 'unavailable');
  const corr = (fusion.correlations || []).filter((c) => c.kind !== 'supporting');
  const ui = DECISION_UI[fusion.decision];
  const Stage = ({ title, children }) => (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--brand)] bg-[var(--surface)]" aria-hidden="true" />
      <p className="t-body font-medium">{title}</p>
      <div className="mt-0.5 t-caption muted">{children}</div>
    </li>
  );
  return (
    <Card title="Evidence chain" subtitle="How the assessment was derived" icon={GitBranch} padded={false}
      actions={<button type="button" className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <>Collapse<ChevronUp className="h-4 w-4" /></> : <>Expand<ChevronDown className="h-4 w-4" /></>}</button>}>
      <ol className="space-y-4 border-l divider m-4 ml-5 pl-4 sm:m-5 sm:ml-6">
        <Stage title="Evidence collected">{Object.entries(bySource).map(([s, n]) => `${SOURCE_LABEL[s] || s} ${n}`).join(' · ')}{unavailable.length ? ` · ${unavailable.length} unavailable` : ''}</Stage>
        <Stage title="Module findings">{findings.length ? findings.map((e) => e.label).join(' · ') : 'No failing or warning findings'}</Stage>
        <Stage title="Conflicting evidence">{corr.length ? corr.map((c) => c.label).join(' · ') : 'None detected'}</Stage>
        <Stage title="Risk score + confidence">Risk <span className="t-code tabular text-[var(--ink)]">{fusion.risk?.score}</span> / 100 ({fusion.risk?.level}) · Confidence <span className="t-code tabular text-[var(--ink)]">{fusion.confidence?.score}</span> / 100</Stage>
        <Stage title="System assessment"><AiDecisionBadge decision={fusion.decision} />{fusion.gates?.length ? <span className="ml-2">via {fusion.gates.join(', ').replace(/_/g, ' ')}</span> : null}</Stage>
      </ol>
      {open && (
        <div className="border-t divider p-4 sm:p-5 animate-fade-in">
          <p className="mb-2 t-label">Per-contribution trace</p>
          {(fusion.chain || []).length === 0 ? <p className="t-body-sm muted">No risk contributions — nothing to trace.</p> : (
            <ul className="space-y-3">
              {fusion.chain.map((link) => (
                <li key={link.evidenceId} className="rounded-sm border divider p-3 t-caption">
                  <p className="flex items-center gap-2 t-body font-medium"><Points value={link.points} />{SOURCE_LABEL[link.source] || link.source}</p>
                  <ol className="mt-2 space-y-1">
                    {link.steps.map((s, i) => <li key={i} className="flex items-start gap-2"><ArrowDown className={cx('mt-0.5 h-3 w-3 shrink-0 faint', i === 0 && 'invisible')} aria-hidden="true" /><span>{s.label}</span></li>)}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {ui && <p className="sr-only">Final system assessment: {ui.label}</p>}
    </Card>
  );
}

/* ---------------------------------- */
/* 10: counterfactual                  */
/* ---------------------------------- */
export function CounterfactualPanel({ fusion }) {
  const [open, setOpen] = useState(false);
  const cf = fusion.counterfactual;
  if (!cf) return null;
  const changes = Boolean(cf.potentialDecision) && cf.potentialDecision !== cf.current;
  return (
    <Card title="What would change this decision?" subtitle="Derived by re-evaluating the same rules with cited evidence verified by the officer" icon={Scale} padded={false}
      actions={<button type="button" className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <>Hide<ChevronUp className="h-4 w-4" /></> : <>Show<ChevronDown className="h-4 w-4" /></>}</button>}>
      <div className="flex flex-wrap items-center gap-2 p-4 t-body-sm sm:p-5">
        <span className="muted">Current</span><AiDecisionBadge decision={cf.current} />
        {changes ? <><span className="muted">could become</span><AiDecisionBadge decision={cf.potentialDecision} /></> : cf.potentialDecision ? <span className="t-caption muted">unchanged even if the cited evidence is verified</span> : null}
      </div>
      {open && (
        <div className="border-t divider p-4 t-body-sm sm:p-5 animate-fade-in">
          <p>{cf.resolution}</p>
          {cf.pivotal?.length > 0 && (
            <ul className="mt-3 space-y-1.5 t-caption">
              {cf.pivotal.map((p) => <li key={p.id} className="flex items-start gap-2"><ArrowDown className="mt-0.5 h-3 w-3 shrink-0 faint" aria-hidden="true" /><span>{pivotSentence(p)}</span></li>)}
            </ul>
          )}
          {cf.reasons?.length > 0 && !cf.pivotal?.length && (
            <ul className="mt-3 space-y-1 t-caption muted">{cf.reasons.map((r) => <li key={r.id}>• {r.label}</li>)}</ul>
          )}
        </div>
      )}
    </Card>
  );
}
