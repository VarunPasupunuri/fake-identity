/**
 * VERDICT — what an evaluator sees when the screening finishes.
 *
 * The conclusion, three numbers, one sentence of reasoning, the document's own
 * details, and the decision. Nothing else.
 *
 * The full module-by-module analysis still runs and is still stored; it lives
 * one click away under "Full analysis" for anyone who needs to audit how the
 * conclusion was reached. Compressing the display does not compress the work.
 */
import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield, ChevronDown, ChevronUp, Microscope } from 'lucide-react';
import ResultsView from './ResultsView.jsx';
import { AUTHENTICITY } from '../../modules/authenticity/index.js';
import { DECISION_LABEL } from '../../modules/fusion/index.js';
import { getProfile } from '../../modules/documents/registry.js';
import { formatDate, cx } from '../../lib/format.js';

const UI = {
  [AUTHENTICITY.TAMPERED]: { icon: ShieldAlert, headline: 'TAMPERED / MORPHED', tone: 'red' },
  [AUTHENTICITY.ORIGINAL]: { icon: ShieldCheck, headline: 'ORIGINAL / REAL', tone: 'green' },
  [AUTHENTICITY.NO_INDICATORS]: { icon: Shield, headline: 'NO TAMPERING INDICATORS', tone: 'slate' },
  [AUTHENTICITY.INSUFFICIENT]: { icon: ShieldQuestion, headline: 'INSUFFICIENT EVIDENCE', tone: 'amber' },
};
const TONE = {
  green: { text: 'status-ok', border: 'border-[var(--ok)]', bg: 'bg-[var(--ok-soft)]' },
  amber: { text: 'status-warn', border: 'border-[var(--warn)]', bg: 'bg-[var(--warn-soft)]' },
  red: { text: 'status-danger', border: 'border-[var(--danger)]', bg: 'bg-[var(--danger-soft)]' },
  slate: { text: 'status-neutral', border: 'divider', bg: '' },
};

function Score({ label, value }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="mt-0.5 t-h2 tabular">{value === null || value === undefined ? '—' : value}<span className="t-body faint">/100</span></dd>
    </div>
  );
}

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="mt-0.5 t-body">{value}</dd>
    </div>
  );
}

export default function VerdictView({ results, images, caseRef, linkBase = '/history', children }) {
  const [full, setFull] = useState(false);
  const { authenticity, fusion, ocr, documentType } = results;
  const profile = getProfile(documentType);
  const f = ocr?.fields || {};
  const ui = UI[authenticity?.status] || UI[AUTHENTICITY.INSUFFICIENT];
  const tone = TONE[ui.tone];
  const Icon = ui.icon;
  const date = (v) => (v ? formatDate(v) : null);

  return (
    <div className="space-y-5">
      {/* The conclusion */}
      <section className={cx('rounded-sm border p-5', tone.border, tone.bg)} aria-label="Document authenticity">
        <div className="flex items-start gap-3">
          <Icon className={cx('mt-0.5 h-8 w-8 shrink-0', tone.text)} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="t-label">Document authenticity</p>
            <h2 className={cx('mt-1 t-h1', tone.text)}>{ui.headline}</h2>

            <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3 border-t divider pt-4">
              <Score label="Authenticity" value={authenticity?.score ?? null} />
              <Score label="Risk" value={fusion?.risk?.score ?? null} />
              <Score label="Confidence" value={fusion?.confidence?.score ?? null} />
            </dl>

            {authenticity?.summary && (
              <div className="mt-4 border-t divider pt-3">
                <p className="t-label">Reason</p>
                <p className="mt-1 t-body">{authenticity.summary}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* The document's own details */}
      <section className="surface p-5" aria-label="Document details">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Detail label="Document type" value={profile.label} />
          <Detail label="Name" value={f.fullName || f.studentName || f.employeeName || null} />
          <Detail label="Document number" value={f.documentNumber || f.panNumber || f.visaNumber || f.epicNumber || f.certificateNumber || null} />
          <Detail label="Date of birth" value={date(f.dateOfBirth)} />
          {profile.fields?.some((x) => x.key === 'expiryDate') && <Detail label="Expiry date" value={date(f.expiryDate) || '—'} />}
          {f.nationality && <Detail label="Nationality" value={f.nationality} />}
        </dl>
      </section>

      {/* The decision */}
      <section className="surface p-5" aria-label="System decision">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="t-label">System decision</p>
          {caseRef && <p className="t-code tabular faint">{caseRef}</p>}
        </div>
        <p className="mt-1 t-h2">{(DECISION_LABEL[fusion?.decision] || 'Review required').toUpperCase()}</p>
        <div className="mt-4 border-t divider pt-4">{children}</div>
      </section>

      {/* Everything else, for anyone auditing how this was reached */}
      <div>
        <button type="button" className="btn-secondary" onClick={() => setFull((v) => !v)} aria-expanded={full}>
          <Microscope className="h-4 w-4" aria-hidden="true" />
          {full ? 'Hide full analysis' : 'Show full analysis'}
          {full ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {full && (
          <div className="mt-5 animate-fade-in">
            <ResultsView results={results} images={images} linkBase={linkBase} caseRef={caseRef} />
          </div>
        )}
      </div>
    </div>
  );
}
