/**
 * Results-screen panels for the Evidence Fusion output. Every value shown comes
 * from `results.fusion`; sections hide themselves when the data does not exist.
 */
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Gauge, Activity, Link2, GitBranch, ChevronDown, ChevronUp, ArrowDown, Sparkles, Info, ShieldQuestion } from 'lucide-react';
import { Card, Badge, StatusIcon, ProgressBar, RiskGauge, ScoreRing, AiDecisionBadge } from '../ui/index.jsx';
import { DOCUMENT_TYPE_LABEL } from '../../modules/types.js';
import { DECISION } from '../../modules/fusion/index.js';
import { DECISION_UI, fusionRows, topFactors, unavailableEvidence, pivotSentence, SOURCE_LABEL } from './fusionView.js';
import { formatDate, cx } from '../../lib/format.js';

const TONE = {
  green: { bg: 'bg-emerald-50 dark:bg-emerald-500/5', border: 'border-emerald-200 dark:border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', solid: 'bg-emerald-600', icon: CheckCircle2 },
  amber: { bg: 'bg-amber-50 dark:bg-amber-500/5', border: 'border-amber-200 dark:border-amber-500/30', text: 'text-amber-700 dark:text-amber-300', solid: 'bg-amber-500', icon: AlertTriangle },
  red: { bg: 'bg-red-50 dark:bg-red-500/5', border: 'border-red-200 dark:border-red-500/30', text: 'text-red-700 dark:text-red-300', solid: 'bg-red-600', icon: XCircle },
  slate: { bg: 'bg-slate-50 dark:bg-slate-500/5', border: 'border-slate-300 dark:border-slate-500/40', text: 'text-slate-700 dark:text-slate-200', solid: 'bg-slate-500', icon: HelpCircle },
};

const STATUS_LABEL = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', unavailable: 'UNAVAILABLE', info: 'INFO' };
const STATUS_TONE = { pass: 'green', warn: 'amber', fail: 'red', unavailable: 'slate', info: 'blue' };

export function StatusChip({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'slate'} className={cx('font-mono tracking-wide', status === 'unavailable' && 'border border-dashed border-slate-400 bg-transparent')}>{STATUS_LABEL[status] || status}</Badge>;
}

