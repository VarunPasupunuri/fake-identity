import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, SwitchCamera } from 'lucide-react';
import { fileToDataUrl, resizeDataUrl } from '../../lib/image.js';

/**
 * Step 2: capture the traveller's live photo via getUserMedia (front camera by
 * default; switchable). Falls back to a file input when the camera is unavailable.
 */
export default function LivePhotoCapture({ image, onImage, onBack, onNext, allowSkip = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [camError, setCamError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (image) return undefined;
    let cancelled = false;
    setReady(false); setCamError('');
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available in this browser.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        setReady(true);
      } catch (e) {
        setCamError(e.message || 'Unable to access camera.');
      }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [facing, image]);

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    onImage({ dataUrl: c.toDataURL('image/jpeg', 0.92), source: 'camera' });
  };

  const handleFile = async (file) => {
    if (!file) return;
    const raw = await fileToDataUrl(file);
    onImage({ dataUrl: await resizeDataUrl(raw, 1200, 0.92), source: 'upload', name: file.name });
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Ask the traveller to look straight at the camera with a neutral expression. Remove hats and glasses if possible.</p>
      <div className="card overflow-hidden">
        <div className="relative flex aspect-[4/3] max-h-[420px] w-full items-center justify-center bg-slate-900">
          {image ? (
            <img src={image.dataUrl} alt="Live capture" className="h-full w-full object-contain" />
          ) : camError ? (
            <div className="px-6 text-center text-sm text-slate-300"><p>{camError}</p><p className="mt-1 text-xs text-slate-400">Upload a photo instead.</p></div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-[70%] w-[45%] rounded-[45%] border-2 border-dashed border-white/60" /></div>
              {!ready && <p className="absolute bottom-3 text-xs text-slate-300">Starting camera…</p>}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 p-3">
          {image ? (
            <button type="button" className="btn-secondary" onClick={() => onImage(null)}><RefreshCw className="h-4 w-4" />Retake</button>
          ) : (
            <>
              <button type="button" className="btn-primary" disabled={!ready} onClick={capture}><Camera className="h-5 w-5" />Capture</button>
              <button type="button" className="btn-secondary" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}><SwitchCamera className="h-4 w-4" />Switch</button>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload photo</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
        <div className="flex gap-2">
          {allowSkip && !image && <button type="button" className="btn-ghost" onClick={onNext}>Skip face check</button>}
          <button type="button" className="btn-primary flex-1 sm:min-w-44" disabled={!image} onClick={onNext}>Run screening</button>
        </div>
      </div>
    </div>
  );
}
