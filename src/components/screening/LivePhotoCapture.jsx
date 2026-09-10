import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, SwitchCamera, Timer, AlertTriangle } from 'lucide-react';
import { fileToDataUrl, resizeDataUrl } from '../../lib/image.js';
import { assessImageQuality } from '../../lib/imageQuality.js';
import { cx } from '../../lib/format.js';

export default function LivePhotoCapture({ image, onImage, onBack, onNext, allowSkip = true, showGuide = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [camError, setCamError] = useState('');
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [quality, setQuality] = useState(null);

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
      } catch (e) { setCamError(e.message || 'Unable to access camera.'); }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [facing, image]);

  useEffect(() => {
    if (!image?.dataUrl) { setQuality(null); return; }
    let live = true;
    assessImageQuality(image.dataUrl).then((q) => live && setQuality(q)).catch(() => {});
    return () => { live = false; };
  }, [image]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    onImage({ dataUrl: c.toDataURL('image/jpeg', 0.92), source: 'camera' });
  };

  const captureWithCountdown = () => {
    let n = 3; setCount(n);
    const t = setInterval(() => { n -= 1; setCount(n); if (n <= 0) { clearInterval(t); snap(); } }, 600);
  };

  const handleFile = async (file) => {
    if (!file) return;
    const raw = await fileToDataUrl(file);
    onImage({ dataUrl: await resizeDataUrl(raw, 1200, 0.92), source: 'upload', name: file.name });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="relative flex aspect-[4/3] max-h-[460px] w-full items-center justify-center bg-slate-950">
            {image ? (
              <img src={image.dataUrl} alt="Live capture" className="h-full w-full object-contain animate-fade-in" />
            ) : camError ? (
              <div className="px-6 text-center text-sm text-slate-300"><AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-400" /><p>{camError}</p><p className="mt-1 text-xs text-slate-400">Upload a photo instead.</p></div>
            ) : (
              <>
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
                {showGuide && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative h-[72%] w-[46%] max-w-[320px]">
                      <div className="absolute inset-0 rounded-[50%] border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                      {ready && <div className="absolute inset-0 rounded-[50%] border-2 border-brand-400 animate-pulse-ring" />}
                    </div>
                  </div>
                )}
                {count > 0 && <span className="absolute text-8xl font-bold text-white drop-shadow-lg animate-fade-in">{count}</span>}
                {!ready && <p className="absolute bottom-3 text-xs text-slate-300">Starting camera…</p>}
                {ready && <p className="absolute bottom-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white">Align the face inside the oval</p>}
              </>
            )}
            {image && quality && quality.issues.length > 0 && <span className="absolute left-3 top-3 badge bg-amber-500 text-white"><AlertTriangle className="h-3.5 w-3.5" />{quality.issues.map((i) => i.label).join(', ')}</span>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 p-3">
            {image ? (
              <button type="button" className="btn-secondary" onClick={() => onImage(null)}><RefreshCw className="h-4 w-4" />Retake</button>
            ) : (
              <>
                <button type="button" className="btn-primary min-w-36" disabled={!ready || count > 0} onClick={snap}><Camera className="h-5 w-5" />Capture</button>
                <button type="button" className="btn-secondary" disabled={!ready || count > 0} onClick={captureWithCountdown} title="3-second timer"><Timer className="h-4 w-4" />Timer</button>
                <button type="button" className="btn-secondary" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}><SwitchCamera className="h-4 w-4" />Switch</button>
              </>
            )}
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
          <div className="flex gap-2">
            {allowSkip && !image && <button type="button" className="btn-ghost" onClick={onNext}>Skip face check</button>}
            <button type="button" className={cx('btn-primary flex-1 sm:min-w-48')} disabled={!image} onClick={onNext}>Run screening</button>
          </div>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="surface p-4 text-xs muted">
          <p className="text-sm font-semibold text-[var(--ink)]">Live photo guidance</p>
          <ul className="mt-2 space-y-1.5"><li>• Neutral expression, eyes open, facing the camera.</li><li>• Remove hats, masks and sunglasses; prescription glasses are fine.</li><li>• Even lighting on the face; avoid strong backlight.</li><li>• Skipping the face check adds 20 points to the risk score.</li></ul>
        </div>
        <div className="surface p-4 text-xs muted"><p className="text-sm font-semibold text-[var(--ink)]">Privacy</p><p className="mt-1">The live image is compared on this device and stored with the screening record under the officer's account for audit purposes.</p></div>
      </aside>
    </div>
  );
}
