/**
 * DOCUMENT AUTHENTICITY — the first thing the officer reads.
 *
 * Shows the authenticity determination, then the three numbers that must never
 * be confused with one another, then why the result came out that way, then the
 * individual tampering indicators behind it.
 *
 * Nothing is computed here: every value comes from `results.authenticity`
 * (modules/authenticity/). The panel's job is to keep the three scores visually
 * separate and to state, on screen, what the analysis cannot establish.
 */
import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Card, Badge } from '../ui/index.jsx';
import { AUTHENTICITY, CATEGORY_LABEL } from '../../modules/authenticity/index.js';
import { cx } from '../../lib/format.js';

const UI = {
  [AUTHENTICITY.TAMPERED]: { icon: ShieldAlert, tone: 'red', headline: 'TAMPERING DETECTED', badge: 'danger' },
  [AUTHENTICITY.ORIGINAL]: { icon: ShieldCheck, tone: 'green', headline: 'CONSISTENT WITH AN ORIGINAL DOCUMENT', badge: 'ok' },
  [AUTHENTICITY.NO_INDICATORS]: { icon: Shield, tone: 'slate', headline: 'NO TAMPERING INDICATORS DETECTED', badge: 'neutral' },
  [AUTHENTICITY.INSUFFICIENT]: { icon: ShieldQuestion, tone: 'amber', headline: 'INSUFFICIENT EVIDENCE', badge: 'warn' },
};
const TONE = {
  green: { text: 'status-ok', border: 'border-[var(--ok)]', bg: 'bg-[var(--ok-soft)]' },
  amber: { text: 'status-warn', border: 'border-[var(--warn)]', bg: 'bg-[var(--warn-soft)]' },
  red: { text: 'status-danger', border: 'border-[var(--danger)]', bg: 'bg-[var(--danger-soft)]' },
  slate: { text: 'status-neutral', border: 'divider', bg: '' },
};
const SEVERITY_TONE = { critical: 'danger', high: 'danger', medium: 'warn', low: 'neutral', none: 'neutral' };

/** One of the three numbers, labelled with what it actually measures. */
function Metric({ label, value, of = 100, meaning, tone = '' }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className={cx('mt-1 t-h2 tabular', tone)}>{value === null || value === undefined ? '—' : `${value}`}<span className="t-body faint">/{of}</span></dd>
      <dd className="mt-0.5 t-caption muted">{meaning}</dd>
    </div>
  );
}

