/**
 * SCREENING RESULT — the document authenticity verdict, and nothing else.
 *
 *   DOCUMENT AUTHENTICITY
 *   [ ORIGINAL / REAL ]  or  [ TAMPERED / FAKE ]
 *   the document image, tampered region boxed in red   (tampered only)
 *   Reason: one sentence
 *
 * One document is analysed — whichever way it arrived, by camera or by file.
 * The two are inputs to the same screening and are never compared with each
 * other. The whole pipeline (OCR, validation, MRZ, QR/barcode, image forensics,
 * portrait and text analysis) still runs and is still stored on the case; this
 * screen reports only what it concluded.
 *
 * Nothing here is specific to any document, field or value: the verdict follows
 * the indicator list, the boxes follow the regions those indicators carry, and
 * the sentence is the one the engine derived from the evidence it actually had.
 */
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { AnnotatedImage } from '../ui/index.jsx';
import { finalVerdict } from '../../modules/authenticity/report.js';
import { cx } from '../../lib/format.js';

export default function VerdictView({ results, images }) {
  const { tampered, unreadable, headline, reason, regions } = finalVerdict(results?.authenticity);
  // Three states, because "could not be read" is neither of the other two: showing
  // it in green as ORIGINAL / REAL would pass a forgery on a bad photograph.
  const Icon = tampered ? ShieldAlert : unreadable ? ShieldQuestion : ShieldCheck;
  const tone = tampered ? 'status-danger' : unreadable ? 'status-warn' : 'status-ok';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section
        className={cx('rounded-sm border p-6 text-center', tampered ? 'border-[var(--danger)] bg-[var(--danger-soft)]' : unreadable ? 'border-[var(--warn)] bg-[var(--warn-soft)]' : 'border-[var(--ok)] bg-[var(--ok-soft)]')}
        aria-label="Document authenticity"
      >
        <p className="t-label">Document authenticity</p>
        <p className={cx('mt-3 flex items-center justify-center gap-3 t-h1', tone)}>
          <Icon className="h-8 w-8 shrink-0" aria-hidden="true" />
          {headline}
        </p>
      </section>

      {/* The tampered region, boxed in red. Drawn only when there is one to point at. */}
      {tampered && regions.length > 0 && images?.document && (
        <AnnotatedImage
          src={images.document}
          boxes={regions}
          alt="Document with the tampered region highlighted in red"
          className="w-full"
          maxH="max-h-[520px]"
        />
      )}

      <p className="t-body"><span className="font-medium">Reason:</span> {reason}</p>
      {unreadable && (
        <>
          <p className="t-body-sm muted">Photograph the page straight on, filling the frame, with the two lines of code at the foot fully visible and in focus, then screen it again.</p>
          {/* What the analysis actually managed to read. Shown only here, where the
              verdict is that it read too little: without it "could not be read" gives
              the officer nothing to act on and nobody anything to diagnose. */}
          <dl className="rounded-sm hairline bg-[var(--surface-2)] p-3 t-code">
            <div className="flex gap-2"><dt className="faint">Code at foot</dt><dd className="min-w-0 flex-1 break-all">{results?.ocr?.mrz ? results.ocr.mrz.lines.join('  ') : 'not found'}</dd></div>
            <div className="mt-1 flex gap-2"><dt className="faint">Text read</dt><dd>{Math.round((results?.ocr?.confidence ?? 0) * 100)}% · page turned {results?.ocr?.orientation ?? 0}°</dd></div>
            <div className="mt-1 flex gap-2"><dt className="faint">Dates found</dt><dd>{results?.ocr?.printedDates?.length ? results.ocr.printedDates.join(', ') : 'none'}</dd></div>
          </dl>
        </>
      )}
    </div>
  );
}
