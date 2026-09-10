import { useEffect, useRef, useState } from 'react';
import { Upload, Camera, X, BookUser, Stamp, IdCard, Car, FileBadge, AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { DOCUMENT_TYPES } from '../../modules/types.js';
import { fileToDataUrl, resizeDataUrl } from '../../lib/image.js';
import { assessImageQuality } from '../../lib/imageQuality.js';
import { cx } from '../../lib/format.js';

const ICONS = { passport: BookUser, visa: Stamp, national_id: IdCard, driving_license: Car, permit: FileBadge };
const HINTS = {
  passport: 'Open to the photo page. Both MRZ lines must be fully visible.',
  visa: 'Include the visa sticker and its MRZ if present.',
  national_id: 'Front side with photo. Flatten the card to avoid glare.',
  driving_license: 'Front side. Ensure licence number and validity are legible.',
  permit: 'Include the permit number, validity dates and any stamps.',
};

export default function DocumentUpload({ documentType, onDocumentType, image, onImage, onNext, showGuide = true }) {
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quality, setQuality] = useState(null);

  useEffect(() => {
    if (!image?.dataUrl) { setQuality(null); return; }
    let live = true;
    assessImageQuality(image.dataUrl).then((q) => live && setQuality(q)).catch(() => live && setQuality(null));
    return () => { live = false; };
  }, [image]);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file (JPG/PNG/HEIC exported as JPG).'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Image is larger than 15 MB.'); return; }
    setError(''); setBusy(true);
    try {
      const raw = await fileToDataUrl(file);
      const dataUrl = await resizeDataUrl(raw, 1600, 0.95);
      onImage({ dataUrl, file, name: file.name });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div>
          <p className="label">Document type</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {DOCUMENT_TYPES.map((d) => {
              const Icon = ICONS[d.value];
              const active = documentType === d.value;
              return (
                <button key={d.value} type="button" onClick={() => onDocumentType(d.value)} className={cx('flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-left transition', active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-500/10' : 'divider bg-[var(--surface)] hover:bg-[var(--surface-2)]')}>
                  <Icon className={cx('h-5 w-5', active ? 'text-brand-600 dark:text-brand-300' : 'faint')} />
                  <span className="text-sm font-semibold">{d.label}</span>
                  {d.hasMrz && <span className="text-[10px] font-medium faint">MRZ</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="label">Document image</p>
          {!image ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
              className={cx('relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition', drag ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'divider bg-[var(--surface)]')}
            >
              {showGuide && <div className="pointer-events-none absolute inset-6 rounded-xl border border-dashed border-brand-400/40"><span className="absolute -left-px -top-px h-6 w-6 rounded-tl-xl border-l-2 border-t-2 border-brand-500" /><span className="absolute -right-px -top-px h-6 w-6 rounded-tr-xl border-r-2 border-t-2 border-brand-500" /><span className="absolute -bottom-px -left-px h-6 w-6 rounded-bl-xl border-b-2 border-l-2 border-brand-500" /><span className="absolute -bottom-px -right-px h-6 w-6 rounded-br-xl border-b-2 border-r-2 border-brand-500" /></div>}
              {busy ? <Loader2 className="mb-3 h-10 w-10 animate-spin text-brand-500" /> : <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Camera className="h-7 w-7" /></span>}
              <p className="text-sm font-semibold">Scan or drop the document here</p>
              <p className="mt-1 max-w-sm text-xs muted">{HINTS[documentType]}</p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-primary" onClick={() => camRef.current?.click()}><Camera className="h-5 w-5" />Scan with camera</button>
                <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload className="h-5 w-5" />Upload file</button>
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
          ) : (
            <div className="card overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between border-b divider px-4 py-2 text-xs muted">
                <span className="truncate">{image.name || 'Captured image'}{quality ? ` · ${quality.width}×${quality.height}` : ''}</span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => onImage(null)}><X className="h-4 w-4" />Replace</button>
              </div>
              <div className="relative flex justify-center bg-slate-950 p-2">
                <img src={image.dataUrl} alt="Document" className="max-h-[380px] w-auto max-w-full rounded-lg object-contain" />
                {quality && (
                  <span className={cx('absolute left-4 top-4 badge', quality.issues.length ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')}>
                    {quality.issues.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Quality {quality.score}
                  </span>
                )}
              </div>
              {quality?.issues.length > 0 && (
                <ul className="divide-y divider border-t divider">
                  {quality.issues.map((i) => <li key={i.id} className="flex items-start gap-2 px-4 py-2 text-xs"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /><span><span className="font-semibold">{i.label}.</span> <span className="muted">{i.hint}</span></span></li>)}
                </ul>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn-primary sm:min-w-52" disabled={!image || busy} onClick={onNext}>Continue to live photo</button>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand-500" />Capture tips</p>
          <ul className="mt-2 space-y-1.5 text-xs muted">
            <li>• Lay the document flat on a dark, matte surface.</li>
            <li>• Fill the frame; keep all four corners inside the guide.</li>
            <li>• Avoid glare on laminates and holograms — tilt slightly.</li>
            <li>• MRZ text must be crisp: OCR reads the two bottom lines first.</li>
          </ul>
        </div>
        <div className="surface p-4 text-xs muted">
          <p className="font-semibold text-[var(--ink)]">What happens next</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Text and MRZ are extracted on this device.</li>
            <li>Fields are validated against format and expiry rules.</li>
            <li>The image is checked for splicing and edited metadata.</li>
            <li>The live photo is matched against the document photo.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
