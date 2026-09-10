/**
 * React state wrapper around services/screeningPipeline.js. Exposes per-step
 * progress for the processing screen and the final results object.
 * Step ids and labels are re-exported so existing components keep working.
 */
import { useCallback, useRef, useState } from 'react';
import { runScreening, STEP_IDS, STEP_META, initialSteps } from '../services/screeningPipeline.js';

export { STEP_IDS, STEP_META };

export function useScreeningPipeline() {
  const [steps, setSteps] = useState(initialSteps);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const update = useCallback((id, patch) => setSteps((s) => ({ ...s, [id]: { ...s[id], ...patch } })), []);

  const run = useCallback(async (params) => {
    cancelled.current = false;
    setRunning(true);
    setResults(null);
    setSteps(initialSteps());
    try {
      const out = await runScreening(params, { onUpdate: update, isCancelled: () => cancelled.current });
      if (out) setResults(out);
      return out;
    } finally {
      setRunning(false);
    }
  }, [update]);

  const reset = useCallback(() => { cancelled.current = true; setSteps(initialSteps()); setResults(null); setRunning(false); }, []);

  return { steps, results, running, run, reset };
}
