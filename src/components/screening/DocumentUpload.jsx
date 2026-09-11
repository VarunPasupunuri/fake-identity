import { useEffect, useRef, useState } from 'react';
import { Upload, Camera, RefreshCw, BookUser, Stamp, IdCard, Car, FileBadge, AlertTriangle, CheckCircle2, Loader2, FolderOpen, Wand2, ScrollText, GraduationCap, Briefcase, Award, FileQuestion, Vote, FileHeart } from 'lucide-react';
import { SELECTOR_OPTIONS, AUTO_DETECT, selectionGuidance } from '../../modules/documents/registry.js';
import { fileToDataUrl, resizeDataUrl } from '../../lib/image.js';
import { assessImageQuality } from '../../lib/imageQuality.js';
import { Alert } from '../ui/index.jsx';
import DocumentCamera from './DocumentCamera.jsx';
import { cx } from '../../lib/format.js';

const ICONS = {
  [AUTO_DETECT]: Wand2, passport: BookUser, visa: Stamp, national_id: IdCard, driving_license: Car, permit: FileBadge, voter_id: Vote,
  birth_certificate: ScrollText, death_certificate: FileHeart, 'category:academic': GraduationCap, 'category:employment': Briefcase, 'category:certificate': Award, generic_document: FileQuestion,
};
const ACCEPT = 'image/jpeg,image/png,image/webp,image/*';
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Step 1: document type + document source.
 *   Scan with camera → real MediaDevices capture (DocumentCamera)
 *   Upload file      → native file picker
 * Both paths produce the same { dataUrl, file, name } object for the pipeline.
 */
