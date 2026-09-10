/**
 * Orchestrates the four modules for one screening and exposes per-module
 * progress for the processing screen. Modules are resolved via the registry,
 * so the hook (and every component) is provider-agnostic.
 */
import { useCallback, useRef, useState } from 'react';
import { modules, resolveProviders } from '../modules/registry.js';

export const STEP_IDS = ['ocr', 'validation', 'tampering', 'face', 'risk'];
export const STEP_META = {
  ocr: { label: 'OCR extraction', description: 'Reading printed text and MRZ' },
  validation: { label: 'Document validation', description: 'Format rules, expiry, MRZ checksums' },
  tampering: { label: 'Tampering detection', description: 'Error level analysis and metadata' },
  face: { label: 'Face verification', description: 'Comparing live photo with document photo' },
  risk: { label: 'Risk scoring', description: 'Combining all signals' },
};

const initialSteps = () => Object.fromEntries(STEP_IDS.map((id) => [id, { status: 'pending', progress: 0, message: '', durationMs: null, error: null }]));

export function useScreeningPipeline() {
  const [steps, setSteps] = useState(initialSteps);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const update = useCallback((id, patch) => setSteps((s) => ({ ...s, [id]: { ...s[id], ...patch } })), []);

  const run = useCallback(async ({ documentType, documentImage, documentFile, liveImage, options = {} }) => {
    cancelled.current = false;
    setRunning(true);
    setResults(null);
    setSteps(initialSteps());
    const providers = resolveProviders(options);
    const scenario = options.scenario || 'clean';
    const progress = (id) => (p, message) => update(id, { status: 'running', progress: Math.round(p * 100), message });
    const out = { providers, documentType };

    const runStep = async (id, fn) => {
      const t0 = performance.now();
      update(id, { status: 'running', progress: 0, message: 'Starting' });
      try {
        const r = await fn();
        update(id, { status: 'done', progress: 100, message: 'Complete', durationMs: Math.round(performance.now() - t0) });
        return r;
      } catch (e) {
        console.error(`[pipeline] ${id} failed`, e);
        update(id, { status: 'error', progress: 100, message: e.message || 'Failed', error: e.message, durationMs: Math.round(performance.now() - t0) });
        return null;
      }
    };

    try {
      out.ocr = await runStep('ocr', () => modules.ocr({ provider: providers.ocr, imageDataUrl: documentImage, documentType, scenario, onProgress: progress('ocr') }));
      if (cancelled.current) return null;

      out.validation = await runStep('validation', async () => {
        if (!out.ocr) throw new Error('OCR did not produce output');
        progress('validation')(0.5, 'Checking rules');
        return modules.validation(documentType, out.ocr);
      });

      // Tampering and face verification are independent — run them concurrently.
      const [tampering, face] = await Promise.all([
        runStep('tampering', () => modules.tampering({ provider: providers.tamper, imageDataUrl: documentImage, originalFile: documentFile, documentType, scenario, onProgress: progress('tampering') })),
        liveImage
          ? runStep('face', () => modules.face({ provider: providers.face, documentImageDataUrl: documentImage, liveImageDataUrl: liveImage, scenario, onProgress: progress('face') }))
          : Promise.resolve(null).then(() => { update('face', { status: 'skipped', progress: 100, message: 'Skipped — no live photo' }); return null; }),
      ]);
      out.tampering = tampering;
      out.face = face;
      if (cancelled.current) return null;

      out.risk = await runStep('risk', async () => {
        progress('risk')(0.5, 'Weighing factors');
        return modules.risk({ validation: out.validation, tampering: out.tampering, face: out.face, ocr: out.ocr });
      });
      setResults(out);
      return out;
    } finally {
      setRunning(false);
    }
  }, [update]);

  const reset = useCallback(() => { cancelled.current = true; setSteps(initialSteps()); setResults(null); setRunning(false); }, []);

  return { steps, results, running, run, reset };
}
