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

  const reset = useCallback(() => { cache.current = IDLE; runId.current += 1; setState(IDLE.state); setResult(null); }, []);

  /**
   * Check one image against the selected type. Re-checking the same image with a
   * different selection reuses the cached OCR — the comparison is pure.
   * @returns {Promise<Object|null>} the preflight result
   */
  const check = useCallback(async (image, selected) => {
    if (!image?.dataUrl) { reset(); return null; }
    const id = ++runId.current;
    const key = image.dataUrl;
    const sel = resolveSelection(selected);

    // Same image, already recognised → only the comparison needs redoing.
    if (cache.current.imageKey === key && cache.current.ocr) {
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
        imageDataUrl: image.dataUrl,
        documentType: sel.type || 'auto',
        scenario,
        mockDocument,
      });
      if (id !== runId.current) return null; // a newer image superseded this run
      const r = checkDocumentType({ selected, rawText: ocr?.rawText || '', mrz: ocr?.mrz || null });
      cache.current = { state: 'done', result: r, ocr, imageKey: key };
      setResult(r); setState('done');
      return r;
    } catch (e) {
      if (id !== runId.current) return null;
      // A failed preflight must never block a legitimate document.
      const r = {
        status: PREFLIGHT.UNAVAILABLE, blocking: false, selectedType: sel.type, selectedLabel: '', detectedType: null, detectedLabel: '',
        confidence: 0, signals: [], classification: null,
        title: 'Document type could not be checked',
        message: `The document type check could not run (${e?.message || 'unknown error'}). Screening can continue.`,
      };
      cache.current = { state: 'error', result: r, ocr: null, imageKey: key };
      setResult(r); setState('error');
      return r;
    }
  }, [providers?.ocr, useMock, scenario, mockDocument, reset]);

  /** The OCR output for the checked image, so the pipeline does not recognise it twice. */
  const takeOcr = useCallback((image) => (image?.dataUrl && cache.current.imageKey === image.dataUrl ? cache.current.ocr : null), []);

  return { state, result, check, reset, takeOcr, blocking: Boolean(result?.blocking) };
}
