import { createReport, redactJson, summarize } from './json';
import type { Change, JsonValue } from './json';

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

/** Redacts values beneath ANY sensitive pointer segment, not only the leaf.
 * Uses core redaction as the key policy's single source of truth. RFC 6901
 * escapes decode once, ~1 before ~0; URI percent escapes are not decoded.
 * Paths/kinds are retained. Root scalars have no key context and stay unchanged.
 * This is common-key redaction, not arbitrary secret detection: paths themselves
 * can contain private data and must be reviewed before sharing.
 */
export function redactChange(change: Change): Change {
  const segments = change.path === '' ? [] : change.path.split('/').slice(1).map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  const sensitiveAncestor = segments.some(key => {
    // Computed property syntax safely creates an own __proto__ data property.
    const probe = redactJson({ [key]: null }) as { [key: string]: JsonValue };
    return probe[key] !== null;
  });
  const sanitize = (value: JsonValue): JsonValue => sensitiveAncestor
    ? (redactJson({ password: value }) as { [key: string]: JsonValue }).password
    : redactJson(value);
  return {
    kind: change.kind,
    path: change.path,
    ...(own(change, 'before') ? { before: sanitize(change.before!) } : {}),
    ...(own(change, 'after') ? { after: sanitize(change.after!) } : {}),
  };
}

/** The caller supplies the currently filtered changes; this helper applies no
 * additional filtering. Counts describe the supplied changes, even if redaction
 * makes before/after values identical. Neither helper mutates supplied data.
 */
export function createJsonReport(changes: Change[], redacted: boolean): string {
  const exported = redacted ? changes.map(redactChange) : changes;
  return JSON.stringify({
    tool: 'Diffloom',
    version: '1.0.0',
    scope: 'current filters',
    redacted,
    summary: summarize(exported),
    changes: exported,
  }, null, 2);
}

/** Core report fences values safely. Render Markdown with raw HTML disabled. */
export function createMarkdownReport(changes: Change[], redacted: boolean): string {
  const exported = redacted ? changes.map(redactChange) : changes;
  return `${createReport(exported)}\n\n---\nExport scope: current path and type filters. Common-secret redaction: ${redacted ? 'on (not a guarantee)' : 'off'}.\n`;
}
