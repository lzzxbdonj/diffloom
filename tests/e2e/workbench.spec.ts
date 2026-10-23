import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function compare(page: Page, before: unknown, after: unknown) {
  await page.getByRole('textbox', { name: 'Original JSON', exact: true }).fill(JSON.stringify(before));
  await page.getByRole('textbox', { name: 'Modified JSON', exact: true }).fill(JSON.stringify(after));
  await page.getByRole('button', { name: 'Compare JSON' }).click();
}
async function report(page: Page, format: 'json' | 'markdown' = 'json', redact = true) {
  await page.getByRole('button', { name: 'Export report' }).click();
  await page.getByRole('checkbox', { name: /Redact common secrets/ }).setChecked(redact);
  const downloadPromise = page.waitForEvent('download');
  await page.locator(`[data-export="${format}"]`).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`diffloom-report.${format === 'json' ? 'json' : 'md'}`);
  return readFile((await download.path())!, 'utf8');
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('loads a real, ready-to-use comparison without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Find the difference.' })).toBeVisible();
  await expect(page.locator('#count-all')).toHaveText('9');
  await expect(page.locator('#count-added')).toHaveText('2');
  await expect(page.locator('#count-removed')).toHaveText('1');
  await expect(page.locator('#count-changed')).toHaveText('6');
  await expect(page.locator('.change-row')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('compares nested values, escaped paths and root primitives', async ({ page }) => {
  await compare(page, { 'a/b': { '~key': 1 }, deleted: true }, { 'a/b': { '~key': 2 }, added: null });
  await expect(page.locator('#count-all')).toHaveText('3');
  await expect(page.locator('.change-path code').first()).toHaveText('/a~1b/~0key');
  await compare(page, false, null);
  await expect(page.locator('.change-kind')).toHaveText('modified · document root');
  await page.locator('.change-row summary').click();
  await expect(page.locator('.change-detail')).toContainText('false');
  await expect(page.locator('.change-detail')).toContainText('null');
});

test('rejects malformed JSON without replacing the editor contents', async ({ page }) => {
  await page.locator('#before-input').fill('{"bad": }');
  await page.locator('#compare-button').click();
  await expect(page.locator('#before-error')).toBeVisible();
  await expect(page.locator('#before-error')).toContainText('Invalid JSON');
  await expect(page.locator('#before-input')).toHaveValue('{"bad": }');
  await expect(page.locator('#before-input')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#export-button')).toBeDisabled();
});

test('rejects unsafe numeric IDs and underflow without rewriting original text', async ({ page }) => {
  for (const source of ['{"id":9007199254740993}', '{"value":1e-400}']) {
    await page.locator('#before-input').fill(source);
    await page.locator('#compare-button').click();
    await expect(page.locator('#before-error')).toBeVisible();
    await expect(page.locator('#before-input')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#export-button')).toBeDisabled();
    await page.getByRole('button', { name: 'Format before JSON' }).click();
    await expect(page.locator('#before-input')).toHaveValue(source);
  }
  await compare(page, { id: '9007199254740992' }, { id: '9007199254740993' });
  await expect(page.locator('#count-all')).toHaveText('1');
  await expect(page.locator('.change-path code')).toHaveText('/id');
});

test('marks old results stale and compares using the keyboard', async ({ page }) => {
  await page.locator('#before-input').fill('{"a":1}');
  await page.locator('#after-input').fill('{"a":2}');
  await expect(page.locator('#result-state')).toHaveText('Changes not compared');
  await expect(page.locator('#export-button')).toBeDisabled();
  await page.locator('#after-input').press('Control+Enter');
  await expect(page.locator('#count-all')).toHaveText('1');
  await expect(page.locator('#export-button')).toBeEnabled();
});

test('formats, swaps and resets the actual JSON documents', async ({ page }) => {
  await compare(page, { a: 1 }, { a: 2, added: true });
  await page.getByRole('button', { name: 'Format before JSON' }).click();
  await expect(page.locator('#before-input')).toHaveValue('{\n  "a": 1\n}');
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  await expect(page.locator('#before-input')).toHaveValue('{"a":2,"added":true}');
  await expect(page.locator('#count-removed')).toHaveText('1');
  await page.getByRole('button', { name: 'Reset to current example' }).click();
  await expect(page.locator('#count-all')).toHaveText('9');
});

test('asks before replacing un-compared edits with an example', async ({ page }) => {
  await page.locator('#before-input').fill('"unsaved"');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'App configuration' }).click();
  await expect(page.locator('#before-input')).toHaveValue('"unsaved"');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'App configuration' }).click();
  await expect(page.locator('#before-filename')).toHaveText('config.staging.json');
  await expect(page.locator('#before-input')).toHaveValue(/northstar/);
});

