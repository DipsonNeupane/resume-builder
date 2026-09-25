// Bounded-text sanitizer for job-posting text read from an untrusted page. This does not (and
// cannot) make the text "safe HTML" — it doesn't need to, because this text is only ever placed
// in text nodes/attributes (never innerHTML) on both the extension and web-app side. Its job is
// narrower: strip control characters that could corrupt storage/logs, collapse excess
// whitespace, and hard-cap length so a hostile or oversized page can't smuggle an unbounded
// payload through the extension into extension storage or a postMessage.
//
// Duplicated (not imported) in src/inject/extract-job.ts — see that file's header comment.
export function sanitizeText(raw: unknown, maxChars: number): string {
  if (typeof raw !== 'string') return '';
  const stripped = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return stripped.length > maxChars ? `${stripped.slice(0, maxChars - 1).trim()}…` : stripped;
}
