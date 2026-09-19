/**
 * EVIDENCE REPORT — the verification evidence for one screening, on one page,
 * in a form that prints.
 *
 * Every value here is read from the screening result. Nothing is derived for
 * presentation, nothing is filled in when a module did not run, and no check is
 * hidden because it produced no answer: a check that could not run is stated as
 * NOT AVAILABLE, next to the ones that did. An evidence document that quietly
 * omits what it could not establish reads as though it established it.
 *
 * Recognised text is deliberately absent. Where recognition was poor those
 * characters are precisely the wrong ones, and printing them onto an evidence
 * document presents mis-read values as findings about the document.
 */
import { Printer, FileText } from 'lucide-react';
import { Card } from '../ui/index.jsx';
import { finalVerdict } from '../../modules/authenticity/report.js';
import { AUTH } from '../../modules/authenticity/index.js';
import { parseMrz } from '../../modules/validation/mrz.js';
import { getProfile } from '../../modules/documents/registry.js';
import { cx, formatDate, formatDateTime } from '../../lib/format.js';
import { PRODUCT_NAME } from '../brand/Logo.jsx';
import { FIELD_LABELS } from '../../modules/validation/rules.js';
import { DATE_FIELD_KEYS, IDENTIFIER_FIELD_KEYS } from '../../modules/documents/fields.js';

const DATE_FIELDS = new Set(DATE_FIELD_KEYS);
const ID_FIELDS = new Set([...IDENTIFIER_FIELD_KEYS, 'documentNumber', 'visaNumber']);

const NOT_AVAILABLE = 'Not available';

/** One label / value line. A null, undefined or empty value reads NOT AVAILABLE. */
function Row({ label, value, tone, note }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b divider py-1.5 last:border-b-0">
      <dt className="t-body-sm muted">{label}</dt>
      <dd className={cx('t-body-sm font-medium', missing ? 'faint' : tone)}>
        {missing ? NOT_AVAILABLE : value}
        {note && <span className="ml-2 font-normal faint">{note}</span>}
      </dd>
    </div>
  );
}

const Section = ({ title, children }) => (
  <section className="break-inside-avoid">
    <h3 className="t-label mb-1.5 border-b divider pb-1">{title}</h3>
    <dl>{children}</dl>
  </section>
);

/** Fields the recognition was confident enough about to be worth stating. */
function reliableFields(results) {
  const ocr = results?.ocr;
  if (!ocr?.fields) return [];
  const profile = getProfile(results.documentType);
  const conf = ocr.fieldConfidence || {};
  return Object.keys(ocr.fields)
    .filter((k) => {
      const v = ocr.fields[k];
      if (v === undefined || v === null || v === '' || Array.isArray(v)) return false;
      // A field recognised below the threshold the engine itself refuses to compare
      // is not evidence, and stating it here would lend it a weight it does not have.
      const c = typeof conf[k] === 'number' ? conf[k] : ocr.confidence;
      return typeof c === 'number' && c >= AUTH.MIN_OCR_FOR_FIELDS;
    })
    .map((k) => ({
      key: k,
      label: FIELD_LABELS[k] || k,
      value: DATE_FIELDS.has(k) ? formatDate(ocr.fields[k]) : String(ocr.fields[k]),
      code: ID_FIELDS.has(k),
      profile,
    }));
}

const CROSS_CHECK_TONE = { agree: 'status-ok', disagree: 'status-danger' };
const CROSS_CHECK_TEXT = { agree: 'Consistent', disagree: 'Inconsistent' };

