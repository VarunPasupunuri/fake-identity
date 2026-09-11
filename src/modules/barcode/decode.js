/**
 * Pure helpers over decoded QR / barcode content. No I/O, no browser APIs.
 */

const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc'];

/**
 * Classify the decoded payload.
 * @returns {{ kind: 'url'|'json'|'identifier'|'text'|'empty', host?: string, suspicious?: boolean, reasons?: string[], data?: Object }}
 */
export function classifyDecodedContent(raw) {
  const s = String(raw || '').trim();
  if (!s) return { kind: 'empty' };
  if (/^(https?:\/\/|www\.)/i.test(s)) {
    let host = '';
    let protocol = 'https:';
    try { const u = new URL(/^www\./i.test(s) ? `http://${s}` : s); host = u.hostname.toLowerCase(); protocol = u.protocol; } catch { host = s.slice(0, 40); }
    const reasons = [];
    if (protocol === 'http:') reasons.push('not HTTPS');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) reasons.push('raw IP address');
    if (host.startsWith('xn--') || host.includes('.xn--')) reasons.push('punycode host');
    if (SHORTENERS.includes(host)) reasons.push('link shortener');
    if (/@/.test(s.split('//')[1] || '')) reasons.push('credentials in URL');
    return { kind: 'url', host, suspicious: reasons.length > 0, reasons };
  }
  if (/^[[{]/.test(s)) {
    try { return { kind: 'json', data: JSON.parse(s) }; } catch { /* not JSON */ }
  }
  if (/^[A-Z0-9][A-Z0-9/\-|;:, ]{3,80}$/i.test(s) && /\d/.test(s)) return { kind: 'identifier' };
  return { kind: 'text' };
}

const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Identifier-like tokens inside a payload (also walks JSON values). */
export function encodedIdentifiers(raw) {
  const s = String(raw || '');
  const out = new Set();
  const consider = (tok) => { const t = String(tok).trim(); if (/\d/.test(t) && /^[A-Z0-9/\-]{5,24}$/i.test(t)) out.add(t.toUpperCase()); };
  if (/^[[{]/.test(s.trim())) {
    try {
      const walk = (v) => { if (v && typeof v === 'object') Object.values(v).forEach(walk); else if (typeof v === 'string' || typeof v === 'number') consider(v); };
      walk(JSON.parse(s));
    } catch { /* fall through to token scan */ }
  }
  for (const m of s.matchAll(/[A-Z0-9][A-Z0-9/\-]{4,23}/gi)) consider(m[0]);
  return [...out];
}

/**
 * Compare decoded content with the printed identifiers / name.
 * @returns {{ comparable: boolean, matched: string[], encodedIdentifiers: string[] }}
 */
export function contentMatchesIdentifiers(raw, { identifiers = [], name = '' } = {}) {
  const payload = norm(raw);
  const encoded = encodedIdentifiers(raw);
  const matched = [];
  let identifierMatched = false;
  for (const id of identifiers) { const n = norm(id); if (n.length >= 4 && payload.includes(n)) { matched.push(`document number ${id}`); identifierMatched = true; } }
  if (name) {
    const tokens = String(name).toUpperCase().split(/\s+/).filter((t) => t.length >= 3);
    if (tokens.length && tokens.every((t) => payload.includes(norm(t)))) matched.push(`name ${name}`);
  }
  // An encoded identifier that contradicts the printed one is a mismatch even when the name agrees.
  const identifierMismatch = !identifierMatched && identifiers.length > 0 && encoded.length > 0;
  const comparable = matched.length > 0 || (encoded.length > 0 && (identifiers.length > 0 || Boolean(name)));
  return { comparable, matched, identifierMatched, identifierMismatch, encodedIdentifiers: encoded };
}
