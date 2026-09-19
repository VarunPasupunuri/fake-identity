/**
 * Runs the preflight document-type check for the screening page.
 *
 * One lightweight OCR pass on the captured/uploaded image, classified and
 * compared with the officer's selected type. The OCR result is kept so the
 * screening pipeline can reuse it instead of recognising the same image twice.
 *
 * Nothing expensive runs here: no forensics, no face model, no watchlist, no
 * fusion. Those only start once the officer continues past a non-blocking result.
 */
import { useCallback, useRef, useState } from 'react';
import { runOcr } from '../modules/ocr/index.js';
import { checkDocumentType, PREFLIGHT } from '../modules/documents/preflight.js';
import { resolveSelection } from '../modules/documents/registry.js';

const IDLE = { state: 'idle', result: null, ocr: null, imageKey: null };

/**
 * @param {{ providers?: Object, useMock?: boolean, scenario?: string, mockDocument?: string }} opts
 */
export function useDocumentPreflight({ providers, useMock, scenario, mockDocument } = {}) {
  const [state, setState] = useState(IDLE.state); // idle | checking | done | error
  const [result, setResult] = useState(null);
  const cache = useRef(IDLE);
  const runId = useRef(0);
  // The check in flight, so a caller can wait for it rather than act on no answer.
  const pending = useRef(null);

  const reset = useCallback(() => { cache.current = IDLE; runId.current += 1; pending.current = null; setState(IDLE.state); setResult(null); }, []);

  /**
   * Check one image against the selected type. Re-checking the same image with a
   * different selection reuses the cached OCR — the comparison is pure.
   * @returns {Promise<Object|null>} the preflight result
   */
  const runCheck = useCallback(async (image, selected) => {
    if (!image?.dataUrl) { reset(); return null; }
    const id = ++runId.current;
    // Recognise the same image the screening will analyse — the full-resolution
    // original, not the working copy kept for display. Detection is only as good
    // as the text, and the pipeline reuses this pass rather than repeating it, so
    // reading a smaller image here would quietly downgrade the whole screening.
    const key = image.analysisUrl || image.dataUrl;
    // In mock mode, the scenario affects the OCR result, so include it in the cache key
    const cacheKey = useMock ? `${key}::${scenario}` : key;
    const sel = resolveSelection(selected);

    // Same image, already recognised → only the comparison needs redoing.
    if (cache.current.imageKey === cacheKey && cache.current.ocr) {
      const r = checkDocumentType({ selected, rawText: cache.current.ocr.rawText, mrz: cache.current.ocr.mrz });
      cache.current = { ...cache.current, result: r };
      if (id === runId.current) { setResult(r); setState('done'); }
      return r;
    }

    setState('checking');
    setResult(null);
    try {
      const ocr = await runOcr({
        provider: useMock ? 'mock' : providers?.ocr,
        imageDataUrl: key,
        documentType: sel.type || 'auto',
        scenario,
        mockDocument,
      });
      if (id !== runId.current) return null; // a newer image superseded this run
      const r = checkDocumentType({ selected, rawText: ocr?.rawText || '', mrz: ocr?.mrz || null });
      cache.current = { state: 'done', result: r, ocr, imageKey: cacheKey };
      setResult(r); setState('done');
      return r;
    } catch (e) {
      if (id !== runId.current) return null;
      // A failed preflight must never block a legitimate document.
      const r = {
        status: PREFLIGHT.UNAVAILABLE, blocking: false, selectedType: sel.type, selectedLabel: '', detectedType: null, detectedLabel: '',
        confidence: 0, signals: [], alternatives: [], classification: null,
        title: 'Document type could not be checked',
        message: `The document type check could not run (${e?.message || 'unknown error'}). Screening can continue.`,
      };
      cache.current = { state: 'error', result: r, ocr: null, imageKey: cacheKey };
      setResult(r); setState('error');
      return r;
    }
  }, [providers?.ocr, useMock, scenario, mockDocument, reset]);

  /** Run the check, keeping the promise so a caller can wait for it. */
  const check = useCallback((image, selected) => {
    const p = runCheck(image, selected).finally(() => { if (pending.current === p) pending.current = null; });
    pending.current = p;
    return p;
  }, [runCheck]);

  /**
   * The settled result of the check, waiting for one still running.
   *
   * The officer can continue before the check has finished, and a check that has
   * not answered yet is not an answer of "no problem": acting on the absent
   * result let a document of the wrong type through simply by being quick enough.
   */
  const settle = useCallback(async () => {
    if (pending.current) { try { return await pending.current; } catch { return cache.current.result; } }
    return cache.current.result;
  }, []);

  /** The OCR output for the checked image, so the pipeline does not recognise it twice. */
  const takeOcr = useCallback((image) => {
    const k = image?.analysisUrl || image?.dataUrl;
    return k && cache.current.imageKey === k ? cache.current.ocr : null;
  }, []);

  return { state, result, check, settle, reset, takeOcr, blocking: Boolean(result?.blocking) };
}