export default function EvidenceReport({ results, caseRef }) {
  const authenticity = results?.authenticity;
  const { tampered, headline, reason } = finalVerdict(authenticity);
  const ocr = results?.ocr;
  const profile = getProfile(results?.documentType);
  const fields = reliableFields(results);

  const mrzParsed = ocr?.mrz ? parseMrz(ocr.mrz) : null;
  const checks = mrzParsed?.checks || [];
  const verified = checks.filter((c) => c.ok).length;

  const detected = (authenticity?.indicators || []).filter((i) => i.status === 'detected');
  const forensicsRan = Boolean(results?.tampering);
  const comparable = authenticity?.compared || [];
  const faceRan = results?.face && results.face.status !== 'unavailable';

  return (
    <Card
      title="Evidence"
      subtitle="The verification evidence for this screening"
      icon={FileText}
      actions={(
        <button type="button" className="btn-secondary btn-sm no-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />Print evidence
        </button>
      )}
    >
      <div className="space-y-5">
        <Section title="Assessment">
          <Row label="Result" value={headline} tone={tampered ? 'status-danger' : 'status-ok'} />
          <Row label="Basis" value={reason} />
          <Row label="Document type" value={profile?.label} />
          <Row label="Checks completed" value={typeof authenticity?.coverage === 'number' ? `${Math.round(authenticity.coverage * 100)}% of those this document type allows` : null} />
        </Section>

        <Section title="Document data">
          {fields.length
            ? fields.map((f) => <Row key={f.key} label={f.label} value={f.value} tone={f.code ? 't-code' : undefined} />)
            : <Row label="Extracted fields" value={null} />}
        </Section>

        <Section title="Machine readable zone">
          {!profile?.mrz
            ? <Row label="Zone" value={`A ${profile?.label?.toLowerCase() || 'document'} of this type carries none`} />
            : !mrzParsed
              ? <Row label="Zone" value={null} note="none could be read from the image" />
              : (
                <>
                  <Row label="Zone read" value={mrzParsed.format} />
                  <Row label="Check digits" value={`${verified} of ${checks.length} verify`} tone={verified === checks.length ? 'status-ok' : 'status-warn'} />
                  {checks.map((c) => (
                    <Row key={c.id} label={c.label} value={c.ok ? 'Verifies' : 'Does not verify'} tone={c.ok ? 'status-ok' : 'status-warn'} />
                  ))}
                </>
              )}
        </Section>

        <Section title="Field cross-check">
          {comparable.length
            ? comparable.map((c) => (
              <Row
                key={c.field}
                label={c.label || FIELD_LABELS[c.field] || c.field}
                value={c.status === 'not_compared' ? null : CROSS_CHECK_TEXT[c.status]}
                tone={CROSS_CHECK_TONE[c.status]}
                note={c.status === 'not_compared' ? c.reason : null}
              />
            ))
            : <Row label="Cross-check" value={null} note="no field could be read from two independent places" />}
        </Section>

        <Section title="Image forensics">
          {!forensicsRan
            ? <Row label="Analysis" value={null} note="did not run for this screening" />
            : detected.filter((i) => i.category === 'forensics' || i.category === 'metadata').length
              ? detected.filter((i) => i.category === 'forensics' || i.category === 'metadata').map((i, n) => (
                <Row key={`${i.id}-${n}`} label={i.field ? (FIELD_LABELS[i.field] || i.field) : 'Finding'} value={i.explanation} tone="status-warn" />
              ))
              : <Row label="Findings" value="No localised compression, noise or duplication anomaly" tone="status-ok" />}
        </Section>

        <Section title="Other verification">
          <Row
            label="Face verification"
            value={faceRan ? (results.face.match ? 'Portrait matches the person presenting the document' : 'Portrait does not match') : null}
            tone={faceRan ? (results.face.match ? 'status-ok' : 'status-danger') : undefined}
            note={faceRan ? null : 'no live photo was compared'}
          />
          <Row label="Watchlist screening" value={results?.watchlist?.status === 'clear' ? 'No match' : results?.watchlist?.hits?.length ? `${results.watchlist.hits.length} match(es)` : null} tone={results?.watchlist?.hits?.length ? 'status-danger' : 'status-ok'} />
          <Row label="Issuer verification" value={results?.issuer?.status === 'unavailable' ? null : results?.issuer?.status} note={results?.issuer?.status === 'unavailable' ? 'no issuer source was contacted' : null} />
        </Section>

        {(authenticity?.limitations || []).length > 0 && (
          <Section title="Limitations of this analysis">
            <ul className="mt-1 list-disc space-y-1 pl-4 t-body-sm muted">
              {authenticity.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </Section>
        )}

        <p className="t-caption break-inside-avoid border-t divider pt-2">
          {PRODUCT_NAME} evidence report{caseRef ? ` · ${caseRef}` : ''} · generated {formatDateTime(new Date().toISOString())}
        </p>
      </div>
    </Card>
  );
}
