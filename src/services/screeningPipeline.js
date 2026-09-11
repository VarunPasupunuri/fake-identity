/**
 * Screening orchestrator (framework-free).
 *
 *   OCR → Classification (+ profile field extraction) → Validation
 *       → Integrity ∥ QR/barcode ∥ Face ∥ Watchlist ∥ Identity correlation
 *       → Issuer verification → Evidence Fusion → Risk + Confidence → Assessment
 *
 * The React hook (hooks/useScreeningPipeline.js) is a thin state wrapper around
 * runScreening(); keeping the flow here makes it testable without a browser.
 *
 * Every module is resolved through the registry, so providers (mock, on-device,
 * cloud) stay swappable. A provider that throws is recorded as an `error` step and
 * its output is null — the fusion engine then reports that evidence as
 * *unavailable* rather than inventing a pass/fail result.
 *
 * Only the modules relevant to the detected document profile run: face comparison
 * is skipped for documents without a holder photograph, MRZ parsing only happens
 * when an MRZ exists, and QR/barcode reading runs for every document type.
 */
import { modules as defaultModules, resolveProviders } from '../modules/registry.js';
import { toLegacyRisk } from '../modules/fusion/index.js';
import { getProfile, resolveSelection, LEGACY_TYPES, AUTO_DETECT } from '../modules/documents/registry.js';
import { parseFields } from '../modules/ocr/parse.js';

export const STEP_IDS = ['ocr', 'classification', 'validation', 'tampering', 'barcode', 'face', 'watchlist', 'identity', 'issuer', 'risk'];
export const STEP_META = {
  ocr: { label: 'Text recognition', description: 'Recognising printed text and machine readable zones' },
  classification: { label: 'Document classification', description: 'Classifying document and extracting document information' },
  validation: { label: 'Document validation', description: 'Checking document consistency' },
  tampering: { label: 'Integrity analysis', description: 'Analysing document integrity' },
  barcode: { label: 'QR / barcode analysis', description: 'Reading QR/barcode' },
  face: { label: 'Face comparison', description: 'Comparing facial features' },
  watchlist: { label: 'Watchlist screening', description: 'Screening identifiers against the configured list' },
  identity: { label: 'Identity correlation', description: 'Comparing with prior screening records' },
  issuer: { label: 'Issuer verification', description: 'Checking for an authorised issuer source' },
  risk: { label: 'Risk assessment', description: 'Correlating verification evidence and calculating risk assessment' },
};

export const initialSteps = () => Object.fromEntries(STEP_IDS.map((id) => [id, { status: 'pending', progress: 0, message: '', durationMs: null, error: null }]));

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * @param {{ documentType: string, documentImage: string, documentFile?: File, liveImage?: string|null, options?: Object }} params
 *   `documentType` may be a profile id, `auto`, or `category:<name>` (see modules/documents/registry.js).
 *   `options.history` (optional) = prior screening rows for identity correlation; `options.mockDocument` = demo document for auto-detect.
 * @param {{ modules?: Object, onUpdate?: (stepId: string, patch: Object) => void, isCancelled?: () => boolean, log?: Function }} [deps]
 * @returns {Promise<Object|null>} results, or null when cancelled
 */