/* ------------------------------------------------------------------ */
/* 1 + 2 + 8: primary decision, risk vs confidence, insufficient state  */
/* ------------------------------------------------------------------ */
export function DecisionPanel({ fusion, documentType, ocr, children }) {
  const ui = DECISION_UI[fusion.decision] || DECISION_UI[DECISION.INSUFFICIENT];
  const t = TONE[ui.tone];
  const Icon = t.icon;
  const insufficient = fusion.decision === DECISION.INSUFFICIENT;
  const missing = insufficient ? unavailableEvidence(fusion) : [];
  const risk = fusion.risk || { score: 0, level: 'low' };
  const conf = fusion.confidence || { score: 0, components: [] };
  const f = ocr?.fields || {};
  return (
    <section className={cx('card overflow-hidden border animate-slide-up', t.border)} aria-labelledby="ai-decision-heading">
      <div className={cx('grid gap-5 p-4 sm:p-6', children ? 'lg:grid-cols-[minmax(0,1.4fr)_auto_17rem]' : 'lg:grid-cols-[minmax(0,1.4fr)_auto]', t.bg)}>
        {/* Decision */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider faint">AI recommendation</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white', t.solid)}><Icon className="h-6 w-6" aria-hidden="true" /></span>
            <h2 id="ai-decision-heading" className={cx('text-3xl font-bold tracking-tight', t.text)}>{ui.label}</h2>
          </div>
          <p className="mt-2 text-sm font-medium">{ui.headline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="slate">{DOCUMENT_TYPE_LABEL[documentType] || documentType}</Badge>
            {fusion.confidence?.usesMockProviders && <Badge tone="amber" dot>Demo providers — not real analysis</Badge>}
          </div>
          <h3 className="mt-3 truncate text-xl font-bold">{f.fullName || 'Unknown subject'}</h3>
          <p className="text-sm muted"><span className="font-mono">{f.documentNumber || f.visaNumber || 'No document number'}</span> · {f.nationality || '—'}{f.dateOfBirth ? ` · born ${formatDate(f.dateOfBirth)}` : ''}</p>
          <p className="mt-3 text-sm leading-relaxed">{fusion.rationale}</p>
          {insufficient && missing.length > 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-slate-400/70 bg-[var(--surface)] p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold"><ShieldQuestion className="h-4 w-4" aria-hidden="true" />Evidence that could not be obtained</p>
              <ul className="mt-1.5 space-y-1 text-xs muted">{missing.map((e) => <li key={e.id} className="flex items-start gap-2"><StatusChip status="unavailable" /><span>{e.explanation}</span></li>)}</ul>
              <p className="mt-2 text-xs muted">Unavailable evidence is never treated as proof of fraud. Complete the missing analysis or verify the document manually.</p>
            </div>
          )}
        </div>

        {/* Risk vs confidence */}
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row lg:flex-col xl:flex-row" role="group" aria-label="Risk and confidence scores">
          <div className="flex flex-col items-center text-center">
            <RiskGauge score={risk.score} level={risk.level} size={132} />
            <p className="text-[11px] font-semibold uppercase tracking-wider faint">Risk score</p>
            <p className="max-w-[9rem] text-[11px] muted">How suspicious the evidence is</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <ScoreRing value={conf.score} label="confidence" size={132} tone={conf.score >= 70 ? 'stroke-brand-500' : conf.score >= 50 ? 'stroke-amber-500' : 'stroke-slate-400'} textTone={conf.score >= 70 ? 'text-brand-600 dark:text-brand-300' : conf.score >= 50 ? 'text-amber-600' : 'text-slate-500'} />
            <p className="text-[11px] font-semibold uppercase tracking-wider faint">Analysis confidence</p>
            <p className="max-w-[9rem] text-[11px] muted">How complete and reliable the analysis is — not whether the document is genuine</p>
          </div>
        </div>

        {children && <div className="flex flex-col justify-center gap-2">{children}</div>}
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
    <Card title="Why this decision?" subtitle="Strongest evidence behind the recommendation" icon={Sparkles}>
      {factors.length === 0 && !insufficient && (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />No evidence contributed risk.</p>
          {supporting.map((c) => <p key={c.id} className="text-xs muted">{c.explanation}</p>)}
          {missing.length > 0 && <p className="text-xs muted">{missing.length} analysis result(s) unavailable — see the decision panel.</p>}
        </div>
      )}
      {factors.length > 0 && (
        <ol className="divide-y divider">
          {factors.map((x) => (
            <li key={x.id} className="flex items-start gap-3 py-2.5">
              <StatusIcon status={x.status === 'info' ? 'pass' : x.status} className="mt-0.5 h-4.5 w-4.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{x.label}</p><Badge tone={x.severity === 'critical' || x.severity === 'high' ? 'red' : x.severity === 'medium' ? 'amber' : 'slate'}>{x.severity}</Badge><span className="text-[11px] faint">{SOURCE_LABEL[x.source] || x.source}</span></div>
                <p className="text-xs muted">{x.detail}</p>
              </div>
              <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 font-mono text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">+{x.points}</span>
            </li>
          ))}
        </ol>
      )}
      {insufficient && factors.length > 0 && <p className="mt-3 text-xs muted">These findings exist but the analysis is incomplete, so no automated recommendation is defensible.</p>}
    </Card>
  );
}

/* ---------------------------------- */
/* 4 + 5: evidence fusion + trust      */
/* ---------------------------------- */
export function EvidenceFusionPanel({ fusion }) {
  const rows = fusionRows(fusion);
  const overall = fusion.trust?.overall;
  return (
    <Card title="Evidence fusion" subtitle="Five evidence dimensions and the document trust profile" icon={Activity}
      actions={overall?.available ? <span className="text-xs muted">Overall trust <span className="font-mono font-semibold text-[var(--ink)]">{overall.score}</span>/100</span> : <span className="text-xs faint">Overall trust unavailable</span>}>
      <ul className="divide-y divider" aria-label="Evidence dimensions">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="truncate text-xs muted">{r.findings.length ? r.findings.join(' · ') : r.unavailableReason || r.hint}</p>
            </div>
            <div className="col-span-2 sm:col-span-1" aria-label={`${r.label} trust ${r.trust ?? 'unavailable'}`}>
              {r.trust === null ? <span className="text-xs faint">Unavailable</span> : (
                <div className="flex items-center gap-2"><ProgressBar value={r.trust} tone={r.trust >= 75 ? 'bg-emerald-500' : r.trust >= 50 ? 'bg-amber-500' : 'bg-red-500'} className="flex-1" /><span className="w-8 text-right font-mono text-xs">{r.trust}</span></div>
              )}
            </div>
            <div className="row-start-1 col-start-2 sm:col-start-3"><StatusChip status={r.status} /></div>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] faint"><Info className="h-3 w-3" aria-hidden="true" />UNAVAILABLE means the analysis did not run or could not produce a result; it is not a failure.</p>
    </Card>
  );
}

