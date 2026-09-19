import { Link } from 'react-router-dom';
import { PageIntro, Section } from '../../components/public/PublicShell.jsx';

const STEPS = [
  { n: '01', title: 'Submit one document', body: 'Capture the document with the camera or upload a file. These are two ways of submitting the same document, and only the one submitted is analysed — the system never compares a camera capture against an uploaded copy.' },
  { n: '02', title: 'Confirm the document type', body: 'Choose the type, or let it be detected. If the selected type and the document disagree — a visa submitted as a passport — screening stops there, because passport rules applied to a visa produce meaningless results.' },
  { n: '03', title: 'Read the document', body: 'Printed fields are read from the visual zone and, separately, from the machine readable zone at the foot of the page. Keeping them separate is the point: it is their disagreement that reveals an edit.' },
  { n: '04', title: 'Check it against itself', body: 'Field formats and expiry, MRZ check digits, agreement between the printed zone, the MRZ and any QR or barcode. Each check records whether it ran and what it found.' },
  { n: '05', title: 'Examine the image', body: 'Error-level, noise-residual and resampling analysis across the page, looking for a region whose statistics do not match the rest — and specifically for one that overlaps a field already in question.' },
  { n: '06', title: 'Compare the portrait', body: 'If a photograph of the person presenting the document is provided, it is compared with the portrait printed on it. Skipping this costs that one check and is reported as such; it never blocks a screening.' },
  { n: '07', title: 'Reach a finding', body: 'The evidence is weighed together. Independent methods pointing at the same field count for more than either alone; a single weak signal does not carry a finding by itself.' },
  { n: '08', title: 'Record the decision', body: 'The result names the outcome and the reason for it, and marks the region responsible where there is one. An officer records the decision, and it is kept with the case.' },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        title="From a photograph to a defensible finding"
        lede="Eight steps, in the same order every time. Each one records what it established and what it could not."
      />

      <Section>
        <ol className="space-y-px overflow-hidden rounded-md border divider bg-[var(--border)]">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-[var(--surface)] p-6 md:p-8">
              <div className="grid gap-4 md:grid-cols-[4rem_minmax(0,1fr)]">
                <span className="t-code faint">{s.n}</span>
                <div>
                  <h3 className="t-h2">{s.title}</h3>
                  <p className="mt-2 max-w-3xl text-base leading-relaxed muted">{s.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section bordered title="The three outcomes" lede="A screening ends in one of three states, and the difference between them matters.">
        <div className="grid gap-6 md:grid-cols-3">
          <Outcome tone="ok" title="Original / real">
            The document was examined and nothing in it contradicts itself. Reported only when enough of the document
            could actually be read to make the statement mean something.
          </Outcome>
          <Outcome tone="danger" title="Tampered / fake">
            The document contradicts itself in a way that indicates alteration. The field responsible is named and the
            region it occupies is marked on the page.
          </Outcome>
          <Outcome tone="warn" title="Could not be read">
            Too little was legible to make either statement. Neither an accusation nor a clean bill of health — the
            next step is a better capture.
          </Outcome>
        </div>
      </Section>

      <Section bordered>
        <div className="flex flex-col items-start justify-between gap-6 rounded-md border divider bg-[var(--surface)] p-8 sm:flex-row sm:items-center">
          <p className="max-w-2xl text-base leading-relaxed muted">
            Every check that runs, and every check that could not, is kept with the case — so a decision can be
            re-examined months later on the evidence that was actually available at the time.
          </p>
          <Link to="/features" className="btn-secondary shrink-0">What is included</Link>
        </div>
      </Section>
    </>
  );
}

const TONE = { ok: 'border-[var(--ok)]', danger: 'border-[var(--danger)]', warn: 'border-[var(--warn)]' };
const TEXT = { ok: 'status-ok', danger: 'status-danger', warn: 'status-warn' };

function Outcome({ tone, title, children }) {
  return (
    <div className={`rounded-md border-t-2 ${TONE[tone]} border-x border-b divider bg-[var(--surface)] p-6`}>
      <h3 className={`t-h3 ${TEXT[tone]}`}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed muted">{children}</p>
    </div>
  );
}
