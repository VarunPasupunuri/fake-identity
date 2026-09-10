/**
 * Resolve a screening record's images to something an <img> can render:
 * inline data URLs pass through; Supabase object paths become signed URLs.
 * Keeps pages independent of where images live.
 */
import { useEffect, useState } from 'react';
import { getDocumentUrls } from '../services/storage.js';

/** Return the storage reference for a record's image (path preferred, inline fallback). */
export function imageRef(row, kind) {
  if (!row) return null;
  return kind === 'live' ? row.liveImagePath || row.liveImageUrl || null : row.documentImagePath || row.documentImageUrl || null;
}

/** { document, live } URLs for one screening (detail page). */
export function useScreeningImages(row) {
  const doc = imageRef(row, 'document');
  const live = imageRef(row, 'live');
  const [urls, setUrls] = useState({ document: null, live: null });
  useEffect(() => {
    let alive = true;
    if (!doc && !live) { setUrls({ document: null, live: null }); return undefined; }
    getDocumentUrls([doc, live]).then(([d, l]) => alive && setUrls({ document: d, live: l }));
    return () => { alive = false; };
  }, [doc, live]);
  return urls;
}

/** Map of screening id → document thumbnail URL for a list of records. */
export function useDocumentThumbnails(rows) {
  const key = (rows || []).map((r) => `${r.id}:${imageRef(r, 'document') ? 1 : 0}`).join('|');
  const [map, setMap] = useState({});
  useEffect(() => {
    let alive = true;
    const withImages = (rows || []).filter((r) => imageRef(r, 'document'));
    if (!withImages.length) { setMap({}); return undefined; }
    getDocumentUrls(withImages.map((r) => imageRef(r, 'document'))).then((urls) => {
      if (!alive) return;
      setMap(Object.fromEntries(withImages.map((r, i) => [r.id, urls[i]])));
    });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}