/* ---------------------------------- */
/* 6: correlated signals               */
/* ---------------------------------- */
export function CorrelationsPanel({ fusion }) {
  const items = (fusion.correlations || []).filter((c) => c.kind !== 'supporting');
  if (!items.length) return null;
  const byId = Object.fromEntries((fusion.evidence || []).map((e) => [e.id, e]));
  const kindTone = { aggravating: 'red', conflicting: 'amber', supporting: 'green' };
  return (
    <Card title="Correlated signals" subtitle="Independent findings that point at the same field or region" icon={Link2}>
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id} className="rounded-xl border divider bg-[var(--surface-2)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={kindTone[c.kind]}>{c.kind}</Badge>
              <p className="text-sm font-semibold">{c.label}</p>
              {c.riskContribution > 0 && <span className="ml-auto rounded-md bg-red-50 px-2 py-0.5 font-mono text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">+{c.riskContribution} risk</span>}
            </div>
            <p className="mt-1 text-xs muted">{c.explanation}</p>
            <div className="mt-2 flex flex-wrap gap-1">{c.refs.map((r) => <span key={r} className="rounded-md border divider bg-[var(--surface)] px-1.5 py-0.5 text-[11px]">{byId[r]?.label || r}</span>)}</div>
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
      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-[var(--surface)]" aria-hidden="true" />
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-1 text-xs muted">{children}</div>
    </li>
  );
  return (
    <Card title="Evidence chain" subtitle="How the recommendation was derived" icon={GitBranch} padded={false}
      actions={<button type="button" className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <>Collapse<ChevronUp className="h-4 w-4" /></> : <>Expand<ChevronDown className="h-4 w-4" /></>}</button>}>
      <ol className="space-y-4 border-l divider p-4 pl-5 sm:p-5 sm:pl-6">
        <Stage title="Evidence collected">{Object.entries(bySource).map(([s, n]) => `${SOURCE_LABEL[s] || s} ${n}`).join(' · ')}{unavailable.length ? ` · ${unavailable.length} unavailable` : ''}</Stage>
        <Stage title="Module findings">{findings.length ? findings.map((e) => e.label).join(' · ') : 'No failing or warning findings'}</Stage>
        <Stage title="Correlated signals">{corr.length ? corr.map((c) => c.label).join(' · ') : 'None detected'}</Stage>
        <Stage title="Risk score + confidence">Risk <span className="font-mono font-semibold text-[var(--ink)]">{fusion.risk?.score}</span>/100 ({fusion.risk?.level}) · Confidence <span className="font-mono font-semibold text-[var(--ink)]">{fusion.confidence?.score}</span>/100</Stage>
        <Stage title="AI recommendation"><AiDecisionBadge decision={fusion.decision} />{fusion.gates?.length ? <span className="ml-2">via {fusion.gates.join(', ').replace(/_/g, ' ')}</span> : null}</Stage>
      </ol>
      {open && (
        <div className="border-t divider p-4 sm:p-5 animate-fade-in">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider faint">Per-contribution trace</p>
          {(fusion.chain || []).length === 0 ? <p className="text-sm muted">No risk contributions — nothing to trace.</p> : (
            <ul className="space-y-3">
              {fusion.chain.map((link) => (
                <li key={link.evidenceId} className="rounded-xl border divider p-3 text-xs">
                  <p className="flex items-center gap-2 text-sm font-semibold"><span className="rounded-md bg-red-50 px-2 py-0.5 font-mono text-red-700 dark:bg-red-500/15 dark:text-red-300">+{link.points}</span>{SOURCE_LABEL[link.source] || link.source}</p>
                  <ol className="mt-2 space-y-1">
                    {link.steps.map((s, i) => <li key={i} className="flex items-start gap-2"><ArrowDown className={cx('mt-0.5 h-3 w-3 shrink-0 faint', i === 0 && 'invisible')} aria-hidden="true" /><span>{s.label}</span></li>)}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {ui && <p className="sr-only">Final AI recommendation: {ui.label}</p>}
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
    <Card title="What would change this decision?" subtitle="Derived by re-evaluating the same rules with cited evidence verified by the officer" icon={Gauge} padded={false}
      actions={<button type="button" className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <>Hide<ChevronUp className="h-4 w-4" /></> : <>Show<ChevronDown className="h-4 w-4" /></>}</button>}>
      <div className="flex flex-wrap items-center gap-2 p-4 text-sm sm:p-5">
        <span className="muted">Current</span><AiDecisionBadge decision={cf.current} />
        {changes ? <><span className="muted">→ could become</span><AiDecisionBadge decision={cf.potentialDecision} /></> : cf.potentialDecision ? <span className="text-xs muted">— unchanged even if the cited evidence is verified</span> : null}
      </div>
      {open && (
        <div className="border-t divider p-4 text-sm sm:p-5 animate-fade-in">
          <p>{cf.resolution}</p>
          {cf.pivotal?.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-xs">
              {cf.pivotal.map((p) => <li key={p.id} className="flex items-start gap-2"><ArrowDown className="mt-0.5 h-3 w-3 shrink-0 faint" aria-hidden="true" /><span>{pivotSentence(p)}</span></li>)}
            </ul>
          )}
          {cf.reasons?.length > 0 && !cf.pivotal?.length && (
            <ul className="mt-3 space-y-1 text-xs muted">{cf.reasons.map((r) => <li key={r.id}>• {r.label}</li>)}</ul>
          )}
        </div>
      )}
    </Card>
  );
}
