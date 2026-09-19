import { PageIntro, Section } from '../../components/public/PublicShell.jsx';
import { Cpu, Lock, ScrollText, EyeOff, KeyRound, AlertTriangle } from 'lucide-react';

const CONTROLS = [
  { icon: Cpu, title: 'Analysis stays on the workstation', body: 'Text recognition, image forensics and face comparison run in the browser on the machine performing the screening. A document does not have to leave the room to be examined.' },
  { icon: Lock, title: 'Storage is yours', body: 'Where a backend is configured, case records and images are written to your own project. Where none is, they stay in the browser on that workstation. There is no shared service holding your cases.' },
  { icon: ScrollText, title: 'Every screening is auditable', body: 'The evidence, the assessment and the officer decision are kept together, along with which provider produced each result and which checks could not run.' },
  { icon: KeyRound, title: 'Roles are separated', body: 'Officers screen and decide; administration is a distinct role. Access is enforced on the routes, not merely hidden in the interface.' },
  { icon: EyeOff, title: 'No third-party analytics', body: 'The application does not carry advertising or behavioural tracking. Document images are not used to train anything.' },
  { icon: AlertTriangle, title: 'Findings state their limits', body: 'Every result carries what could not be assessed — physical security features, and issuer confirmation where no authority is connected — so a reader is not left to assume completeness.' },
];

export default function SecurityPage() {
  return (
    <>
      <PageIntro
        eyebrow="Security"
        title="Handling identity documents without accumulating risk"
        lede="Identity documents are among the most sensitive records a person has. The design principle is to hold as little as possible, in as few places as possible, for as long as you decide."
      />

      <Section>
        <div className="grid gap-px overflow-hidden rounded-md border divider bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
          {CONTROLS.map((c) => (
            <div key={c.title} className="bg-[var(--surface)] p-6">
              <c.icon className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
              <h3 className="mt-3 t-h3">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed muted">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section bordered title="Responsible disclosure">
        <div className="rounded-md border divider bg-[var(--surface)] p-6 md:p-8">
          <p className="max-w-3xl text-base leading-relaxed muted">
            If you believe you have found a vulnerability, please report it privately before disclosing it publicly, and
            give us a reasonable period to issue a fix. Include enough detail to reproduce the issue. We will confirm
            receipt and keep you informed while it is being addressed.
          </p>
        </div>
      </Section>

      <Section bordered title="What this product is not">
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] p-6 md:p-8">
          <p className="max-w-3xl text-base leading-relaxed">
            Identity Sentinel is a document-analysis tool and an aid to a trained decision. It is not an authorisation
            system, not a legal determination of identity, and not a substitute for confirming a record with the
            authority that issued it. A finding of tampering is evidence to act on, not a verdict; a finding of no
            tampering is the absence of visible contradiction, not proof of genuineness.
          </p>
        </div>
      </Section>
    </>
  );
}
