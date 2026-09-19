import { PageIntro, Section } from '../../components/public/PublicShell.jsx';
import { ScanText, ListChecks, ShieldAlert, ScanFace, QrCode, Gauge, History, FolderSearch, FileText, Settings, Users, WifiOff } from 'lucide-react';

const GROUPS = [
  {
    title: 'Reading the document',
    items: [
      { icon: ScanText, title: 'Field extraction', body: 'Printed fields read from the visual zone, per document type, with the layout of real bio pages in mind — bilingual labels, values in columns, values on the row below their heading.' },
      { icon: ListChecks, title: 'Machine readable zone', body: 'TD1, TD2 and TD3 parsed with every check digit verified. The zone is read again on its own when the page-wide pass leaves it in doubt, and put back on its columns when the frame clipped it.' },
      { icon: QrCode, title: 'QR and barcode', body: 'Codes on the document are decoded and any fields inside them are cross-checked against the printed page, as a third independent representation.' },
    ],
  },
  {
    title: 'Judging the document',
    items: [
      { icon: ListChecks, title: 'Validation rules', body: 'Formats, expiry, internal date ordering and the field rules belonging to each document type, each reported as passed, failed or not applicable.' },
      { icon: ShieldAlert, title: 'Image forensics', body: 'Error-level, noise-residual, resampling and copy-move analysis across the page, reported by region rather than as a single opaque score.' },
      { icon: ScanFace, title: 'Face comparison', body: 'The portrait on the document compared with a photograph of the person presenting it. Optional, and its absence costs that check alone.' },
      { icon: Gauge, title: 'Evidence fusion', body: 'Findings combined into one authenticity result, with independent methods pointing at the same field counting for more than either on its own.' },
    ],
  },
  {
    title: 'Running a team',
    items: [
      { icon: History, title: 'Case history', body: 'Every screening retained with its evidence, its result and the decision recorded against it.' },
      { icon: FolderSearch, title: 'Investigations', body: 'Cases grouped and revisited, with the full analysis available long after the screening itself.' },
      { icon: FileText, title: 'Reports', body: 'Throughput, outcomes and review rates drawn from the actual case record — not projections.' },
      { icon: Users, title: 'Roles', body: 'Officer and administrator roles, with administration kept separate from day-to-day screening.' },
      { icon: Settings, title: 'Configurable providers', body: 'Text recognition, forensics, face comparison, watchlist and issuer verification are each swappable, and the result always names which was used.' },
      { icon: WifiOff, title: 'Works on the workstation', body: 'Analysis runs in the browser, so a screening does not depend on sending the document anywhere.' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Features"
        title="Everything a screening needs, and a record of what it found"
        lede="The capability is deliberately unglamorous: read the document accurately, check it thoroughly, and keep an account of both."
      />

      {GROUPS.map((g, i) => (
        <Section key={g.title} title={g.title} bordered={i > 0}>
          <div className="grid gap-px overflow-hidden rounded-md border divider bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => (
              <div key={it.title} className="bg-[var(--surface)] p-6">
                <it.icon className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
                <h3 className="mt-3 t-h3">{it.title}</h3>
                <p className="mt-2 text-sm leading-relaxed muted">{it.body}</p>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}
