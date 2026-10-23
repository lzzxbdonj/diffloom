/** JSON-only, dependency-free comparison helpers. Paths are RFC 6901 pointers;
 * the root is the empty string (present it as `/` in the UI).
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface Change {
  kind: 'added' | 'removed' | 'changed';
  path: string;
  before?: JsonValue;
  after?: JsonValue;
}
export interface DiffOptions {
  /** Exact RFC 6901 pointers and their descendants. Empty string ignores all.
   * Invalid pointers are ignored; `/` targets the empty-string property, not root.
   */
  ignorePaths?: string[];
  /** `id` matches unique string/number IDs (type-sensitive) within each array.
   * Matched/removed paths use BEFORE indexes; added paths use AFTER indexes.
   * Pure reorder is ignored. Thus paths can overlap for additions and removals.
   * Missing/duplicate IDs or non-object items in either array fall back to index.
   */
  arrayMode?: 'index' | 'id';
}

const MAX_BYTES = 1024 * 1024;
const MAX_DEPTH = 128;
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value: JsonValue): value is { [key: string]: JsonValue } =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const pointerPart = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');

/** Strict JSON, at most 1 MiB UTF-8 and 128 nested containers (root counts as 1). */
export function parseJson(source: string): { ok: true; value: JsonValue } | { ok: false; error: string } {
  if (new TextEncoder().encode(source).byteLength > MAX_BYTES) {
    return { ok: false, error: 'JSON input exceeds the 1 MiB (1,048,576 UTF-8 bytes) limit.' };
  }
  if (source.trim() === '') return { ok: false, error: 'JSON input is empty. Paste a JSON value to continue.' };
  try {
    const value = JSON.parse(source) as JsonValue;
    // Syntax is already validated. Consume entire quoted strings first so their
    // digits (including escaped quotes) cannot be mistaken for numeric tokens.
    // Retain source mantissas to detect underflow that JSON.parse turns into 0.
    const tokens = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    for (const match of source.matchAll(tokens)) {
      const token = match[0];
      if (token.startsWith('"')) continue;
      const number = Number(token);
      if (!Number.isFinite(number)) {
        return { ok: false, error: 'JSON contains a number outside the finite JavaScript number range.' };
      }
      if (Number.isInteger(number) && !Number.isSafeInteger(number)) {
        return { ok: false, error: 'JSON contains a number outside the safe integer range. Write long IDs as quoted strings to preserve their digits.' };
      }
      if (number === 0 && /[1-9]/.test(token.split(/[eE]/, 1)[0])) {
        return { ok: false, error: 'JSON contains a nonzero number too small for JavaScript (underflow to zero). Write it as a quoted string to preserve its value.' };
      }
    }
    const stack: Array<{ value: JsonValue; depth: number }> = [{ value, depth: 0 }];
    while (stack.length) {
      const item = stack.pop()!;
      if (typeof item.value === 'number' && !Number.isFinite(item.value)) {
        return { ok: false, error: 'JSON contains a number outside the finite JavaScript number range.' };
      }
      if (item.value !== null && typeof item.value === 'object') {
        const depth = item.depth + 1;
        if (depth > MAX_DEPTH) return { ok: false, error: 'JSON exceeds the maximum nesting depth of 128 containers.' };
        for (const child of Object.values(item.value)) stack.push({ value: child, depth });
      }
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

type Id = string | number;
function indexedIds(values: JsonValue[]): Map<Id, number> | undefined {
  const ids = new Map<Id, number>();
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!isObject(value) || !own(value, 'id')) return undefined;
    const id = value.id;
    if ((typeof id !== 'string' && typeof id !== 'number') || ids.has(id)) return undefined;
    ids.set(id, index);
  }
  return ids;
}

/** Does not mutate inputs. Change values reference the original inputs; clone
 * them if a consumer needs to edit a returned snapshot. Object order is ignored.
 */
export function diffJson(before: JsonValue, after: JsonValue, options: DiffOptions = {}): Change[] {
  const changes: Change[] = [];
  const ignored = (options.ignorePaths ?? []).filter(path => path === '' || (path.startsWith('/') && !/~(?![01])/u.test(path)));
  const skip = (path: string): boolean => ignored.some(ignore => ignore === '' || path === ignore || path.startsWith(`${ignore}/`));
  const record = (change: Change): void => { if (!skip(change.path)) changes.push(change); };
  const walk = (left: JsonValue, right: JsonValue, path: string): void => {
    if (skip(path) || left === right) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      const leftIds = options.arrayMode === 'id' ? indexedIds(left) : undefined;
      const rightIds = options.arrayMode === 'id' ? indexedIds(right) : undefined;
      if (leftIds && rightIds) {
        for (const [id, index] of leftIds) {
          const next = rightIds.get(id);
          if (next === undefined) record({ kind: 'removed', path: `${path}/${index}`, before: left[index] });
          else walk(left[index], right[next], `${path}/${index}`);
        }
        for (const [id, index] of rightIds) {
          if (!leftIds.has(id)) record({ kind: 'added', path: `${path}/${index}`, after: right[index] });
        }
      } else {
        for (let index = 0; index < Math.max(left.length, right.length); index++) {
          const child = `${path}/${index}`;
          if (index >= left.length) record({ kind: 'added', path: child, after: right[index] });
          else if (index >= right.length) record({ kind: 'removed', path: child, before: left[index] });
          else walk(left[index], right[index], child);
        }
      }
    } else if (isObject(left) && isObject(right)) {
      for (const key of Object.keys(left)) {
        const child = `${path}/${pointerPart(key)}`;
        if (!own(right, key)) record({ kind: 'removed', path: child, before: left[key] });
        else walk(left[key], right[key], child);
      }
      for (const key of Object.keys(right)) {
        if (!own(left, key)) record({ kind: 'added', path: `${path}/${pointerPart(key)}`, after: right[key] });
      }
    } else record({ kind: 'changed', path, before: left, after: right });
  };
  walk(before, after, '');
  return changes;
}

