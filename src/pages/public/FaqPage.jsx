import { PageIntro, Section } from '../../components/public/PublicShell.jsx';

const FAQS = [
  { q: 'What does a result of “tampered” actually mean?', a: 'That the document contradicts itself in a way an ordinary capture does not explain — a printed date disagreeing with the machine readable zone, a check digit that does not match the value beside it, or a region of the image whose statistics differ from the page around it and which overlaps a field already in question. The result names the field and marks the region responsible.' },
  { q: 'Can it be fooled?', a: 'Yes. A physical counterfeit that is internally consistent will pass, because nothing in a photograph reveals the substrate, the hologram or the chip. A forger who alters a field and correctly recomputes every check digit removes one of the strongest signals available. The result states these limits rather than implying completeness.' },
  { q: 'Will a poor photograph be called fake?', a: 'No. Blur, glare, shadow and compression are properties of the photograph, not the document. Where too little can be read, the result says the document could not be read — which is neither an accusation nor a clean bill of health.' },
  { q: 'Does it verify the document with the issuing authority?', a: 'Only where an authorised source is connected, and then the result reports what that source returned. Where none is connected, the result says explicitly that no authorised source was consulted. Document analysis alone cannot establish that a record exists.' },
  { q: 'Do I have to photograph the person as well?', a: 'No. A photograph of the person presenting the document enables comparison against the portrait printed on it. Skipping it costs that one check, which is reported, and never blocks a screening.' },
  { q: 'Can I use the camera and a file together?', a: 'They are alternative ways of submitting one document. Whichever you use is the document that gets analysed; the system never compares a camera capture against an uploaded copy, as that would compare two photographs rather than examine one document.' },
  { q: 'What happens if I pick the wrong document type?', a: 'Screening stops and tells you what the document appears to be. Applying passport rules to a visa produces results that look authoritative and mean nothing, so a confident mismatch is treated as a reason to stop rather than a warning to scroll past.' },
  { q: 'Where do documents and results go?', a: 'Analysis happens in the browser on the workstation doing the screening. Where a backend is configured, records are written to your own project; where none is, they stay on that workstation. There is no shared service holding your cases.' },
  { q: 'Is the assessment the decision?', a: 'No. The system produces an assessment and the evidence behind it. An officer records the decision, and both are kept together so the reasoning can be re-examined later.' },
  { q: 'Which documents are supported?', a: 'Passports, visas, national identity cards, licences and a range of civil and academic certificates, each with its own field rules. A document matching none of them is still screened under generic rules, and the result says so.' },
];

export default function FaqPage() {
  return (
    <>
      <PageIntro eyebrow="FAQ" title="Questions worth asking before trusting a verification tool" lede="Including the ones about what it cannot do." />
      <Section>
        <dl className="mx-auto max-w-3xl divide-y divider overflow-hidden rounded-md border divider bg-[var(--surface)]">
          {FAQS.map((f) => (
            <div key={f.q} className="p-6 md:p-7">
              <dt className="t-h3">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}
