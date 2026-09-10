import { describe, it, expect } from 'vitest';
import { imageRef } from './useScreeningImages.js';

describe('imageRef', () => {
  it('prefers the Supabase object path and falls back to inline data URLs', () => {
    expect(imageRef({ documentImagePath: 'screenings/u/s/document-a.jpg', documentImageUrl: null }, 'document')).toBe('screenings/u/s/document-a.jpg');
    expect(imageRef({ documentImagePath: null, documentImageUrl: 'data:image/jpeg;base64,X' }, 'document')).toBe('data:image/jpeg;base64,X');
    expect(imageRef({ liveImagePath: 'screenings/u/s/live-a.jpg' }, 'live')).toBe('screenings/u/s/live-a.jpg');
    expect(imageRef({}, 'live')).toBeNull();
    expect(imageRef(null, 'document')).toBeNull();
  });
});
