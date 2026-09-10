import * as mock from './mock.js';
import * as local from './local.js';
import * as cloud from './cloud.js';

export const TAMPER_PROVIDERS = { mock, local, cloud };

/**
 * @param {{ imageDataUrl: string, originalFile?: File, documentType: string, provider?: string, scenario?: string, onProgress?: Function }} args
 */
export async function runTamperingDetection({ provider, ...args }) {
  const impl = TAMPER_PROVIDERS[provider] || TAMPER_PROVIDERS.mock;
  return impl.analyse(args);
}
