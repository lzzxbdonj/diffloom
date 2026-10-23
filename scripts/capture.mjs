import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Run `npm run build && npm run preview -- --port 4180` in another terminal.
// Set PLAYWRIGHT_CHANNEL=msedge to use a locally installed Edge browser.
const url = process.env.DIFFLOOM_PREVIEW_URL || 'http://127.0.0.1:4180';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1130 }, deviceScaleFactor: 1 });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#count-all').filter({ hasText: '9' }).waitFor();
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../docs/screenshot.png', import.meta.url)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: fileURLToPath(new URL('../docs/screenshot-mobile.png', import.meta.url)), fullPage: true });
  if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
  const origin = new URL(url).origin;
  const external = requests.filter(request => !request.startsWith(`${origin}/`));
  if (external.length) throw new Error(`Unexpected external requests: ${external.join(', ')}`);
  console.log(`Captured desktop and mobile screenshots; ${requests.length} same-origin asset requests; no page errors.`);
} finally {
  await browser.close();
}
