# Contributing to Diffloom

Thanks for helping make structured changes easier to understand. Small, focused improvements are welcome: a clearer interaction, a comparison edge case, an accessibility fix, or documentation that answers a real question.

## Set up

Use **Node.js 22.x (at least 22.12), 24.x, or 26 and newer**, and npm (`^22.12.0 || ^24.0.0 || >=26.0.0`). This range matches the development toolchain, including Vitest 5. After obtaining a local checkout of the repository you intend to contribute to:

```sh
npm install
npx playwright install --with-deps chromium
npm run dev
```

Use `npm install` for the first contributor install. Commit intentional dependency changes together with the updated lockfile; do not switch package managers. CI uses `npm ci` for reproducible installs. Browser installation may need operating-system packages or elevated privileges on Linux.

## Find your way around

- `src/main.ts`: the application interface and interaction wiring.
- `src/style.css`: layout, responsive behavior, and visual styling.
- `src/lib/json.ts`: JSON parsing, limits, and semantic comparison.
- `src/lib/export.ts`: safe report generation and export redaction.
- `src/examples.ts`: synthetic examples for common comparison tasks.
- `tests/unit/`: Vitest tests for core behavior.
- `tests/e2e/`: Playwright tests for browser workflows.

The application uses vanilla TypeScript and Vite with **no runtime package dependencies**. Keep the UI in English. Discuss a new dependency or a substantial architecture change before making it part of a pull request.

## Preserve the product's contracts

### Local-first by default

Do not introduce document uploads, analytics, accounts, remote fonts, external image requests, persistence, or a backend as an incidental implementation detail. Inputs remain in memory and a reload resets them. The app must work as static assets under a repository subpath; preserve Vite's relative base `./`. There is no service worker or promise of offline PWA support.

### Compare JSON, not presentation

Accept strict JSON only. Preserve the **1 MiB UTF-8 per-input** and **128-depth** guards, useful parse errors, and text-safe handling of untrusted content. Object key ordering and whitespace are not semantic changes. Comparison is explicit through **Compare** or **Ctrl/Cmd + Enter**; do not silently turn it into comparison on every keystroke.

Preserve the numeric contract: values use JavaScript IEEE 754 double precision, not arbitrary precision. Ordinary decimals are allowed and follow JavaScript precision and rounding; do not claim every decimal is exact. Reject non-finite results (such as `1e400`), parsed integer values outside −9007199254740991 to 9007199254740991, and nonzero numeric literals that underflow to zero. Recommend JSON strings for long numeric IDs. Regression tests should cover these boundaries without implying arbitrary-precision comparison.

Path search and ignore rules use JSON Pointer semantics, including escaped tokens. Ignoring a path excludes that exact location and descendants, not similarly prefixed sibling names. Support index-based arrays and unique-`id` record matching that ignores reorder-only changes. Missing or duplicate IDs must fall back to index matching. Matched and removed records retain before-side indices; additions use after-side indices.

### Make export boundaries clear

Markdown and JSON exports contain the currently filtered result subset. Redaction is enabled by default **for exports only** and recursively recognizes `password`, `token`, `secret`, `api_key`, `apiKey`, `authorization`, `access_token`, and `refresh_token`. It must not rewrite inputs or imply the displayed report and ordinary copy actions are sanitized. Keep the warning that key-based redaction is incomplete.

### Keep the workbench usable

Use semantic controls, accessible names, visible keyboard focus, and readable contrast. Preserve keyboard shortcuts, usable small-screen layouts, and clear empty, invalid, stale-result, and no-difference states. Synthetic examples and test fixtures must never include real credentials or private documents.

## Verify a change

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run check` combines type-checking, unit tests, and the production build; it does **not** include end-to-end tests. Playwright's configured web server builds and serves the application, so a manually started development server is not required for that command. The CI workflow keeps typecheck/unit/build and browser tests in separate jobs on Ubuntu with Node.js 22.

Add unit tests for comparison behavior and browser tests for user-visible flows. The browser suite includes automated accessibility checks with axe; passing these checks does not establish full WCAG conformance or replace manual accessibility review. Especially useful regression cases include pointer escaping, exact-and-descendant ignore boundaries, reordered ID arrays, missing/duplicate IDs, input byte limits, depth limits, rendering untrusted strings as text, filtered exports, and recursive redaction. For visual changes, check both a wide desktop viewport and a narrow viewport, plus keyboard-only interaction.

On Windows, an installed Microsoft Edge can be used instead of downloaded Chromium. Set the optional channel override in PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e
```

To refresh the documentation screenshots, run `npm run build` and `npm run preview -- --port 4180` in one terminal, then `node scripts/capture.mjs` from the project directory in another. Optional `PLAYWRIGHT_CHANNEL=msedge` selects installed Edge; `DIFFLOOM_PREVIEW_URL` overrides the default `http://127.0.0.1:4180`. See the [README screenshot instructions](README.md#capture-the-documentation-screenshots) for PowerShell examples.

Do not claim checks passed unless you actually ran them. In a pull request, list the commands run and their outcomes, and identify anything you could not verify. Dependency audits can inform review, but are not a required CI gate; never conceal an audit finding or run an automatic breaking upgrade without reviewing it.

## Propose and submit

For a bug, provide minimal synthetic Before/After inputs, expected and actual behavior, relevant options, and browser details using the bug template. For a feature, explain the problem and an example workflow before prescribing an implementation. For security-sensitive issues, follow [SECURITY.md](SECURITY.md) instead of posting publicly.

Keep pull requests focused. Explain the user impact, any semantic or privacy changes, and how you tested them. Include screenshots for visible UI changes and update both [README.md](README.md) and [README.zh-CN.md](README.zh-CN.md) when documented behavior changes. Do not add a guessed repository URL, hosted demo URL, or claims about checks that have not run.

By contributing, you agree that your contributions may be distributed under the project's [MIT license](LICENSE). Be respectful, assume good intent, and keep feedback specific and constructive.