export default function DocumentUpload({ documentType, onDocumentType, image, onImage, onNext, showGuide = true, nextLabel = 'Continue to live photo' }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('choose'); // choose | camera
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quality, setQuality] = useState(null);

  useEffect(() => {
    if (!image?.dataUrl) { setQuality(null); return undefined; }
    let live = true;
    assessImageQuality(image.dataUrl).then((q) => live && setQuality(q)).catch(() => live && setQuality(null));
    return () => { live = false; };
  }, [image]);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Select an image file (JPG, PNG or WebP).'); return; }
    if (file.size > MAX_BYTES) { setError('The image is larger than 15 MB.'); return; }
    setError(''); setBusy(true);
    try {
      const raw = await fileToDataUrl(file);
      const dataUrl = await resizeDataUrl(raw, 1600, 0.95);
      onImage({ dataUrl, file, name: file.name, source: 'upload' });
      setMode('choose');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openPicker = () => { setMode('choose'); fileRef.current?.click(); };
  const onCaptured = async (img) => {
    setError('');
    const dataUrl = await resizeDataUrl(img.dataUrl, 1600, 0.95).catch(() => img.dataUrl);
    onImage({ ...img, dataUrl });
    setMode('choose');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-6">
        {/* Document type — auto-detect by default; manual selection fixes the type */}
        <fieldset>
          <legend className="t-label mb-2">Document type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Document type">
            {SELECTOR_OPTIONS.map((d) => {
              const Icon = ICONS[d.value] || FileBadge;
              const active = documentType === d.value;
              return (
                <button key={d.value} type="button" role="radio" aria-checked={active} onClick={() => onDocumentType(d.value)}
                  className={cx('flex min-h-11 items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors', active ? 'border-[var(--brand)] bg-[var(--brand-soft)] font-medium text-[var(--ink)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]')}>
                  <Icon className={cx('h-4 w-4 shrink-0', active ? 'text-[var(--brand)]' : 'faint')} aria-hidden="true" />
                  <span className="truncate">{d.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 t-caption">{selectionGuidance(documentType)}</p>
        </fieldset>

        {/* Document source */}
        <div>
          <p className="t-label mb-2">Document source</p>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />

          {mode === 'camera' && !image && (
            <DocumentCamera onCapture={onCaptured} onCancel={() => setMode('choose')} onUploadInstead={openPicker} />
          )}

          {mode === 'choose' && !image && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setError(''); setMode('camera'); }} className="surface flex min-h-32 flex-col items-start gap-2 p-4 text-left transition-colors hover:bg-[var(--surface-2)]">
                <Camera className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
                <span className="t-h3">Scan with camera</span>
                <span className="t-body-sm muted">Use the device camera to capture the document directly.</span>
              </button>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
                className={cx('surface flex min-h-32 flex-col items-start gap-2 p-4 transition-colors', drag && 'border-[var(--brand)] bg-[var(--brand-soft)]')}>
                <FolderOpen className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
                <span className="t-h3">Upload file</span>
                <span className="t-body-sm muted">Choose an existing document image (JPG, PNG, WebP; up to 15 MB) or drop it here.</span>
                <button type="button" className="btn-secondary btn-sm mt-auto" onClick={openPicker} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}Choose file</button>
              </div>
            </div>
          )}

          {image && (
            <section className="surface overflow-hidden" aria-label="Selected document">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b divider px-4 py-2.5">
                <span className="t-caption truncate">{image.source === 'camera' ? 'Captured with camera' : image.name || 'Uploaded image'}{quality ? ` · ${quality.width} × ${quality.height}` : ''}</span>
                <div className="flex gap-1">
                  {image.source === 'camera' && <button type="button" className="btn-ghost btn-sm" onClick={() => { onImage(null); setMode('camera'); }}><RefreshCw className="h-4 w-4" aria-hidden="true" />Retake</button>}
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { onImage(null); setMode('choose'); }}>Choose another</button>
                </div>
              </header>
              <div className="relative flex justify-center bg-[var(--surface-2)] p-3">
                <img src={image.dataUrl} alt="Document" className="max-h-[380px] w-auto max-w-full rounded-sm hairline object-contain" />
                {showGuide && quality && (
                  <span className={cx('badge absolute left-4 top-4', quality.issues.length ? 'badge-warn' : 'badge-ok')}>
                    {quality.issues.length ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}Image quality {quality.score}
                  </span>
                )}
              </div>
              {showGuide && quality?.issues.length > 0 && (
                <ul className="divide-y divider border-t divider">
                  {quality.issues.map((i) => <li key={i.id} className="flex items-start gap-2 px-4 py-2 t-body-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 status-warn" aria-hidden="true" /><span><span className="font-medium">{i.label}.</span> <span className="muted">{i.hint}</span></span></li>)}
                </ul>
              )}
            </section>
          )}
          {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
        </div>

        <div className="flex justify-end border-t divider pt-4">
          <button type="button" className="btn-primary sm:min-w-52" disabled={!image || busy} onClick={onNext}>{nextLabel}</button>
        </div>
      </div>

      <aside className="space-y-4 lg:border-l lg:divider lg:pl-6">
        <div>
          <p className="t-h3">Capture guidance</p>
          <ul className="mt-2 space-y-1.5 t-body-sm muted">
            <li>Lay the document flat on a dark, matte surface.</li>
            <li>Fill the frame and keep all four corners visible.</li>
            <li>Avoid glare on laminates and holograms; tilt slightly if needed.</li>
            <li>Keep MRZ lines, seals and QR codes sharp: they are read first.</li>
          </ul>
        </div>
        <div>
          <p className="t-h3">What happens next</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 t-body-sm muted">
            <li>The document type is detected and its information extracted.</li>
            <li>Fields are checked against that document type's rules.</li>
            <li>The image is analysed for alteration and edited metadata.</li>
            <li>Any QR code or barcode is read and compared with the printed fields.</li>
            <li>Where a holder photograph applies, the live photo is compared with it.</li>
            <li>Identifiers are screened against the configured watchlist and prior cases.</li>
          </ol>
          <p className="mt-2 t-caption faint">Official issuer verification requires an authorised external data source and is reported separately.</p>
        </div>
      </aside>
    </div>
  );
}
