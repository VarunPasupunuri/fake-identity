/**
 * SCREENING RESULT — the SIH PS-26188 sections, concisely.
 *
 *   1 OCR extraction        6 Document authenticity
 *   2 Document validation   7 Tamper location
 *   3 Tampering detection   8 Authenticity score
 *   4 Face verification     9 Final decision
 *   5 Risk assessment
 *
 * Every value comes from the pipeline output. The full module-by-module
 * analysis still runs and is still stored; it sits behind "Show full analysis"
 * for anyone auditing how a conclusion was reached. Compressing the display
 * does not compress the work.
 */
import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield, ChevronDown, ChevronUp, Microscope, Check, X, Minus, ScanText, ListChecks, ScanFace, Gauge, MapPin } from 'lucide-react';
import ResultsView from './ResultsView.jsx';
import { AnnotatedImage, Badge } from '../ui/index.jsx';
import { AUTHENTICITY } from '../../modules/authenticity/index.js';
import { tamperChecklist, tamperRegions, CHECK_STATUS } from '../../modules/authenticity/report.js';
import { DECISION_LABEL } from '../../modules/fusion/index.js';
import { getProfile } from '../../modules/documents/registry.js';
import { FIELDS } from '../../modules/documents/fields.js';
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

/** A numbered section, so the SIH modules are identifiable at a glance. */
function Section({ n, title, icon: Icon, note, children }) {
  return (
    <section className="surface p-5" aria-label={`${n}. ${title}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="t-code faint">{n}</span>
        <h3 className="t-h3 flex items-center gap-2">{Icon && <Icon className="h-4 w-4 faint" aria-hidden="true" />}{title}</h3>
        {note && <span className="ml-auto t-caption muted">{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Verdict({ status }) {
  const map = { [CHECK_STATUS.PASS]: { icon: Check, cls: 'status-ok', text: 'PASS' }, [CHECK_STATUS.FAIL]: { icon: X, cls: 'status-danger', text: 'FAIL' }, [CHECK_STATUS.NOT_APPLICABLE]: { icon: Minus, cls: 'faint', text: 'N/A' } };
  const v = map[status] || map[CHECK_STATUS.NOT_APPLICABLE];
  const I = v.icon;
  return <span className={cx('inline-flex items-center gap-1 t-code', v.cls)}><I className="h-3.5 w-3.5" aria-hidden="true" />{v.text}</span>;
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className={cx('mt-0.5 t-body', value ? '' : 'faint')}>{value || 'Not read'}</dd>
    </div>
  );
}

const DATE_KEYS = new Set(['dateOfBirth', 'expiryDate', 'dateOfIssue', 'validFrom', 'validUntil', 'dateOfDeath', 'dateOfMarriage']);
/** Fields worth putting in front of an evaluator, per document type, in profile order. */
const SHOWN = 8;

export default function VerdictView({ results, images, caseRef, linkBase = '/history', children }) {
  const [full, setFull] = useState(false);
  const { authenticity, fusion, ocr, validation, face, classification, documentType } = results;
  const profile = getProfile(documentType);
  const f = ocr?.fields || {};
  const ui = UI[authenticity?.status] || UI[AUTHENTICITY.INSUFFICIENT];
  const tone = TONE[ui.tone];
  const Icon = ui.icon;

  const checks = tamperChecklist(authenticity);
  const regions = tamperRegions(authenticity);
  const tampered = authenticity?.status === AUTHENTICITY.TAMPERED;

  // The document's own fields, in the order its profile declares them.
  const shown = (profile.fields || [])
    .filter((spec) => f[spec.key] !== undefined && f[spec.key] !== null && f[spec.key] !== '' && typeof f[spec.key] !== 'object')
    .slice(0, SHOWN);

  const failedValidation = (validation?.checks || []).filter((c) => c.status === 'fail');
  const passedValidation = (validation?.checks || []).filter((c) => c.status === 'pass').length;
  // Face verification is shown only when a photo of the person was intentionally provided.
  const faceCompared = Boolean(face) && face.documentFaceFound !== false && face.liveFaceFound !== false && typeof face.confidence === 'number';

  return (
    <div className="space-y-5">
      {/* 6 + 8 — the conclusion and its score, first because it is what the evaluator needs */}
      <section className={cx('rounded-sm border p-5', tone.border, tone.bg)} aria-label="Document authenticity">
        <div className="flex items-start gap-3">
          <Icon className={cx('mt-0.5 h-8 w-8 shrink-0', tone.text)} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="t-label">Document authenticity</p>
            <h2 className={cx('mt-1 t-h1', tone.text)}>{ui.headline}</h2>
            <p className="mt-2 t-body">{authenticity?.summary}</p>
            <dl className="mt-4 grid grid-cols-3 gap-x-6 border-t divider pt-4">
              <div><dt className="t-label">Authenticity</dt><dd className={cx('mt-0.5 t-h2 tabular', tone.text)}>{authenticity?.score ?? '—'}<span className="t-body faint">/100</span></dd></div>
              <div><dt className="t-label">Risk</dt><dd className="mt-0.5 t-h2 tabular">{fusion?.risk?.score ?? '—'}<span className="t-body faint">/100</span></dd></div>
              <div><dt className="t-label">Confidence</dt><dd className="mt-0.5 t-h2 tabular">{fusion?.confidence?.score ?? '—'}<span className="t-body faint">/100</span></dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* 7 — where the tampering is, drawn on the document that was screened */}
      {tampered && regions.length > 0 && images?.document && (
        <Section n="07" title="Tamper location" icon={MapPin} note={`${regions.length} region(s)`}>
          <AnnotatedImage src={images.document} boxes={regions} alt="Document with the suspected regions highlighted" />
          <ul className="mt-3 space-y-1">
            {regions.map((r) => <li key={r.label} className="t-body-sm">{r.label}</li>)}
          </ul>
        </Section>
      )}

      {/* 1 — OCR extraction */}
      <Section n="01" title="OCR extraction" icon={ScanText} note={profile.label}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {shown.length === 0 && <p className="t-body-sm muted">No field could be read from this document.</p>}
          {shown.map((spec) => (
            <Field key={spec.key} label={FIELDS[spec.key]?.label || spec.key} value={DATE_KEYS.has(spec.key) ? formatDate(f[spec.key]) : String(f[spec.key])} />
          ))}
        </dl>
      </Section>

      {/* 2 — Document validation */}
      <Section n="02" title="Document validation" icon={ListChecks} note={validation ? `${passedValidation} passed · ${failedValidation.length} failed` : 'did not run'}>
        {!validation && <p className="t-body-sm muted">Validation did not run.</p>}
        {validation && failedValidation.length === 0 && <p className="t-body-sm"><Verdict status={CHECK_STATUS.PASS} /> All applicable document-standard and field-consistency checks passed.</p>}
        {failedValidation.length > 0 && (
          <ul className="space-y-1.5">
            {failedValidation.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-start gap-2 t-body-sm"><Verdict status={CHECK_STATUS.FAIL} /><span>{c.label}</span></li>
            ))}
          </ul>
        )}
      </Section>

      {/* 3 — Tampering detection */}
      <Section n="03" title="Tampering detection" icon={ShieldAlert} note={`${checks.filter((c) => c.status === CHECK_STATUS.FAIL).length} failed`}>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 t-body-sm">
              <Verdict status={c.status} />
              <span>{c.label}</span>
              {c.status === CHECK_STATUS.FAIL && <Badge tone={c.severity === 'high' || c.severity === 'critical' ? 'danger' : 'warn'}>{String(c.severity).toUpperCase()}</Badge>}
            </li>
          ))}
        </ul>
      </Section>

      {/* 4 — Face verification, only when a photo of the person was provided */}
      {faceCompared && (
        <Section n="04" title="Face verification" icon={ScanFace} note="document portrait vs presented person">
          <p className="t-body-sm">
            <Verdict status={face.match ? CHECK_STATUS.PASS : CHECK_STATUS.FAIL} />{' '}
            {face.match ? 'The portrait on the document matches the person presenting it' : 'The portrait on the document does not match the person presenting it'} ({face.confidence}% match confidence).
          </p>
        </Section>
      )}

      {/* 5 — Risk assessment */}
      <Section n="05" title="Risk assessment" icon={Gauge} note={`${fusion?.risk?.score ?? '—'}/100`}>
        <p className="t-body-sm">{fusion?.risk?.contributions?.length ? fusion.risk.contributions.slice(0, 2).map((c) => c.label).join('; ') : 'No risk factor was raised.'}</p>
      </Section>

      {/* 9 — Final decision */}
      <Section n="09" title="Final decision" note={caseRef}>
        <p className="t-h2">{(DECISION_LABEL[fusion?.decision] || 'Review required').toUpperCase()}</p>
        <div className="mt-4 border-t divider pt-4">{children}</div>
      </Section>

      <div>
        <button type="button" className="btn-secondary" onClick={() => setFull((v) => !v)} aria-expanded={full}>
          <Microscope className="h-4 w-4" aria-hidden="true" />
          {full ? 'Hide full analysis' : 'Show full analysis'}
          {full ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {full && <div className="mt-5 animate-fade-in"><ResultsView results={results} images={images} linkBase={linkBase} caseRef={caseRef} /></div>}
      </div>
    </div>
  );
}