export async function runScreening({ documentType = AUTO_DETECT, documentImage, documentFile, liveImage, options = {} }, deps = {}) {
  const mods = deps.modules || defaultModules;
  const onUpdate = deps.onUpdate || (() => {});
  const isCancelled = deps.isCancelled || (() => false);
  const log = deps.log || ((...a) => console.error(...a));
  const providers = resolveProviders(options);
  const scenario = options.scenario || 'clean';
  const selection = resolveSelection(documentType);
  const startedAt = now();
  const progress = (id) => (p, message) => onUpdate(id, { status: 'running', progress: Math.round(p * 100), message });
  const out = { providers, documentType: selection.type || AUTO_DETECT, requestedType: documentType, steps: {} };

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
  const skipStep = (id, message) => { out.steps[id] = { status: 'skipped', durationMs: 0 }; onUpdate(id, { status: 'skipped', progress: 100, message }); return null; };

  // 1. OCR — text recognition (the MRZ, when present, is parsed here too)
  const ocrType = selection.type || AUTO_DETECT;
  out.ocr = await runStep('ocr', () => mods.ocr({ provider: providers.ocr, imageDataUrl: documentImage, documentType: ocrType, scenario, mockDocument: options.mockDocument, onProgress: progress('ocr') }));
  if (isCancelled()) return null;

  // 2. Classification + profile-driven field extraction
  out.classification = await runStep('classification', async () => {
    const p = progress('classification');
    p(0.2, 'Classifying document');
    const cls = mods.classification({ rawText: out.ocr?.rawText || '', mrz: out.ocr?.mrz || null, hint: { type: selection.type, category: selection.category } });
    const profile = getProfile(cls.type);
    const result = { ...cls, label: profile.label };
    out.documentType = profile.id;
    out.documentCategory = profile.category;
    if (!out.ocr) return result;
    p(0.6, 'Extracting document information');
    if (LEGACY_TYPES.includes(profile.id)) {
      // Travel / identity documents: re-run the specialised parser with the resolved type (visa/permit-specific fields).
      if (profile.id !== ocrType) {
        const parsed = parseFields(out.ocr.rawText || '', profile.id);
        out.ocr = { ...out.ocr, fields: parsed.fields, vizFields: parsed.vizFields, mrz: parsed.mrz || out.ocr.mrz, fieldConfidence: Object.fromEntries(Object.keys(parsed.fields).map((k) => [k, out.ocr.confidence])) };
      }
    } else {
      const ex = mods.extraction(out.ocr.rawText || '', profile, { baseConfidence: out.ocr.confidence, seed: {} });
      out.ocr = { ...out.ocr, fields: ex.fields, fieldConfidence: ex.fieldConfidence, fieldSources: ex.fieldSources, vizFields: {} };
    }
    return result;
  });
  if (isCancelled()) return null;
  const profile = getProfile(out.documentType);

  // 3. Integrity, QR/barcode, face, watchlist and identity correlation are independent — run them concurrently.
  const faceApplies = profile.face !== 'not_applicable';
  const [tampering, barcode, face, watchlist, identity] = await Promise.all([
    runStep('tampering', () => mods.tampering({ provider: providers.tamper, imageDataUrl: documentImage, originalFile: documentFile, documentType: out.documentType, scenario, onProgress: progress('tampering') })),
    runStep('barcode', () => mods.barcode({ provider: providers.barcode, imageDataUrl: documentImage, documentType: out.documentType, scenario, mockDocument: options.mockDocument, onProgress: progress('barcode') })),
    !faceApplies
      ? Promise.resolve(skipStep('face', `Not applicable — ${profile.label.toLowerCase()} carries no holder photograph`))
      : liveImage
        ? runStep('face', () => mods.face({ provider: providers.face, documentImageDataUrl: documentImage, liveImageDataUrl: liveImage, scenario, onProgress: progress('face') }))
        : Promise.resolve(skipStep('face', 'Skipped — no live photo')),
    runStep('watchlist', () => mods.watchlist({ provider: providers.watchlist, fields: out.ocr?.fields || {}, documentType: out.documentType, onProgress: progress('watchlist') })),
    runStep('identity', async () => {
      progress('identity')(0.5, 'Comparing with prior screening records');
      return mods.identity({ fields: out.ocr?.fields || {}, documentType: out.documentType, history: options.history || [], excludeId: options.excludeId || null });
    }),
  ]);
  out.tampering = tampering;
  out.barcode = barcode;
  out.face = face;
  out.watchlist = watchlist;
  out.identity = identity;
  if (isCancelled()) return null;

  // 4. Validation — document-specific rules (needs the barcode result for consistency checks)
  out.validation = await runStep('validation', async () => {
    if (!out.ocr) throw new Error('OCR did not produce output');
    progress('validation')(0.5, 'Checking rules');
    return mods.validation(out.documentType, out.ocr, { barcode: out.barcode });
  });
  if (isCancelled()) return null;

  // 5. Issuer verification — explicit, never simulated
  out.issuer = await runStep('issuer', () => mods.issuer({ provider: providers.issuer, fields: out.ocr?.fields || {}, documentType: out.documentType, onProgress: progress('issuer') }));
  if (isCancelled()) return null;

  // 6. Evidence fusion: never throws on missing inputs — absent modules become `unavailable` evidence.
  out.fusion = await runStep('risk', async () => {
    const p = progress('risk');
    p(0.2, 'Normalising evidence');
    p(0.5, 'Correlating verification evidence');
    const fusion = mods.fusion({ documentType: out.documentType, ocr: out.ocr, validation: out.validation, tampering: out.tampering, face: out.face, barcode: out.barcode, watchlist: out.watchlist, identity: out.identity, issuer: out.issuer, classification: out.classification, providers });
    p(0.9, 'Calculating risk assessment');
    return fusion;
  });
  // Legacy view for the existing results UI, history, statistics and CSV (single engine, projected).
  out.risk = toLegacyRisk(out.fusion);
  out.decision = out.fusion?.decision || null;
  out.confidence = out.fusion?.confidence?.score ?? null;
  out.durationMs = Math.round(now() - startedAt);
  return out;
}
