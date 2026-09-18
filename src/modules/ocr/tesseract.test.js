// @vitest-environment jsdom
/**
 * The recognition queue.
 *
 * A Tesseract worker recognises one image at a time. The screening page starts
 * two passes that overlap — the document-type check when a document is chosen,
 * the screening itself when the officer continues — and before this they shared
 * one worker with nothing to keep them apart. The symptom was a document
 * reported unreadable that read perfectly after the page was reloaded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let concurrent = 0;
let peak = 0;
let calls = 0;
let failNext = false;

vi.mock('tesseract.js', () => ({
  createWorker: async () => ({
    setParameters: async () => {},
    recognize: async () => {
      calls += 1;
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent -= 1;
      if (failNext) { failNext = false; throw new Error('worker died'); }
      return { data: { text: 'REPUBLIC OF DEMOLAND PASSPORT\nSurname DEMO\nDate of Birth 03/11/2006', confidence: 88 } };
    },
  }),
}));

// The band pass needs a canvas; jsdom has no 2d context, so it simply fails and is skipped.
vi.mock('../../lib/image.js', async (orig) => ({ ...(await orig()), cropBand: async () => { throw new Error('no canvas'); }, rotateDataUrl: async (d) => d }));

const IMG = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(() => { concurrent = 0; peak = 0; calls = 0; failNext = false; });

describe('recognition never overlaps', () => {
  it('two screenings started together are recognised one after the other', async () => {
    const { extract } = await import('./tesseract.js');
    await Promise.all([
      extract({ imageDataUrl: IMG, documentType: 'passport' }),
      extract({ imageDataUrl: IMG, documentType: 'passport' }),
    ]);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(peak).toBe(1);
  });

  it('many at once still never overlap', async () => {
    const { extract } = await import('./tesseract.js');
    await Promise.all(Array.from({ length: 5 }, () => extract({ imageDataUrl: IMG, documentType: 'passport' })));
    expect(peak).toBe(1);
  });

  it('a pass that throws releases the queue instead of wedging it', async () => {
    // Before, one bad image left every later screening waiting on a promise that
    // never settled, and only reloading the page recovered it.
    const { extract } = await import('./tesseract.js');
    failNext = true;
    await extract({ imageDataUrl: IMG, documentType: 'passport' }).catch(() => {});
    const after = await extract({ imageDataUrl: IMG, documentType: 'passport' });
    expect(after.rawText).toContain('PASSPORT');
    expect(peak).toBe(1);
  });

  it('still returns the fields it read', async () => {
    const { extract } = await import('./tesseract.js');
    const out = await extract({ imageDataUrl: IMG, documentType: 'passport' });
    expect(out.provider).toBe('tesseract');
    expect(out.vizFields.dateOfBirth).toBe('2006-11-03');
  });
});
