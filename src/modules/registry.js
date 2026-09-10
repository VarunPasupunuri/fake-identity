/**
 * Module registry — the single place where providers are chosen.
 * Reads VITE_*_PROVIDER from the environment; the screening UI never imports a
 * provider directly, so upgrading a module (e.g. swapping ELA for a trained
 * forgery model, or Tesseract for Cloud Vision) is a config change here.
 */
import { runOcr, OCR_PROVIDERS } from './ocr/index.js';
import { runTamperingDetection, TAMPER_PROVIDERS } from './tampering/index.js';
import { runFaceVerification, FACE_PROVIDERS } from './face/index.js';
import { validateDocument } from './validation/index.js';
import { computeRisk } from './risk/index.js';
import { isFirebaseConfigured } from '../lib/firebase.js';

function pick(envValue, available, fallback) {
  const v = (envValue || '').trim();
  return v && available[v] ? v : fallback;
}

export function getProviderConfig() {
  const env = import.meta.env;
  let ocr = pick(env.VITE_OCR_PROVIDER, OCR_PROVIDERS, 'tesseract');
  let tamper = pick(env.VITE_TAMPER_PROVIDER, TAMPER_PROVIDERS, 'local');
  const face = pick(env.VITE_FACE_PROVIDER, FACE_PROVIDERS, 'faceapi');
  // Cloud providers need Firebase; degrade gracefully to the in-browser equivalents.
  if (ocr === 'cloud' && !isFirebaseConfigured) ocr = 'tesseract';
  if (tamper === 'cloud' && !isFirebaseConfigured) tamper = 'local';
  return { ocr, tamper, face };
}

/** Provider overrides selected in the UI (e.g. "Use mock data" toggle for demos). */
export function resolveProviders(overrides = {}) {
  const base = getProviderConfig();
  if (overrides.useMock) return { ocr: 'mock', tamper: 'mock', face: 'mock' };
  const { useMock, scenario, providers, ...rest } = overrides; // eslint-disable-line no-unused-vars
  const merged = { ...base, ...(providers || {}), ...rest };
  if (merged.ocr === 'cloud' && !isFirebaseConfigured) merged.ocr = 'tesseract';
  if (merged.tamper === 'cloud' && !isFirebaseConfigured) merged.tamper = 'local';
  return merged;
}

export const PROVIDER_OPTIONS = {
  ocr: [
    { value: 'tesseract', label: 'Tesseract.js (on device)', hint: 'Works offline; ~2–8 s per document' },
    { value: 'cloud', label: 'Google Cloud Vision (Cloud Function)', hint: 'Higher accuracy; needs Firebase + Vision API', cloud: true },
    { value: 'mock', label: 'Mock data', hint: 'Demo only' },
  ],
  tamper: [
    { value: 'local', label: 'ELA + EXIF (on device)', hint: 'Error level analysis in the browser' },
    { value: 'cloud', label: 'ELA + EXIF (Cloud Function)', hint: 'sharp-based, server side', cloud: true },
    { value: 'mock', label: 'Mock data', hint: 'Demo only' },
  ],
  face: [
    { value: 'faceapi', label: 'face-api.js (on device)', hint: 'SSD MobileNet + 128-d descriptors' },
    { value: 'mock', label: 'Mock data', hint: 'Demo only' },
  ],
};

export const modules = {
  ocr: runOcr,
  validation: validateDocument,
  tampering: runTamperingDetection,
  face: runFaceVerification,
  risk: computeRisk,
};
