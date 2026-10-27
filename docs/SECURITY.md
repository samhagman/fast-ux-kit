# Security boundaries

- This package does not authenticate users or authorize storage writes. Enforce
  permissions at the server/persistence boundary even when reader mode is enabled.
- Content renderers are trusted application code. A React component registry is
  not a sandbox; imported documents cannot register code or import modules.
- Markdown is rendered without raw HTML execution. Never add an unsafe URL
  transform, raw HTML plugin, eval/MDX compiler or unreviewed iframe privileges.
- External media can reveal network metadata. Consumer media policy controls
  loading; offline/blocked media needs a readable fallback, not an implicit retry.
- Keep credentials, personal documents and production fixtures out of test data.
  Use synthetic fixtures and audit both repository history and package contents.
- Dependency audit is a point-in-time signal, not proof of security. Review source,
  lockfile, licenses and relevant advisory updates before release.
- Report suspected issues privately to the repository owner; do not include secrets
  or personal content in a public issue when the project becomes public.

## Initial dependency evidence

A local `npm audit --omit=dev` completed with zero reported vulnerabilities on
2026-10-27 for the then-current lockfile; this was not rerun on the final snapshot.
A later local lockfile metadata inspection found all 295 dependency entries had
license metadata (MIT, MIT-0, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD).
Re-run the audit and review actual license texts before public release; metadata
and this count are not a legal clearance or permanent security guarantee.
