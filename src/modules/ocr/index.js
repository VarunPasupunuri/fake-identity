import * as mock from './mock.js';
import * as tesseract from './tesseract.js';
import * as cloud from './cloud.js';

export const OCR_PROVIDERS = { mock, tesseract, cloud };

/**
 * Run OCR with the configured provider.
 * @param {{ imageDataUrl: string, documentType: string, provider?: string, scenario?: string, onProgress?: (p:number, msg:string)=>void }} args
 */
export async function runOcr({ provider, ...args }) {
  const impl = OCR_PROVIDERS[provider] || OCR_PROVIDERS.mock;
  return impl.extract(args);
}
