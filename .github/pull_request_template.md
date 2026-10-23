## What and why

<!-- Explain the user problem, the change, and any related issue. Keep the scope focused. -->

## Behavior and tradeoffs

<!-- Call out comparison semantics, input limits, array identity, paths, export/redaction behavior, privacy, dependencies, or deployment changes. Write “No behavior change” when appropriate. -->

## Verification

<!-- List commands actually run and their outcomes. Do not mark unrun checks as passing. Explain anything you could not verify. npm run check does not include browser tests. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (install Chromium first)

Additional checks or limitations:

## Screenshots or recordings

<!-- For UI changes, include wide and narrow layouts when useful. Use synthetic data and check all attachments for sensitive information. -->

## Review checklist

- [ ] Tests cover the change, or I explained why new tests are not applicable.
- [ ] UI text remains English; relevant English and Chinese documentation is updated.
- [ ] Keyboard interaction, focus, and accessible names remain usable (if applicable).
- [ ] No unintended document uploads, analytics, external asset requests, or persistence were introduced.
- [ ] Inputs, fixtures, screenshots, and logs contain no real secrets or private documents.
- [ ] Export redaction remains enabled by default, export-only, and clearly described as incomplete (if applicable).
- [ ] Any dependency or lockfile changes are intentional and explained.

<!-- Security vulnerabilities belong in a private report; follow SECURITY.md instead of opening a public PR with exploit details. -->