export function AuthenticityPanel({ authenticity, risk, confidence, documentLabel, verificationStatus }) {
  const [open, setOpen] = useState(false);
  if (!authenticity) return null;
  const ui = UI[authenticity.status] || UI[AUTHENTICITY.INSUFFICIENT];
  const tone = TONE[ui.tone];
  const Icon = ui.icon;
  const detected = (authenticity.indicators || []).filter((i) => i.status === 'detected');
  const checked = (authenticity.indicators || []).filter((i) => i.status !== 'detected');

  return (
    <section className={cx('rounded-sm border p-5', tone.border, tone.bg)} aria-label="Document authenticity">
      <div className="flex items-start gap-3">
        <Icon className={cx('mt-0.5 h-7 w-7 shrink-0', tone.text)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="t-label">Document authenticity</p>
          <h2 className={cx('mt-1 t-h1', tone.text)}>{ui.headline}</h2>
          {authenticity.severity !== 'none' && (
            <p className="mt-1 t-body-sm">Severity: <Badge tone={SEVERITY_TONE[authenticity.severity]}>{String(authenticity.severity).toUpperCase()}</Badge></p>
          )}

          {/* The three numbers, deliberately side by side so they are read as different things. */}
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 border-t divider pt-4 sm:grid-cols-3">
            <Metric label="Authenticity score" value={authenticity.score} meaning="Evidence about the document itself" tone={tone.text} />
            <Metric label="Risk" value={risk} meaning="Suspicion about this encounter" />
            <Metric label="Analysis confidence" value={confidence} meaning="How much of the analysis could run" />
          </dl>

          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 border-t divider pt-3 sm:grid-cols-2">
            <div><dt className="t-label">Document type</dt><dd className="mt-1 t-body">{documentLabel}</dd></div>
            <div><dt className="t-label">Verification status</dt><dd className="mt-1 t-body">{verificationStatus}</dd></div>
          </dl>

          {/* WHY THIS RESULT */}
          {authenticity.reasons?.length > 0 && (
            <div className="mt-4 border-t divider pt-3">
              <p className="t-label">Why this result</p>
              <ul className="mt-2 space-y-1.5">
                {authenticity.reasons.map((r) => (
                  <li key={r} className="flex items-start gap-2 t-body-sm"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--ink-3)]" aria-hidden="true" />{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** The individual findings, each with its category, severity, field and measured evidence. */
export function TamperingIndicatorsPanel({ authenticity }) {
  const [showChecked, setShowChecked] = useState(false);
  if (!authenticity) return null;
  const all = authenticity.indicators || [];
  const detected = all.filter((i) => i.status === 'detected');
  const checked = all.filter((i) => i.status !== 'detected');

  return (
    <Card title="Tampering indicators" subtitle={detected.length ? `${detected.length} indicator(s) detected` : 'No indicator detected'} icon={ShieldAlert}>
      {detected.length === 0 && <p className="t-body-sm muted">No tampering indicator was raised. The checks that ran are listed below.</p>}

      {detected.length > 0 && (
        <ul className="space-y-3">
          {detected.map((i) => (
            <li key={`${i.id}:${i.field || ''}`} className="rounded-sm hairline p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEVERITY_TONE[i.severity]}>{String(i.severity).toUpperCase()}</Badge>
                <span className="t-code">{i.id}</span>
                <span className="t-caption muted">{CATEGORY_LABEL[i.category] || i.category}</span>
                {i.field && <span className="t-caption muted">· field: {i.field}</span>}
              </div>
              <p className="mt-2 t-body-sm">{i.explanation}</p>
              {i.evidence?.representations && (
                <table className="mt-2 w-full t-caption">
                  <tbody>
                    {i.evidence.representations.map((rep) => (
                      <tr key={rep.source}><td className="py-0.5 pr-4 muted">{rep.source}</td><td className="py-0.5 t-code">{String(rep.value)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 t-caption faint">Finding confidence {Math.round((i.confidence || 0) * 100)}%{i.region ? ` · region ${Math.round(i.region.x * 100)}%,${Math.round(i.region.y * 100)}%` : ''}</p>
            </li>
          ))}
        </ul>
      )}

      {authenticity.correlations?.length > 0 && (
        <div className="mt-4 border-t divider pt-3">
          <p className="t-label">Correlated evidence</p>
          {authenticity.correlations.map((c) => <p key={c.id} className="mt-1.5 t-body-sm">{c.explanation}</p>)}
        </div>
      )}

      {checked.length > 0 && (
        <div className="mt-4 border-t divider pt-3">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setShowChecked((v) => !v)} aria-expanded={showChecked}>
            {showChecked ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showChecked ? 'Hide' : 'Show'} the {checked.length} check(s) that found nothing or could not run
          </button>
          {showChecked && (
            <ul className="mt-2 space-y-1.5">
              {checked.map((i) => (
                <li key={`${i.id}:${i.status}`} className="flex items-start gap-2 t-caption muted">
                  <Badge tone={i.status === 'clear' ? 'ok' : 'outline'}>{i.status === 'clear' ? 'CLEAR' : 'N/A'}</Badge>
                  <span>{i.explanation}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* What this analysis cannot establish. Shown in full, always: the difference between
          forensic evidence and issuer verification is the one thing an officer must not
          have to infer. */}
      <div className="mt-4 border-t divider pt-3">
        <p className="t-label">What this analysis cannot establish</p>
        <ul className="mt-2 space-y-1.5">
          {(authenticity.limitations || []).map((l) => (
            <li key={l} className="flex items-start gap-2 t-caption muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** What was read twice, and whether the two readings agreed. */
export function FieldConsistencyPanel({ authenticity }) {
  const rows = (authenticity?.compared || []).filter((c) => c.status !== 'not_compared');
  if (!rows.length) return null;
  return (
    <Card title="Field cross-check" subtitle="The same field, read from independent places on the document" icon={ShieldCheck}>
      <table className="w-full t-body-sm">
        <thead>
          <tr className="t-label">
            <th className="py-1.5 text-left">Field</th>
            <th className="py-1.5 text-left">Printed</th>
            <th className="py-1.5 text-left">Machine readable / barcode</th>
            <th className="py-1.5 text-left">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const printed = r.values.find((v) => v.source === 'visual');
            const other = r.values.find((v) => v.source !== 'visual');
            return (
              <tr key={r.field} className="border-t divider">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 t-code">{printed ? String(printed.value) : '—'}</td>
                <td className="py-1.5 t-code">{other ? String(other.value) : '—'}</td>
                <td className="py-1.5"><Badge tone={r.status === 'agree' ? 'ok' : 'danger'}>{r.status === 'agree' ? 'AGREE' : 'DISAGREE'}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 t-caption muted">These representations are written by the issuer together, so on an unaltered document they agree. A disagreement is the strongest field-level evidence of alteration obtainable without contacting the issuer.</p>
    </Card>
  );
}
