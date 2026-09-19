import { PageIntro, Section } from '../../components/public/PublicShell.jsx';

const PRINCIPLES = [
  { title: 'A finding must be defensible', body: 'Every conclusion is traceable to something the document itself says — a field that contradicts another, a check digit that does not match the value beside it, a region whose compression does not match the page around it. An officer can be asked to justify a decision, so the system has to be able to justify its own.' },
  { title: 'Absence of evidence is not evidence', body: 'A check that could not run is recorded as not run. It never becomes a mark against the document, and it never quietly becomes a clean bill of health.' },
  { title: 'The cost of the two errors is not equal', body: 'Calling a genuine document forged sends a real person into secondary inspection over a bad photograph. Thresholds are set with that in mind: weak signals accumulate and are reported, but only evidence that survives scrutiny produces a finding.' },
  { title: 'The officer decides', body: 'The system produces an assessment and the reasoning behind it. Recording the outcome is a human act, kept in an audit trail alongside the evidence that informed it.' },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About us"
        title="Built around one question that is harder than it looks"
        lede="Whether a document is genuine is rarely obvious from a photograph. Identity Sentinel exists to make that judgement systematic, explainable and repeatable."
      />

      <Section title="What we set out to solve">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4 text-base leading-relaxed muted">
            <p>
              Identity documents are checked constantly — at borders, at counters, in onboarding queues — usually in
              seconds, often from a photograph taken in poor light. The checks that catch a competent forgery are not
              the ones a person can do at a glance: whether a printed date agrees with the machine readable zone,
              whether a check digit matches the value it guards, whether one region of a page was compressed
              differently from the rest.
            </p>
            <p>
              Those checks are mechanical, and a machine does them consistently. What a machine does badly is knowing
              when it has not seen enough to say anything at all — and that is where a verification tool does its real
              damage, by turning a bad photograph into an accusation.
            </p>
          </div>
          <div className="space-y-4 text-base leading-relaxed muted">
            <p>
              So the system is built to separate three outcomes rather than two: the document is consistent with an
              original, the document contradicts itself in a way that indicates alteration, or too little could be read
              to say. The third is reported as plainly as the other two.
            </p>
            <p>
              Everything runs on the workstation performing the screening. Documents are not sent anywhere to be
              analysed, and the record of a screening stays with the organisation that made it.
            </p>
          </div>
        </div>
      </Section>

      <Section bordered title="How we decide what counts as evidence">
        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="border-t divider pt-5">
              <dt className="t-h3">{p.title}</dt>
              <dd className="mt-2 text-sm leading-relaxed muted">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section bordered title="What we do not claim">
        <div className="rounded-md border divider bg-[var(--surface)] p-6 md:p-8">
          <p className="max-w-3xl text-base leading-relaxed muted">
            Identity Sentinel performs document-level analysis. It cannot assess the physical security of a document —
            holograms, watermarks, ultraviolet elements, intaglio printing, the substrate or an embedded chip — because
            those are not present in a photograph. A physical counterfeit that is internally consistent would pass this
            analysis, and the result says so rather than implying a completeness it does not have.
          </p>
          <p className="mt-4 max-w-3xl text-base leading-relaxed muted">
            Confirming that an issuing authority actually holds a record for a document requires a connection to that
            authority. Where one is configured, the result reports what it returned. Where none is configured, the
            result states that no authorised source was consulted.
          </p>
        </div>
      </Section>
    </>
  );
}
