import { useRef, useState } from 'react';
import { Upload, Camera, X, FileImage } from 'lucide-react';
import { DOCUMENT_TYPES } from '../../modules/types.js';
import { fileToDataUrl, resizeDataUrl } from '../../lib/image.js';
import { cx } from '../../lib/format.js';

/**
 * Step 1: choose document type and upload/scan the document image.
 * On tablets/phones the "Scan with camera" button opens the rear camera directly.
 */
export default function DocumentUpload({ documentType, onDocumentType, image, onImage, onNext }) {
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file (JPG/PNG).'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Image is larger than 15 MB.'); return; }
    setError('');
    const raw = await fileToDataUrl(file);
    const dataUrl = await resizeDataUrl(raw, 1600, 0.95);
    onImage({ dataUrl, file, name: file.name });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="label">Document type</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {DOCUMENT_TYPES.map((d) => (
            <button key={d.value} type="button" onClick={() => onDocumentType(d.value)} className={cx('min-h-12 rounded-lg border px-3 py-2 text-sm font-medium transition', documentType === d.value ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label">Document image</p>
        {!image ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
            className={cx('flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white')}
          >
            <FileImage className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">Drop a photo of the document here</p>
            <p className="mt-1 text-xs text-slate-500">Flat, well-lit, all four corners visible. MRZ lines must be readable.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary" onClick={() => camRef.current?.click()}><Camera className="h-5 w-5" />Scan with camera</button>
              <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload className="h-5 w-5" />Upload file</button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span className="truncate">{image.name || 'Captured image'}</span>
              <button type="button" className="btn-ghost min-h-9 px-2 py-1 text-xs" onClick={() => onImage(null)}><X className="h-4 w-4" />Replace</button>
            </div>
            <div className="flex justify-center bg-slate-900 p-2"><img src={image.dataUrl} alt="Document" className="max-h-[360px] w-auto max-w-full rounded object-contain" /></div>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-primary sm:min-w-44" disabled={!image} onClick={onNext}>Continue to live photo</button>
      </div>
    </div>
  );
}
