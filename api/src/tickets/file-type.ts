/**
 * Content-based file type detection. The client's Content-Type header and file extension
 * are attacker-controlled, so uploads are accepted only if the bytes look like an allowed type.
 */
export interface DetectedType {
  mime: string;
  ext: string;
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

export function detectType(buf: Buffer): DetectedType | null {
  if (buf.length >= 8 && startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 3 && startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 6 && (buf.toString('latin1', 0, 6) === 'GIF87a' || buf.toString('latin1', 0, 6) === 'GIF89a')) return { mime: 'image/gif', ext: 'gif' };
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (looksLikeText(buf)) return { mime: 'text/plain', ext: 'txt' };
  return null;
}

/** Plain text: valid UTF-8 with no NUL/control bytes in the first 8 KB. */
function looksLikeText(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const head = buf.subarray(0, 8192);
  for (const byte of head) {
    if (byte === 0 || (byte < 0x09) || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.length < buf.length ? head.subarray(0, trimPartialChar(head)) : head);
    return true;
  } catch {
    return false;
  }
}

/** If the 8 KB cut landed mid-character, drop the incomplete tail. */
function trimPartialChar(head: Buffer): number {
  let end = head.length;
  let back = 0;
  while (end > 0 && back < 4 && (head[end - 1] & 0xc0) === 0x80) {
    end--;
    back++;
  }
  return end > 0 && head[end - 1] >= 0xc0 ? end - 1 : head.length;
}

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/plain',
  csv: 'text/plain',
};

/** True if the claimed extension is consistent with what the bytes actually are. */
export function extensionMatches(fileName: string, detected: DetectedType): boolean {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return true;
  const ext = fileName.slice(dot + 1).toLowerCase();
  const expected = EXT_TO_MIME[ext];
  // Unknown extensions (.exe, .html, .svg, ...) are rejected outright.
  return expected !== undefined && expected === detected.mime;
}

/** Display-only name: no path components, no control characters, bounded length. */
export function sanitiseFileName(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return (cleaned || 'file').slice(0, 100);
}
