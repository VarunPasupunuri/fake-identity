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
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { AnnotatedImage } from '../ui/index.jsx';
import { finalVerdict } from '../../modules/authenticity/report.js';
import { cx } from '../../lib/format.js';

export default function VerdictView({ results, images }) {
  const { tampered, headline, reason, regions } = finalVerdict(results?.authenticity);
  const Icon = tampered ? ShieldAlert : ShieldCheck;
  const tone = tampered ? 'status-danger' : 'status-ok';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section
        className={cx('rounded-sm border p-6 text-center', tampered ? 'border-[var(--danger)] bg-[var(--danger-soft)]' : 'border-[var(--ok)] bg-[var(--ok-soft)]')}
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
    </div>
  );
}
