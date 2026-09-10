import * as mock from './mock.js';
import * as faceapi from './faceapi.js';

export const FACE_PROVIDERS = { mock, faceapi };

/**
 * @param {{ documentImageDataUrl: string, liveImageDataUrl: string, provider?: string, scenario?: string, onProgress?: Function }} args
 */
export async function runFaceVerification({ provider, ...args }) {
  const impl = FACE_PROVIDERS[provider] || FACE_PROVIDERS.mock;
  return impl.verify(args);
}