test('filters by kind and path and exports only the visible subset', async ({ page }) => {
  await page.locator('[data-kind="changed"]').click();
  await page.getByRole('searchbox', { name: 'Filter changes by path' }).fill('/subscription');
  await expect(page.locator('.change-row')).toHaveCount(3);
  await expect(page.locator('#changes-count')).toHaveText('3 of 9 changes');
  const data = JSON.parse(await report(page));
  expect(data.scope).toBe('current filters');
  expect(data.summary.total).toBe(3);
  expect(data.changes.every((item: { path: string }) => item.path.startsWith('/subscription/'))).toBe(true);
  await page.locator('#path-search').fill('no-match');
  await expect(page.getByText('No changes on this path.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.change-row')).toHaveCount(9);
});

test('redacts sensitive ancestors and nested objects in both export formats only', async ({ page }) => {
  const before = { token: { value: 'fake-old-credential' }, profile: null };
  const after = { token: { value: 'fake-new-credential' }, profile: { password: 'fake-password', name: 'Ada' } };
  await compare(page, before, after);
  const json = await report(page);
  expect(json).not.toContain('fake-old-credential');
  expect(json).not.toContain('fake-new-credential');
  expect(json).not.toContain('fake-password');
  expect(json).toContain('[REDACTED]');
  expect(json).toContain('Ada');
  const markdown = await report(page, 'markdown');
  expect(markdown).toContain('# JSON comparison report');
  expect(markdown).not.toContain('fake-new-credential');
  expect(markdown).not.toContain('fake-password');
  await expect(page.locator('#after-input')).toHaveValue(JSON.stringify(after));
  const unredacted = JSON.parse(await report(page, 'json', false));
  expect(unredacted.redacted).toBe(false);
  expect(JSON.stringify(unredacted)).toContain('fake-new-credential');
});

test('ignores exact pointer paths and descendants, not similar prefixes', async ({ page }) => {
  await compare(page, { meta: { n: 1 }, metadata: 1 }, { meta: { n: 2 }, metadata: 2 });
  await page.locator('#options summary').click();
  await page.locator('#ignore-paths').fill('/meta');
  await page.locator('#compare-button').click();
  await expect(page.locator('#count-all')).toHaveText('1');
  await expect(page.locator('.change-path code')).toHaveText('/metadata');
});

test('validates ignore paths rather than silently using an invalid pointer', async ({ page }) => {
  await page.locator('#options summary').click();
  await page.locator('#ignore-paths').fill('meta~bad');
  await page.locator('#compare-button').click();
  await expect(page.locator('#toast')).toContainText('Invalid JSON Pointer');
  await expect(page.locator('#export-button')).toBeDisabled();
  await expect(page.locator('#ignore-paths')).toBeFocused();
});