export function summarize(changes: Change[]): { added: number; removed: number; changed: number; total: number } {
  const result = { added: 0, removed: 0, changed: 0, total: changes.length };
  for (const change of changes) result[change.kind]++;
  return result;
}

export function formatJson(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

/** Fences exceed every backtick run in content, preventing fence injection.
 * Paths are JSON-quoted inside code spans so newlines/markup remain inert.
 * Reports intentionally contain original values: redact inputs before diffing
 * when secrets must not be included. Render Markdown with raw HTML disabled.
 */
export function createReport(changes: Change[]): string {
  const fence = (text: string, minimum: number): string => {
    let length = minimum;
    for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
    return '`'.repeat(length);
  };
  const block = (value: JsonValue): string => {
    const text = formatJson(value);
    const ticks = fence(text, 3);
    return `${ticks}json\n${text}\n${ticks}`;
  };
  const summary = summarize(changes);
  const lines = ['# JSON comparison report', '', `Added: ${summary.added} | Removed: ${summary.removed} | Changed: ${summary.changed} | Total: ${summary.total}`, ''];
  if (!changes.length) lines.push('No differences.');
  for (const change of changes) {
    const path = JSON.stringify(change.path === '' ? '/' : change.path);
    const ticks = fence(path, 1);
    lines.push(`## ${change.kind.toUpperCase()} ${ticks} ${path} ${ticks}`, '');
    if (change.kind !== 'added' && own(change, 'before')) lines.push('Before:', '', block(change.before!), '');
    if (change.kind !== 'removed' && own(change, 'after')) lines.push('After:', '', block(change.after!), '');
  }
  return lines.join('\n');
}

const SECRET_KEYS = new Set(['password', 'token', 'secret', 'api_key', 'apikey', 'authorization', 'access_token', 'refresh_token']);
/** Exact, case-insensitive key matching; returns a deep copy of JSON containers.
 * This is key-based redaction, not a guarantee that arbitrary text has no secrets.
 */
export function redactJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redactJson);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).map(key => [key, SECRET_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactJson(value[key])]));
}
