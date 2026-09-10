/**
 * Document capture with the device camera (MediaDevices API).
 *
 * Flow: request permission → live preview with a document frame → Capture →
 * the frame is drawn to a canvas and handed back as { dataUrl, file, name },
 * the same shape the upload path produces, so the existing screening pipeline
 * is reused unchanged. The MediaStream is stopped on capture, on cancel and on
 * unmount. Every failure mode is shown as an explicit state with an upload
 * fallback — the file picker is never opened silently.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, SwitchCamera, Upload, X, Loader2 } from 'lucide-react';
import { Alert } from '../ui/index.jsx';
import { cx } from '../../lib/format.js';

const CONSTRAINTS = (facing, deviceId) => ({
  audio: false,
  video: deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    : { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
});

/** Map a getUserMedia failure to an operator-readable state. */
export function describeCameraError(err) {
  const name = err?.name || '';
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { code: 'insecure', title: 'Camera requires a secure connection', body: 'Browsers only allow camera access over HTTPS or localhost. Open the console over HTTPS, or upload a document image instead.' };
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return { code: 'denied', title: 'Camera access was denied', body: 'Allow camera access for this site in the browser settings and try again, or upload a document image instead.' };
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return { code: 'nodevice', title: 'No camera was found', body: 'This device has no usable camera. You can upload a document image instead.' };
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return { code: 'busy', title: 'The camera is already in use', body: 'Close other applications or tabs using the camera and try again, or upload a document image instead.' };
  if (name === 'unsupported') return { code: 'unsupported', title: 'This browser cannot access the camera', body: 'Camera capture is not supported here. Use a current version of Chrome, Edge, Safari or Firefox, or upload a document image instead.' };
  return { code: 'unknown', title: 'Camera access is unavailable', body: `${err?.message || 'The camera could not be started.'} You can upload a document image instead.` };
}

export function stopStream(stream) {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
}

/**
 * @param {{ onCapture: (img: { dataUrl: string, file: File, name: string, source: 'camera' }) => void, onCancel: () => void, onUploadInstead: () => void, aspect?: string }} props
 */
export default function DocumentCamera({ onCapture, onCancel, onUploadInstead }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState('requesting'); // requesting | live | error
  const [error, setError] = useState(null);
  const [facing, setFacing] = useState('environment');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [captured, setCaptured] = useState(null); // { dataUrl, file, name, width, height }

  const stop = useCallback(() => { stopStream(streamRef.current); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; }, []);

  // Start / restart the stream whenever facing, device or attempt changes; stop on cleanup.
  useEffect(() => {
    if (captured) return undefined;
    let cancelled = false;
    setState('requesting'); setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { const e = new Error('MediaDevices API unavailable'); e.name = 'unsupported'; throw e; }
        const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS(facing, deviceId));
        if (cancelled) { stopStream(stream); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        setState('live');
        try {
          const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
          if (!cancelled) setDevices(list);
        } catch { /* enumeration is optional */ }
      } catch (e) {
        if (cancelled) return;
        setError(describeCameraError(e));
        setState('error');
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [facing, deviceId, attempt, captured, stop]);

  // Belt and braces: never leave the camera running after unmount.
  useEffect(() => () => stop(), [stop]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const name = `document-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      const file = new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      stop();
      setCaptured({ dataUrl, file, name, width: c.width, height: c.height });
    }, 'image/jpeg', 0.92);
  };

  const retake = () => { setCaptured(null); setAttempt((a) => a + 1); };
  const usePhoto = () => { if (captured) onCapture({ dataUrl: captured.dataUrl, file: captured.file, name: captured.name, source: 'camera' }); };
  const switchCamera = () => {
    if (devices.length > 1) {
      const idx = Math.max(0, devices.findIndex((d) => d.deviceId === deviceId));
      setDeviceId(devices[(idx + 1) % devices.length].deviceId);
    } else setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  /* ---------- captured preview ---------- */
  if (captured) {
    return (
      <section className="surface overflow-hidden" aria-labelledby="capture-heading">
        <header className="flex items-center justify-between border-b divider px-4 py-3"><h3 id="capture-heading" className="t-h3">Captured document</h3><span className="t-caption tabular">{captured.width} × {captured.height}</span></header>
        <div className="flex justify-center bg-[var(--surface-2)] p-3"><img src={captured.dataUrl} alt="Captured document" className="max-h-[420px] w-auto max-w-full rounded-sm hairline object-contain" /></div>
        <footer className="flex flex-col-reverse gap-2 border-t divider p-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={retake}><RefreshCw className="h-4 w-4" aria-hidden="true" />Retake</button>
          <button type="button" className="btn-primary sm:min-w-40" onClick={usePhoto}>Use photo</button>
        </footer>
      </section>
    );
  }

  /* ---------- error state ---------- */
  if (state === 'error') {
    return (
      <section className="surface p-4 sm:p-5" aria-live="polite">
        <Alert tone="warn" title={error?.title}>{error?.body}</Alert>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {error?.code !== 'unsupported' && error?.code !== 'insecure' && <button type="button" className="btn-primary" onClick={() => setAttempt((a) => a + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</button>}
          <button type="button" className="btn-secondary" onClick={onUploadInstead}><Upload className="h-4 w-4" aria-hidden="true" />Upload file instead</button>
          <button type="button" className="btn-ghost sm:ml-auto" onClick={onCancel}>Cancel</button>
        </div>
      </section>
    );
  }

  /* ---------- live preview ---------- */
  return (
    <section className="surface overflow-hidden" aria-labelledby="scan-heading">
      <header className="flex items-center justify-between border-b divider px-4 py-3">
        <h3 id="scan-heading" className="t-h3">Scan document</h3>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel} aria-label="Close camera"><X className="h-4 w-4" aria-hidden="true" />Close</button>
      </header>
      <div className="relative aspect-[4/3] w-full bg-[#111] sm:aspect-[16/10]">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" aria-label="Live camera preview" />
        {/* Document frame: ID-1 / passport proportions, centred */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-[6%]" aria-hidden="true">
          <div className="relative h-full max-h-full w-full max-w-full" style={{ aspectRatio: '1.42 / 1' }}>
            <div className="absolute inset-0 rounded-sm" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.38)' }} />
            {['top-0 left-0 border-t-2 border-l-2', 'top-0 right-0 border-t-2 border-r-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'].map((c) => <span key={c} className={cx('absolute h-7 w-7 border-white/90', c)} />)}
            <div className="absolute inset-0 border border-white/40" />
          </div>
        </div>
        {state === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#111]/80 text-sm text-white"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Requesting camera access…</div>
        )}
      </div>
      <div className="border-t divider p-3">
        <p className="mb-3 text-center t-body-sm muted">Place the document inside the frame and keep it steady.</p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div>{(devices.length > 1 || state === 'live') && <button type="button" className="btn-ghost btn-sm" disabled={state !== 'live'} onClick={switchCamera}><SwitchCamera className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Switch camera</span></button>}</div>
          <button type="button" className="btn-primary min-h-12 min-w-40 px-6" disabled={state !== 'live'} onClick={capture}><Camera className="h-5 w-5" aria-hidden="true" />Capture</button>
          <div className="text-right"><button type="button" className="btn-ghost btn-sm" onClick={onUploadInstead}><Upload className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Upload instead</span></button></div>
        </div>
      </div>
    </section>
  );
}
