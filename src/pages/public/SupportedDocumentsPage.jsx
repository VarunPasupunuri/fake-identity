/**
 * The supported-document list is read from the document registry rather than
 * written out here, so the page cannot drift from what the product actually
 * screens: adding a profile adds it to this page, and removing one removes it.
 */
import { PageIntro, Section } from '../../components/public/PublicShell.jsx';
import { listProfiles, DOCUMENT_CATEGORIES, GENERIC_DOCUMENT } from '../../modules/documents/registry.js';
import { FIELDS } from '../../modules/documents/fields.js';

export default function SupportedDocumentsPage() {
  const profiles = listProfiles().filter((p) => p.id !== GENERIC_DOCUMENT);
  const byCategory = Object.entries(DOCUMENT_CATEGORIES)
    .map(([key, cat]) => ({ key, label: cat.label || key, items: profiles.filter((p) => p.category === key) }))
    .filter((g) => g.items.length);

  return (
    <>
      <PageIntro
        eyebrow="Supported documents"
        title={`${profiles.length} document types, each with its own rules`}
        lede="Every type carries the fields it is expected to have, the checks that apply to it, and guidance for capturing it. Anything unrecognised is still screened, under generic rules."
      />

      {byCategory.map((g, i) => (
        <Section key={g.key} title={g.label} bordered={i > 0}>
          <div className="overflow-x-auto rounded-md border divider">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Key fields read</th>
                  <th scope="col" className="whitespace-nowrap">Machine readable zone</th>
                  <th scope="col" className="whitespace-nowrap">Portrait</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="whitespace-nowrap font-medium">{p.label}</th>
                    <td className="muted">
                      {(p.fields || []).slice(0, 5).map((f) => FIELDS[f.key]?.label || f.key).join(', ') || '—'}
                    </td>
                    <td>{p.mrz ? <span className="badge badge-ok">Yes</span> : <span className="t-caption faint">—</span>}</td>
                    <td>{p.face === 'not_applicable' ? <span className="t-caption faint">—</span> : <span className="badge badge-neutral">Yes</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}

      <Section bordered>
        <div className="rounded-md border divider bg-[var(--surface)] p-6 md:p-8">
          <h2 className="t-h2">Anything else</h2>
          <p className="mt-2 max-w-3xl text-base leading-relaxed muted">
            A document that matches none of these is screened under generic rules: text is extracted, the image is
            examined for manipulation, and whatever internal consistency the document offers is checked. The result
            says that no specific rule set applied, rather than implying a type-specific check took place.
          </p>
        </div>
      </Section>
    </>
  );
}
