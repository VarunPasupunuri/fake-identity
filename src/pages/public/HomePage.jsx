/**
 * PUBLIC LANDING PAGE
 *
 * What the product does, how it decides, and what it does not claim. Every
 * number on this page is either a count taken from the document registry or
 * absent: a verification product that opens with invented accuracy figures has
 * undermined itself before the first document is screened.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, ScanText, ListChecks, ShieldAlert, ScanFace, Gauge, FileCheck2 } from 'lucide-react';
import { Section } from '../../components/public/PublicShell.jsx';
import { listProfiles } from '../../modules/documents/registry.js';

const STAGES = [
  { icon: ScanText, title: 'Extraction', body: 'Printed fields and the machine readable zone are read from one capture, whether it came from the camera or a file.' },
  { icon: ListChecks, title: 'Validation', body: 'Formats, expiry, check digits and agreement between the printed zone, the MRZ and any barcode.' },
  { icon: ShieldAlert, title: 'Integrity', body: 'Compression, noise and resampling analysis across the page, correlated with the fields printed there.' },
  { icon: ScanFace, title: 'Biometrics', body: 'The portrait on the document compared with a photograph of the person presenting it, when one is provided.' },
  { icon: Gauge, title: 'Assessment', body: 'The evidence is combined into one authenticity finding, with the reasoning kept for the case record.' },
  { icon: FileCheck2, title: 'Decision', body: 'An officer records the outcome. Every screening and every decision is retained and auditable.' },
];

export default function PublicHomePage() {
  const supported = listProfiles().filter((p) => p.id !== 'generic_document').length;

  return (
    <>
      <section className="border-b divider bg-[var(--surface)]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 page-gutter py-16 md:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="t-label">Identity &amp; document verification</p>
            <h1 className="mt-3 t-display">Decide whether the document in front of you is genuine.</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed muted">
              Identity Sentinel reads an identity document, checks it against itself, and reports whether the evidence
              supports it being original or shows it has been altered — with the region responsible marked on the page.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="btn-primary">Sign in<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link to="/how-it-works" className="btn-secondary">How it works</Link>
            </div>
            <p className="mt-6 t-caption">
              Runs in the browser. Documents are analysed on the workstation that captured them.
            </p>
          </div>

          <div className="rounded-md border divider bg-[var(--bg)] p-6">
            <p className="t-label">A screening result</p>
            <div className="mt-4 rounded-sm border border-[var(--danger)] bg-[var(--danger-soft)] p-5 text-center">
              <p className="t-label">Document authenticity</p>
              <p className="mt-2 t-h1 status-danger">TAMPERED / FAKE</p>
            </div>
            <p className="mt-4 t-body">
              <span className="font-medium">Reason:</span> Date of birth was altered: it does not match the check digit
              printed beside it in the machine readable zone.
            </p>
            <p className="mt-4 t-caption">
              The finding names the field and the evidence behind it. Where a document is genuine, the result says so
              just as plainly.
            </p>
          </div>
        </div>
      </section>

      <Section title="Six stages, one document" lede="A document is put through the same sequence every time, and each stage records what it could and could not establish.">
        <div className="grid gap-px overflow-hidden rounded-md border divider bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
          {STAGES.map((s) => (
            <div key={s.title} className="bg-[var(--surface)] p-6">
              <s.icon className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
              <h3 className="mt-3 t-h3">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed muted">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section bordered title="What it will not do">
        <div className="grid gap-6 md:grid-cols-3">
          <Claim title="Guess when it cannot read">
            A capture too poor to examine is reported as exactly that. It is never passed off as genuine, and never
            treated as evidence against the document either.
          </Claim>
          <Claim title="Call a document fake on a bad photograph">
            Blur, glare, shadow and compression are properties of the photograph, not of the document. A finding has to
            rest on the document contradicting itself.
          </Claim>
          <Claim title="Claim a verification it did not perform">
            Confirming a record with an issuing authority needs a connection to that authority. Where none is connected,
            the result says so rather than implying otherwise.
          </Claim>
        </div>
      </Section>

      <Section bordered>
        <div className="flex flex-col items-start justify-between gap-6 rounded-md border divider bg-[var(--surface)] p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="t-h2">{supported} document types, one workflow</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed muted">
              Passports, visas, national identity cards, licences and a range of civil and academic certificates — each
              with its own field rules, and each screened through the same pipeline.
            </p>
          </div>
          <Link to="/supported-documents" className="btn-secondary shrink-0">See the list</Link>
        </div>
      </Section>
    </>
  );
}

function Claim({ title, children }) {
  return (
    <div className="border-t-2 border-[var(--brand)] pt-4">
      <h3 className="t-h3">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed muted">{children}</p>
    </div>
  );
}
