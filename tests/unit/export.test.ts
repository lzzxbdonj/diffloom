import { describe, expect, it } from 'vitest';
import { createJsonReport, createMarkdownReport, redactChange } from '../../src/lib/export';
import { createReport, diffJson } from '../../src/lib/json';
import type { Change, JsonValue } from '../../src/lib/json';

const oldSecret = 'SYNTHETIC_PRIVATE_OLD_7812';
const newSecret = 'SYNTHETIC_PRIVATE_NEW_9473';
const marker = '[REDACTED]';
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe('redactChange', () => {
  it.each(['password', 'PASSWORD', 'token', 'Token', 'secret', 'api_key', 'apiKey', 'APIKEY', 'authorization', 'access_token', 'refresh_token'])('redacts a sensitive ancestor %s', key => {
    expect(redactChange({ kind: 'changed', path: `/config/${key}/nested/value`, before: oldSecret, after: newSecret })).toEqual({
      kind: 'changed', path: `/config/${key}/nested/value`, before: marker, after: marker,
    });
  });
  it.each(['added', 'removed', 'changed'] as const)('preserves absent sides for %s', kind => {
    const input: Change = { kind, path: '/token/value', ...(kind !== 'added' ? { before: oldSecret } : {}), ...(kind !== 'removed' ? { after: newSecret } : {}) };
    const output = redactChange(input);
    expect(Object.hasOwn(output, 'before')).toBe(kind !== 'added');
    expect(Object.hasOwn(output, 'after')).toBe(kind !== 'removed');
    expect(output.kind).toBe(kind);
    expect(output.path).toBe(input.path);
    expect(JSON.stringify(output)).not.toContain(oldSecret);
    expect(JSON.stringify(output)).not.toContain(newSecret);
  });
  it('redacts a leaf key and whole sensitive container, including null', () => {
    expect(redactChange({ kind: 'changed', path: '/password', before: null, after: { unrelated: newSecret } })).toEqual({ kind: 'changed', path: '/password', before: marker, after: marker });
  });
  it('redacts numeric array descendants of secret containers', () => {
    expect(redactChange({ kind: 'added', path: '/Authorization/0/plain', after: newSecret }).after).toBe(marker);
  });
  it('decodes escaped segments once without confusing embedded slash with hierarchy', () => {
    expect(redactChange({ kind: 'added', path: '/a~1b/ToKeN/value', after: newSecret }).after).toBe(marker);
    expect(redactChange({ kind: 'added', path: '/token~1value', after: 'public' }).after).toBe('public');
    expect(redactChange({ kind: 'added', path: '/~0token', after: 'public' }).after).toBe('public');
    expect(redactChange({ kind: 'added', path: '/~01token', after: 'public' }).after).toBe('public');
    expect(redactChange({ kind: 'added', path: '/%74oken', after: 'public' }).after).toBe('public');
  });
  it('uses exact keys, not substrings', () => {
    expect(redactChange({ kind: 'added', path: '/tokens/password_hint', after: 'public' }).after).toBe('public');
  });
  it('redacts nested sensitive values under ordinary paths', () => {
    expect(redactChange({ kind: 'changed', path: '/config', before: { token: oldSecret, keep: 1 }, after: [{ nested: { apiKey: newSecret }, keep: false }] })).toEqual({
      kind: 'changed', path: '/config', before: { token: marker, keep: 1 }, after: [{ nested: { apiKey: marker }, keep: false }],
    });
  });
  it('leaves root scalars without a name context alone but redacts root objects', () => {
    expect(redactChange({ kind: 'changed', path: '', before: 'token', after: newSecret })).toEqual({ kind: 'changed', path: '', before: 'token', after: newSecret });
    expect(redactChange({ kind: 'added', path: '', after: { password: newSecret } }).after).toEqual({ password: marker });
    expect(redactChange({ kind: 'added', path: '/', after: 'public' }).after).toBe('public');
  });
  it('does not mutate frozen inputs and clones nonsensitive containers', () => {
    const input: Change = { kind: 'changed', path: '/config', before: { nested: [{ token: oldSecret }] }, after: { nested: [{ safe: 1 }] } };
    freeze(input);
    const result = redactChange(input);
    expect(input.before).toEqual({ nested: [{ token: oldSecret }] });
    expect(result).not.toBe(input);
    expect(result.before).not.toBe(input.before);
    expect(result.after).not.toBe(input.after);
    expect(result.before).toEqual({ nested: [{ token: marker }] });
  });
  it('handles prototype property names safely in both pointers and payloads', () => {
    const value = JSON.parse('{"__proto__":{"token":"SYNTHETIC_PRIVATE_NEW_9473"},"constructor":{"password":"SYNTHETIC_PRIVATE_OLD_7812"}}') as JsonValue;
    const result = redactChange({ kind: 'added', path: '/__proto__/constructor/prototype', after: value });
    expect(JSON.stringify(result.after)).toBe('{"__proto__":{"token":"[REDACTED]"},"constructor":{"password":"[REDACTED]"}}');
    expect(redactChange({ kind: 'added', path: '/__proto__/token/value', after: newSecret }).after).toBe(marker);
    expect(Object.prototype).not.toHaveProperty('token');
    expect(Object.prototype).not.toHaveProperty('password');
  });
});

describe('export reports', () => {
  const changes = diffJson({ token: { value: oldSecret }, safe: 1, gone: true }, { token: { value: newSecret }, safe: 2, added: { authorization: newSecret } });
  it.each([createJsonReport, createMarkdownReport])('does not serialize secrets when enabled', report => {
    const output = report(changes, true);
    expect(output).not.toContain(oldSecret);
    expect(output).not.toContain(newSecret);
    expect(output).toContain(marker);
    expect(output).toContain('/token/value');
  });
  it.each([createJsonReport, createMarkdownReport])('preserves raw values when disabled', report => {
    const output = report(changes, false);
    expect(output).toContain(oldSecret);
    expect(output).toContain(newSecret);
  });
  it('JSON report preserves current-filter metadata, flags, summary and changes', () => {
    const subset = changes.filter(change => change.path === '/token/value');
    expect(JSON.parse(createJsonReport(subset, true))).toEqual({
      tool: 'Diffloom', version: '1.0.0', scope: 'current filters', redacted: true,
      summary: { added: 0, removed: 0, changed: 1, total: 1 },
      changes: [{ kind: 'changed', path: '/token/value', before: marker, after: marker }],
    });
    expect(JSON.parse(createJsonReport(subset, false)).redacted).toBe(false);
  });
  it('Markdown delegates safe fenced rendering and adds scope/redaction metadata', () => {
    const subset: Change[] = [{ kind: 'added', path: '/safe', after: '````\n<script>alert(1)</script>' }];
    expect(createMarkdownReport(subset, false)).toBe(`${createReport(subset)}\n\n---\nExport scope: current path and type filters. Common-secret redaction: off.\n`);
    expect(createMarkdownReport(subset, true)).toContain('Common-secret redaction: on (not a guarantee).');
    expect(createMarkdownReport(subset, true)).toContain('`````json');
  });
  it('handles empty reports', () => {
    expect(JSON.parse(createJsonReport([], true))).toMatchObject({ summary: { total: 0 }, changes: [] });
    expect(createMarkdownReport([], true)).toContain('No differences.');
  });
  it('does not mutate input changes in either mode', () => {
    const snapshot = JSON.stringify(changes);
    freeze(changes);
    for (const report of [createJsonReport, createMarkdownReport]) {
      report(changes, true);
      report(changes, false);
    }
    expect(JSON.stringify(changes)).toBe(snapshot);
  });
});
