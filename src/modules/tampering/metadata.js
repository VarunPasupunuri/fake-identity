/**
 * EXIF / metadata consistency checks. Shared by the local and cloud providers.
 * @param {Object|null} exif  parsed exif (exifr output) or null when none
 * @returns {{ flags: import('../types.js').TamperFlag[], score: number, summary: Object }}
 */
export function analyseMetadata(exif, { fileType } = {}) {
  const flags = [];
  let score = 0;
  const summary = {};
  if (!exif) {
    summary.note = 'No EXIF metadata present.';
    return { flags, score, summary };
  }
  const software = exif.Software || exif.ProcessingSoftware || exif.CreatorTool || exif.HistorySoftwareAgent;
  const created = toDate(exif.DateTimeOriginal || exif.CreateDate);
  const modified = toDate(exif.ModifyDate);
  summary.software = software || null;
  summary.created = created?.toISOString() || null;
  summary.modified = modified?.toISOString() || null;
  summary.camera = [exif.Make, exif.Model].filter(Boolean).join(' ') || null;
  summary.fileType = fileType || null;

  if (software && /photoshop|gimp|lightroom|affinity|pixelmator|paint\.net|canva|snapseed|picsart|photopea|inkscape|illustrator/i.test(String(software))) {
    flags.push({ id: 'meta_editor', type: 'metadata', severity: 'high', label: `Edited with ${software}`, detail: 'Image metadata records an image-editing application in the processing chain.' });
    score += 45;
  }
  if (created && modified && modified.getTime() - created.getTime() > 60 * 1000) {
    const mins = Math.round((modified - created) / 60000);
    flags.push({ id: 'meta_modified', type: 'metadata', severity: mins > 60 ? 'medium' : 'low', label: 'Modified after capture', detail: `ModifyDate is ${mins > 1440 ? Math.round(mins / 1440) + ' day(s)' : mins + ' min'} after DateTimeOriginal.` });
    score += mins > 60 ? 20 : 8;
  }
  if (exif.History || exif.HistoryAction) {
    flags.push({ id: 'meta_history', type: 'metadata', severity: 'medium', label: 'XMP edit history present', detail: 'The file carries an XMP history block describing prior edits.' });
    score += 20;
  }
  return { flags, score: Math.min(100, score), summary };
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
  return Number.isNaN(d.getTime()) ? null : d;
}