test('matches arrays by unique typed id and ignores reorder-only changes', async ({ page }) => {
  await compare(page, [{ id: 'a', n: 1 }, { id: 'b', n: 2 }], [{ id: 'b', n: 2 }, { id: 'a', n: 1 }]);
  await expect(page.locator('#count-all')).not.toHaveText('0');
  await page.locator('#options summary').click();
  await page.getByLabel('Array comparison', { exact: true }).selectOption('id');
  await page.locator('#compare-button').click();
  await expect(page.locator('#count-all')).toHaveText('0');
  await expect(page.getByText('Same meaning. Same JSON.')).toBeVisible();
  await compare(page, [{ id: 'a', n: 1 }, { id: 'b', n: 2 }], [{ id: 'b', n: 3 }, { id: 'a', n: 1 }]);
  await expect(page.locator('.change-path code')).toHaveText('/1/n');
});

test('imports local files without uploading them', async ({ page }) => {
  await page.locator('#before-file').setInputFiles({ name: 'local-before.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await page.locator('#after-file').setInputFiles({ name: 'local-after.json', mimeType: 'application/json', buffer: Buffer.from('{"a":2}') });
  await expect(page.locator('#before-filename')).toHaveText('local-before.json');
  await expect(page.locator('#after-input')).toHaveValue('{"a":2}');
  await page.locator('#compare-button').click();
  await expect(page.locator('#count-all')).toHaveText('1');
});

test('rejects oversized imported files and preserves the current document', async ({ page }) => {
  const original = await page.locator('#before-input').inputValue();
  await page.locator('#before-file').setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(1_048_577, ' ') });
  await expect(page.locator('#toast')).toContainText('exceeds the 1 MiB limit');
  await expect(page.locator('#before-input')).toHaveValue(original);
});

test('does not execute HTML from JSON values or property names', async ({ page }) => {
  const attack = '<img src=x onerror="window.__injected=true">';
  await compare(page, {}, { [attack]: attack });
  await expect(page.locator('#change-list img')).toHaveCount(0);
  await expect(page.locator('#change-list')).toContainText(attack);
  await page.locator('.change-row summary').click();
  await expect(page.locator('.change-detail pre').last()).toHaveText(JSON.stringify(attack));
  await expect(page.locator('#app img')).toHaveCount(0);
  expect(await page.evaluate(() => '__injected' in window)).toBe(false);
});

test('renders incremental results without silently dropping export changes', async ({ page }) => {
  const after = Object.fromEntries(Array.from({ length: 205 }, (_, index) => [`key${index}`, index]));
  await compare(page, {}, after);
  await expect(page.locator('.change-row')).toHaveCount(100);
  await page.getByRole('button', { name: /Show 100 more changes/ }).click();
  await expect(page.locator('.change-row')).toHaveCount(200);
  await page.getByRole('button', { name: /Show 5 more changes/ }).click();
  await expect(page.locator('.change-row')).toHaveCount(205);
  expect(JSON.parse(await report(page)).changes).toHaveLength(205);
});

test('privacy and field guide dialogs are dismissible with keyboard and buttons', async ({ page }) => {
  await page.getByRole('button', { name: /A note on privacy/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('No comparison data is sent');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Field guide' }).click();
  await expect(page.getByRole('dialog')).toContainText('A clearer way to compare');
  await page.getByRole('button', { name: /Got it/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('stays functional after the network is disabled and uses no browser persistence', async ({ page, context }) => {
  // Let the browser finish its own favicon/static asset fetches before measuring
  // runtime traffic. The privacy contract excludes initial asset loading.
  await page.waitForLoadState('networkidle');
  const outgoing: string[] = [];
  page.on('request', request => outgoing.push(request.url()));
  await context.setOffline(true);
  await compare(page, { local: true }, { local: false });
  await expect(page.locator('#count-all')).toHaveText('1');
  expect(outgoing).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

for (const width of [390, 768, 1440]) {
  test(`keeps the workbench usable at ${width}px without horizontal page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.locator('#before-input')).toBeVisible();
    await expect(page.locator('#after-input')).toBeVisible();
    await expect(page.locator('#compare-button')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await compare(page, { responsive: 1 }, { responsive: 2 });
    await expect(page.locator('#count-all')).toHaveText('1');
  });
}
