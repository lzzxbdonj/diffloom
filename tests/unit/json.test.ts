import { describe, expect, it } from 'vitest';
import { createReport, diffJson, formatJson, parseJson, redactJson, summarize, type JsonValue } from '../../src/lib/json';

function parsed(source: string): JsonValue {
  const result = parseJson(source);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function freeze(value: JsonValue): JsonValue {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('parseJson', () => {
  it.each(['null', 'true', 'false', '42', '-1.5e2', '"hello"', '[]', '{}', ' {"x":[1,null]} \n'])('accepts strict JSON %s', source => {
    expect(parseJson(source)).toEqual({ ok: true, value: JSON.parse(source) });
  });
  it.each(['', ' \r\n\t'])('explains empty input', source => {
    expect(parseJson(source)).toEqual({ ok: false, error: expect.stringMatching(/empty/i) });
  });
  it.each(['undefined', 'NaN', 'Infinity', '{a:1}', '{"a":1,}', '[1,]', '// comment\n{}', '{} {}', '01', '"unterminated', '\uFEFF{}'])('rejects invalid JSON %s', source => {
    expect(parseJson(source)).toEqual({ ok: false, error: expect.stringMatching(/Invalid JSON/) });
  });
  it('rejects finite-range overflow, including in a nested object', () => {
    expect(parseJson('1e400').ok).toBe(false);
    expect(parseJson('{"x":[-1e400]}').ok).toBe(false);
  });
  it.each(['9007199254740992', '9007199254740993', '-9007199254740992', '-9007199254740993', '1e20', '-9.007199254740993e15', '9007199254740992.0', '{"rows":[{"id":9007199254740993}]}'])('rejects unsafe integers %s', source => {
    expect(parseJson(source)).toEqual({ ok: false, error: expect.stringMatching(/safe integer range.*IDs.*strings/) });
  });
  it.each(['1e-400', '-1E-400', '0.001e-999', '-0.0001E-999', '{"nested":[1e-999]}'])('rejects nonzero underflow %s', source => {
    expect(parseJson(source)).toEqual({ ok: false, error: expect.stringMatching(/underflow to zero/) });
  });
  it.each(['9007199254740991', '-9007199254740991', '9.007199254740991e15', '1.5e2', '0.1', '1e-300', '5e-324', '-5e-324', '0e-999', '-0.000E-999', '0e999', '{"nested":[0e-999,5e-324]}'])('accepts safe numbers and genuine zero %s', source => {
    expect(parseJson(source)).toEqual({ ok: true, value: JSON.parse(source) });
  });
  it('does not mistake digits inside strings or keys for numbers', () => {
    const value = { '9007199254740993': ['1e-999', '-1e999', '9007199254740993', 'escaped " 9007199254740993', 'backslash \\ 1e-400'], safe: 12 };
    expect(parseJson(JSON.stringify(value))).toEqual({ ok: true, value });
    expect(parseJson('"\\u00319007199254740993"').ok).toBe(true);
  });
  it('still detects numeric tokens after escaped strings', () => {
    const source = JSON.stringify(['quote " and backslash \\', 'safe']).replace('"safe"', '9007199254740993');
    expect(parseJson(source)).toEqual({ ok: false, error: expect.stringMatching(/safe integer range/) });
  });
  it('allows 128 containers and rejects 129', () => {
    expect(parseJson('['.repeat(128) + '0' + ']'.repeat(128)).ok).toBe(true);
    expect(parseJson('['.repeat(129) + '0' + ']'.repeat(129))).toEqual({ ok: false, error: expect.stringMatching(/128/) });
  });
  it('counts object and array containers together', () => {
    expect(parseJson('{"a":'.repeat(128) + '[]' + '}'.repeat(128)).ok).toBe(false);
  });
  it('accepts the exact UTF-8 byte boundary and rejects the next byte', () => {
    expect(parseJson('"' + 'a'.repeat(1024 * 1024 - 2) + '"').ok).toBe(true);
    expect(parseJson('"' + 'a'.repeat(1024 * 1024 - 1) + '"')).toEqual({ ok: false, error: expect.stringMatching(/UTF-8/) });
  });
  it('counts multibyte characters rather than UTF-16 length', () => {
    expect(parseJson('"' + '😀'.repeat(262144) + '"').ok).toBe(false);
    expect(parseJson('"' + 'é'.repeat(524288) + '"').ok).toBe(false);
  });
});

describe('diffJson basic semantics', () => {
  it.each([null, true, 4, 'x', [], {}] as JsonValue[])('has no changes for equal values', value => {
    expect(diffJson(value, JSON.parse(JSON.stringify(value)))).toEqual([]);
  });
  it('ignores object property order', () => expect(diffJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]));
  it('reports root replacement with empty pointer', () => {
    expect(diffJson(null, [1])).toEqual([{ kind: 'changed', path: '', before: null, after: [1] }]);
    expect(diffJson({}, [])).toEqual([{ kind: 'changed', path: '', before: {}, after: [] }]);
  });
  it('does not coerce primitive types', () => {
    expect(diffJson(1, '1')[0].kind).toBe('changed');
    expect(diffJson(false, 0)[0].kind).toBe('changed');
    expect(diffJson(-0, 0)).toEqual([]);
  });
  it('reports nested added, removed and changed values deterministically', () => {
    expect(diffJson({ a: { x: 1, y: null }, z: 4 }, { a: { x: 2, n: false }, z: 4 })).toEqual([
      { kind: 'changed', path: '/a/x', before: 1, after: 2 },
      { kind: 'removed', path: '/a/y', before: null },
      { kind: 'added', path: '/a/n', after: false },
    ]);
  });
  it('records added/removed subtrees once, rather than every leaf', () => {
    expect(diffJson({}, { x: { a: 1 } })).toEqual([{ kind: 'added', path: '/x', after: { a: 1 } }]);
    expect(diffJson({ x: [] }, {})).toEqual([{ kind: 'removed', path: '/x', before: [] }]);
  });
  it('escapes tilde, slash and empty keys correctly', () => {
    expect(diffJson({ 'a~/b': { '': 1 } }, { 'a~/b': { '': 2 } })[0].path).toBe('/a~0~1b/');
    expect(diffJson({ '': 1 }, { '': 2 })[0].path).toBe('/');
  });
  it('compares arrays by index by default', () => {
    expect(diffJson([1, 2], [2, 1, 3])).toEqual([
      { kind: 'changed', path: '/0', before: 1, after: 2 },
      { kind: 'changed', path: '/1', before: 2, after: 1 },
      { kind: 'added', path: '/2', after: 3 },
    ]);
    expect(diffJson([1, 2], [1])).toEqual([{ kind: 'removed', path: '/1', before: 2 }]);
  });
  it('supports dangerous own property names without pollution', () => {
    const left = parsed('{"__proto__":{"polluted":1},"constructor":1,"toString":1}');
    const right = parsed('{"__proto__":{"polluted":2},"prototype":3}');
    expect(diffJson(left, right).map(change => change.path)).toEqual(['/__proto__/polluted', '/constructor', '/toString', '/prototype']);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('never mutates frozen inputs or options', () => {
    const before = freeze({ items: [{ id: 1, x: 1 }, { id: 2 }] });
    const after = freeze({ items: [{ id: 2 }, { id: 1, x: 2 }] });
    const ignorePaths = ['/unused'];
    Object.freeze(ignorePaths);
    const options = Object.freeze({ arrayMode: 'id' as const, ignorePaths });
    expect(diffJson(before, after, options)).toHaveLength(1);
    expect(before).toEqual({ items: [{ id: 1, x: 1 }, { id: 2 }] });
  });
});

describe('ignorePaths', () => {
  it('ignores exact pointer and descendants but not shared prefixes', () => {
    expect(diffJson({ a: { b: 1 }, ab: 1 }, { a: { b: 2 }, ab: 2 }, { ignorePaths: ['/a'] })).toEqual([
      { kind: 'changed', path: '/ab', before: 1, after: 2 },
    ]);
  });
  it('supports root, empty keys, escaped keys and arrays', () => {
    expect(diffJson(1, 2, { ignorePaths: [''] })).toEqual([]);
    expect(diffJson({ '': 1, a: 1 }, { '': 2, a: 2 }, { ignorePaths: ['/'] }).map(c => c.path)).toEqual(['/a']);
    expect(diffJson({ 'a/b': [1] }, { 'a/b': [2] }, { ignorePaths: ['/a~1b/0'] })).toEqual([]);
    expect(diffJson({ '~': 1 }, { '~': 2 }, { ignorePaths: ['/~0'] })).toEqual([]);
  });
  it('filters additions/removals and does not interpret wildcards', () => {
    expect(diffJson({ a: 1 }, { b: 1 }, { ignorePaths: ['/a', '/b'] })).toEqual([]);
    expect(diffJson({ a: 1 }, { a: 2 }, { ignorePaths: ['/*', 'a', '/~bad'] })).toHaveLength(1);
  });
  it('does not suppress an ancestor-level replacement for an ignored child', () => {
    expect(diffJson({ a: 1 }, null, { ignorePaths: ['/a'] })[0].path).toBe('');
  });
});

describe('ID arrays', () => {
  const options = { arrayMode: 'id' as const };
  it('ignores pure reorder', () => {
    expect(diffJson([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }], options)).toEqual([]);
  });
  it('uses before indexes for matches/removals and after indexes for additions', () => {
    expect(diffJson([{ id: 'a', x: 1 }, { id: 'b' }], [{ id: 'c' }, { id: 'a', x: 2 }], options)).toEqual([
      { kind: 'changed', path: '/0/x', before: 1, after: 2 },
      { kind: 'removed', path: '/1', before: { id: 'b' } },
      { kind: 'added', path: '/0', after: { id: 'c' } },
    ]);
  });
  it('keeps numeric/string IDs distinct and accepts zero/empty string', () => {
    const before = [{ id: 0 }, { id: '' }, { id: '0' }];
    expect(diffJson(before, [...before].reverse(), options)).toEqual([]);
    expect(diffJson([{ id: 1 }], [{ id: '1' }], options).map(c => c.kind)).toEqual(['removed', 'added']);
  });
  it.each([
    [[{ id: 1 }, { id: 1 }], [{ id: 1 }, { id: 2 }]],
    [[{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 1 }]],
    [[{ id: 1 }, {}], [{ id: 1 }, { id: 2 }]],
    [[{ id: null }], [{ id: 2 }]],
    [[{ id: true }], [{ id: false }]],
    [[null, 1], [1, null]],
    [[[1]], [[2]]],
  ] as [JsonValue[], JsonValue[]][])('falls back to index for invalid identity arrays', (before, after) => {
    expect(diffJson(before, after, options)).toEqual(diffJson(before, after));
  });
  it('supports empty arrays', () => {
    expect(diffJson([], [{ id: 1 }], options)).toEqual([{ kind: 'added', path: '/0', after: { id: 1 } }]);
    expect(diffJson([{ id: 1 }], [], options)).toEqual([{ kind: 'removed', path: '/0', before: { id: 1 } }]);
  });
  it('applies recursively, with ignore pointers evaluated at before indexes', () => {
    const before: JsonValue = { rows: [{ id: 1, items: [{ id: 'a' }, { id: 'b' }], x: 1 }, { id: 2 }] };
    const after: JsonValue = { rows: [{ id: 2 }, { id: 1, items: [{ id: 'b' }, { id: 'a' }], x: 2 }] };
    expect(diffJson(before, after, options).map(c => c.path)).toEqual(['/rows/0/x']);
    expect(diffJson(before, after, { ...options, ignorePaths: ['/rows/0/x'] })).toEqual([]);
  });
});

describe('formatting, summaries and reports', () => {
  it('formats JSON with two-space indentation', () => {
    expect(formatJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(formatJson(null)).toBe('null');
  });
  it('summarizes all change categories and an empty list', () => {
    expect(summarize([])).toEqual({ added: 0, removed: 0, changed: 0, total: 0 });
    expect(summarize(diffJson({ a: 1, b: 2 }, { a: 2, c: 3 }))).toEqual({ added: 1, removed: 1, changed: 1, total: 3 });
  });
  it('emits a helpful empty report', () => expect(createReport([])).toContain('No differences.'));
  it('includes null and primitive values and root display', () => {
    const report = createReport(diffJson(null, false));
    expect(report).toContain('CHANGED ` "/" `');
    expect(report).toContain('```json\nnull\n```');
    expect(report).toContain('```json\nfalse\n```');
    expect(report).toContain('Total: 1');
  });
  it('only emits relevant before/after sections', () => {
    expect(createReport(diffJson({}, { a: 1 }))).not.toContain('Before:');
    expect(createReport(diffJson({ a: 1 }, {}))).not.toContain('After:');
  });
  it('handles many separate backtick runs without argument-stack overflow', () => {
    expect(createReport(diffJson('', '` '.repeat(150000)))).toContain('After:');
  });
  it('uses fences longer than embedded backtick runs and quotes malicious paths', () => {
    const report = createReport(diffJson({}, { '\n# <script>`danger`': '````\n<script>alert(1)</script>' }));
    expect(report).toContain('`````json\n');
    expect(report).toContain('## ADDED `` "/\\n# <script>`danger`" ``');
    expect(report).not.toContain('\n# <script>');
    expect(report).toContain('\n`````');
  });
});

describe('redactJson', () => {
  it.each(['password', 'PASSWORD', 'Token', 'SECRET', 'api_key', 'apiKey', 'APIKEY', 'Authorization', 'access_token', 'REFRESH_TOKEN'])('redacts exact case-insensitive key %s', key => {
    expect(redactJson({ [key]: { nested: 'private' } })).toEqual({ [key]: '[REDACTED]' });
  });
  it('recurses through arrays and objects without mutating input', () => {
    const input = freeze({ list: [{ password: 'private', safe: 1 }], token: null, nested: { secret: ['private'] } });
    const result = redactJson(input);
    expect(result).toEqual({ list: [{ password: '[REDACTED]', safe: 1 }], token: '[REDACTED]', nested: { secret: '[REDACTED]' } });
    expect(input).toEqual({ list: [{ password: 'private', safe: 1 }], token: null, nested: { secret: ['private'] } });
    expect(result).not.toBe(input);
  });
  it('does not redact substrings or arbitrary values', () => {
    expect(redactJson({ password_hint: 'visible', tokens: ['visible'], message: 'secret', accessToken: 'visible' })).toEqual({ password_hint: 'visible', tokens: ['visible'], message: 'secret', accessToken: 'visible' });
  });
  it('safely preserves prototype-like keys as own data properties', () => {
    const result = redactJson(parsed('{"__proto__":{"password":"private"},"constructor":{"token":"private"}}'));
    expect(JSON.stringify(result)).toBe('{"__proto__":{"password":"[REDACTED]"},"constructor":{"token":"[REDACTED]"}}');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('password');
  });
  it.each([null, false, 4, 'token'] as JsonValue[])('preserves primitive %s', value => expect(redactJson(value)).toBe(value));
  it('clones nonsecret containers deeply', () => {
    const input = { a: [{ b: 1 }] };
    const result = redactJson(input) as typeof input;
    expect(result).toEqual(input);
    expect(result.a).not.toBe(input.a);
    expect(result.a[0]).not.toBe(input.a[0]);
  });
});
