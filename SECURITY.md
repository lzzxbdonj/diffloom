# Security policy

## Scope and maintenance

Diffloom is a static, browser-based JSON comparison workbench. There is no backend, account system, analytics, or document persistence. Only the latest source revision is a maintenance target; there is no promise of backports, a response-time SLA, or a paid support service.

## Report a vulnerability privately

**Do not open a public issue containing an exploit, real credentials, or private JSON.**

If the repository you are using offers GitHub private vulnerability reporting, open its **Security → Advisories → Report a vulnerability** flow. Availability depends on that repository's settings; this project does not assume that a particular hosted repository or contact address exists.

If private reporting is unavailable, ask the repository's maintainers for a private reporting channel using a public message that contains **no vulnerability details or sensitive data**. Do not publish a proof of concept while arranging that channel.

Once a private channel is available, include:

- The affected source revision and browser/operating-system versions.
- A minimal, synthetic reproduction and the relevant comparison/export options.
- Expected and actual behavior, impact, and any suggested mitigation.
- Whether the issue is already public; share reproduction artifacts only if safe.

Coordinate disclosure with the maintainers. No response time or resolution date is guaranteed. For ordinary functional bugs without security impact, use the bug report template instead.

## Security model and limitations

### Browser-local, not a hardened vault

Inputs are held in page memory and reload resets the workspace. The application does not transmit JSON documents. At runtime, the only network activity is loading its own static assets; remote hosting still exposes normal asset requests to that host. There are no required external images, fonts, or tracking badges.

This does not protect against a malicious browser extension, compromised host or asset, modified application build, device malware, shoulder surfing, screenshots, or developer tools. File imports and downloaded exports remain subject to your browser and operating system. Keep sensitive documents off shared or untrusted devices. There is no service worker and no guarantee that a reload works without network access.

### Untrusted JSON is text

Treat JSON values, property names, file names, paths, error messages, and report content as untrusted text. They must not be interpreted as executable HTML or scripts. Imported content is data, not code. An issue that allows active markup or script execution through input or output should be reported privately.

### Resource guards are not a performance guarantee

Each input is limited to **1 MiB of UTF-8 text** and a nesting depth of **128**. These guards reduce accidental oversized workloads but are not a complete denial-of-service defense. Broad documents, large change sets, or constrained devices may still cause slow comparisons or rendering. Never assume that accepted input is cheap to process.

### Numeric precision is bounded

JSON numbers use JavaScript IEEE 754 double precision, not arbitrary precision. Ordinary decimals are accepted but remain subject to JavaScript precision and rounding, so distinct decimal literals can become equal after parsing. The parser rejects non-finite results (such as `1e400`), integer results outside the safe range −9007199254740991 to 9007199254740991, and nonzero numeric literals that underflow to zero. These guards do not make all decimal values exact or turn the comparison into an arbitrary-precision diff. Use JSON strings for long numeric IDs or other identifiers that require exact preservation.

### Export redaction is deliberately limited

The sensitive-value redaction checkbox is enabled by default for Markdown and JSON exports. It recursively masks values under the keys `password`, `token`, `secret`, `api_key`, `apiKey`, `authorization`, `access_token`, and `refresh_token` in exported data.

It is a key-based convenience, **not a comprehensive secret detector or confidentiality guarantee**. Credentials under unexpected names, secrets inside ordinary strings, identifiers in paths, and contextual information can remain visible. It affects exports only: the input editors, on-screen report, and ordinary copy actions retain their contents. Disabling the checkbox can expose recognized sensitive values as well.

Review exported files before sharing, use synthetic data for public reports, and apply your own organization's data-handling requirements. If a credential has been exposed, revoke or rotate it; deleting a report is not sufficient.

## Dependencies and deployment

The browser application has no runtime package dependencies, but development tools and the build supply chain still matter. Use Node.js 22.x (at least 22.12), 24.x, or 26 and newer (`^22.12.0 || ^24.0.0 || >=26.0.0`), matching the development toolchain including Vitest 5. Review dependency and lockfile changes, and install locked versions with `npm ci` in CI. An audit can support review but does not establish that a build is safe.

Serve production assets from a trusted static host, preferably over HTTPS. Keep the build environment and repository access secure. A clean CI run or successful Pages deployment is not a security certification.
