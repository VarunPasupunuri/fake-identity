/**
 * Screening orchestrator (framework-free).
 *
 *   OCR → Validation → Tampering ∥ Face ∥ Watchlist → Evidence Fusion → Risk + Confidence → Decision
 *
 * The React hook (hooks/useScreeningPipeline.js) is a thin state wrapper around
 * runScreening(); keeping the flow here makes it testable without a browser.
 *
 * Every module is resolved through the registry, so providers (mock, on-device,
 * cloud) stay swappable. A provider that throws is recorded as an `error` step and
 * its output is null — the fusion engine then reports that evidence as
 * *unavailable* rather than inventing a pass/fail result.
 */
import { modules as defaultModules, resolveProviders } from '../modules/registry.js';
import { toLegacyRisk } from '../modules/fusion/index.js';

export const STEP_IDS = ['ocr', 'validation', 'tampering', 'face', 'watchlist', 'risk'];
export const STEP_META = {
  ocr: { label: 'OCR extraction', description: 'Reading printed text and MRZ' },
  validation: { label: 'Document validation', description: 'Format rules, expiry, MRZ checksums' },
  tampering: { label: 'Tampering detection', description: 'Error level analysis and metadata' },
  face: { label: 'Face verification', description: 'Comparing live photo with document photo' },
  watchlist: { label: 'Watchlist screening', description: 'Checking extracted identifiers against the configured list' },
  risk: { label: 'Evidence fusion & risk', description: 'Correlating signals, scoring risk and confidence, deciding' },
};

export const initialSteps = () => Object.fromEntries(STEP_IDS.map((id) => [id, { status: 'pending', progress: 0, message: '', durationMs: null, error: null }]));

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * @param {{ documentType: string, documentImage: string, documentFile?: File, liveImage?: string|null, options?: Object }} params
 * @param {{ modules?: Object, onUpdate?: (stepId: string, patch: Object) => void, isCancelled?: () => boolean, log?: Function }} [deps]
 * @returns {Promise<Object|null>} results, or null when cancelled
 */
export async function runScreening({ documentType, documentImage, documentFile, liveImage, options = {} }, deps = {}) {
  const mods = deps.modules || defaultModules;
  const onUpdate = deps.onUpdate || (() => {});
  const isCancelled = deps.isCancelled || (() => false);
  const log = deps.log || ((...a) => console.error(...a));
  const providers = resolveProviders(options);
  const scenario = options.scenario || 'clean';
  const startedAt = now();
  const progress = (id) => (p, message) => onUpdate(id, { status: 'running', progress: Math.round(p * 100), message });
  const out = { providers, documentType, steps: {} };

  const runStep = async (id, fn) => {
    const t0 = now();
    onUpdate(id, { status: 'running', progress: 0, message: 'Starting' });
    try {
      const r = await fn();
      const durationMs = Math.round(now() - t0);
      out.steps[id] = { status: 'done', durationMs };
      onUpdate(id, { status: 'done', progress: 100, message: 'Complete', durationMs });
      return r;
    } catch (e) {
      const durationMs = Math.round(now() - t0);
      log(`[pipeline] ${id} failed`, e);
      out.steps[id] = { status: 'error', durationMs, error: e?.message || 'Failed' };
      onUpdate(id, { status: 'error', progress: 100, message: e?.message || 'Failed', error: e?.message || 'Failed', durationMs });
      return null;
    }
  };

  out.ocr = await runStep('ocr', () => mods.ocr({ provider: providers.ocr, imageDataUrl: documentImage, documentType, scenario, onProgress: progress('ocr') }));
  if (isCancelled()) return null;

  out.validation = await runStep('validation', async () => {
    if (!out.ocr) throw new Error('OCR did not produce output');
    progress('validation')(0.5, 'Checking rules');
    return mods.validation(documentType, out.ocr);
  });

  // Tampering, face verification and watchlist screening are independent — run them concurrently.
  const [tampering, face, watchlist] = await Promise.all([
    runStep('tampering', () => mods.tampering({ provider: providers.tamper, imageDataUrl: documentImage, originalFile: documentFile, documentType, scenario, onProgress: progress('tampering') })),
    liveImage
      ? runStep('face', () => mods.face({ provider: providers.face, documentImageDataUrl: documentImage, liveImageDataUrl: liveImage, scenario, onProgress: progress('face') }))
      : Promise.resolve(null).then(() => { out.steps.face = { status: 'skipped', durationMs: 0 }; onUpdate('face', { status: 'skipped', progress: 100, message: 'Skipped — no live photo' }); return null; }),
    runStep('watchlist', () => mods.watchlist({ provider: providers.watchlist, fields: out.ocr?.fields || {}, documentType, onProgress: progress('watchlist') })),
  ]);
  out.tampering = tampering;
  out.face = face;
  // A provider that threw is null → fusion records the watchlist check as unavailable evidence.
  out.watchlist = watchlist;
  if (isCancelled()) return null;

  // Evidence fusion: never throws on missing inputs — absent modules become `unavailable` evidence.
  out.fusion = await runStep('risk', async () => {
    const p = progress('risk');
    p(0.2, 'Normalising evidence');
    p(0.5, 'Correlating signals');
    const fusion = mods.fusion({ documentType, ocr: out.ocr, validation: out.validation, tampering: out.tampering, face: out.face, watchlist: out.watchlist, providers });
    p(0.9, 'Scoring risk and confidence');
    return fusion;
  });
  // Legacy view for the existing results UI, history, statistics and CSV (single engine, projected).
  out.risk = toLegacyRisk(out.fusion);
  out.decision = out.fusion?.decision || null;
  out.confidence = out.fusion?.confidence?.score ?? null;
  out.durationMs = Math.round(now() - startedAt);
  return out;
}
