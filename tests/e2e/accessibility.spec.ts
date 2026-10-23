import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390]) {
  test(`workbench meets automated WCAG A/AA checks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('#count-all')).toHaveText('9');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(({ id, nodes }) => ({
      id, failures: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }))).toEqual([]);
  });
}

test('field guide has an accessible name and readable dialog content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Field guide' }).click();
  await expect(page.getByRole('dialog', { name: 'A clearer way to compare.' })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({
      id, failures: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }))).toEqual([]);
});

test('mobile examples remain available and preserve edits when replacement is cancelled', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Load example' }).selectOption('config');
  await expect(page.locator('#before-filename')).toHaveText('config.staging.json');
  await page.locator('#before-input').fill('"keep this"');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('combobox', { name: 'Load example' }).selectOption('api');
  await expect(page.getByRole('combobox', { name: 'Load example' })).toHaveValue('config');
  await expect(page.locator('#before-input')).toHaveValue('"keep this"');
});
