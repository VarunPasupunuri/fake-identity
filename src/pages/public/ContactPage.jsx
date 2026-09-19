/**
 * The form does not post anywhere. No message service is connected, so rather
 * than showing a "message sent" confirmation for something that went nowhere,
 * submitting opens the sender's own mail client with the message composed.
 */
import { useState } from 'react';
import { Mail, Building2, LifeBuoy, ShieldAlert } from 'lucide-react';
import { PageIntro, Section } from '../../components/public/PublicShell.jsx';

const CONTACT_ADDRESS = 'contact@identitysentinel.example';

const CHANNELS = [
  { icon: Building2, title: 'Evaluating the product', body: 'Deployment, supported documents, and what a pilot on your own material would involve.' },
  { icon: LifeBuoy, title: 'Support', body: 'Something behaving unexpectedly in a screening. Include the document type and what the result said.' },
  { icon: ShieldAlert, title: 'Security', body: 'A suspected vulnerability. Please report privately first, with enough detail to reproduce it.' },
];

const SUBJECTS = ['Evaluating the product', 'Support', 'Security', 'Something else'];

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', organisation: '', subject: SUBJECTS[0], message: '' });
  const [touched, setTouched] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const invalid = {
    name: !form.name.trim(),
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()),
    message: form.message.trim().length < 10,
  };
  const hasErrors = Object.values(invalid).some(Boolean);

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    const body = [
      `Name: ${form.name}`,
      form.organisation ? `Organisation: ${form.organisation}` : null,
      `Email: ${form.email}`,
      '',
      form.message,
    ].filter((l) => l !== null).join('\n');
    window.location.href = `mailto:${CONTACT_ADDRESS}?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <PageIntro eyebrow="Contact" title="Talk to us about your documents and your queue" lede="Tell us what you are screening, in what volume, and where the current process is failing you." />

      <Section>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <form onSubmit={submit} noValidate className="rounded-md border divider bg-[var(--surface)] p-6 md:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" id="name" required error={touched && invalid.name && 'Enter your name.'}>
                <input id="name" className="input" value={form.name} onChange={set('name')} autoComplete="name" />
              </Field>
              <Field label="Work email" id="email" required error={touched && invalid.email && 'Enter a valid email address.'}>
                <input id="email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="email" />
              </Field>
              <Field label="Organisation" id="org" hint="Optional">
                <input id="org" className="input" value={form.organisation} onChange={set('organisation')} autoComplete="organization" />
              </Field>
              <Field label="Subject" id="subject">
                <select id="subject" className="input" value={form.subject} onChange={set('subject')}>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-5">
              <Field label="Message" id="message" required error={touched && invalid.message && 'A sentence or two is enough, but we need something to go on.'}>
                <textarea id="message" rows={6} className="input py-2" value={form.message} onChange={set('message')} />
              </Field>
            </div>
            <button type="submit" className="btn-primary mt-6"><Mail className="h-4 w-4" aria-hidden="true" />Compose email</button>
            <p className="mt-3 t-caption">
              This opens your own mail application with the message ready to send. Nothing is transmitted from this page.
            </p>
          </form>

          <div className="space-y-5">
            {CHANNELS.map((c) => (
              <div key={c.title} className="rounded-md border divider bg-[var(--surface)] p-5">
                <c.icon className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
                <h3 className="mt-3 t-h3">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed muted">{c.body}</p>
              </div>
            ))}
            <div className="rounded-md border divider p-5">
              <p className="t-label">Email</p>
              <a className="mt-1 block t-code hover:underline" href={`mailto:${CONTACT_ADDRESS}`}>{CONTACT_ADDRESS}</a>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

function Field({ label, id, required, hint, error, children }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}{required && <span aria-hidden="true"> *</span>}
        {hint && <span className="ml-1 font-normal faint">{hint}</span>}
      </label>
      {children}
      {error && <p className="field-error mt-1.5">{error}</p>}
    </div>
  );
}
