# Gates and staged adoption

## Foundation gate

- [ ] Typecheck, unit/interaction tests and ESM declaration build pass on the final commit.
- [ ] Packed tarball installs in a real separate React app with no source aliases;
      root/core/aria/ark imports resolve; React deduplicates.
- [ ] Package contents contain no credentials, app-specific data, caches or test fixtures.
- [ ] Desktop keyboard/browser + narrow mobile layout reviewed; real Android
      touch/TalkBack remains a separate device gate, not inferred from jsdom.
- [ ] Independent review closes correctness/accessibility findings.
- [ ] Run all checks locally on the exact source snapshot before pushing; record
      the results and verify the remote commit matches that reviewed snapshot.
      GitHub CI jobs/workflows are intentionally not used.

## Consumer migration sequence

1. Keep production behavior, current UI facade, theme and domain boundaries intact.
2. Pin a verified kit artifact. First replace only a small generic import behind
   the existing facade; retain all product-specific controls and public API.
3. Run that consumer's full type/lint/unit/build suite and affected browser flows.
   Cover focus return, repeated/nested overlays, canceled edits, navigation,
   narrow screens, pending/error states and preservation of real versus fixture paths.
4. Migrate the outline consumer's reader model/rendering behind a reversible adapter.
   Preserve richer content types, saved data and read-only default. No raw source
   view by default. Keep app-specific persistence and history outside this package.
5. Submit separate draft migration PRs. Do not merge or deploy from library success.
   Existing Android/release pauses remain in force; migrations do not authorize
   starting Codex tasks, user-computer work, hardware commands or release resumes.

A failed or unverified foundation gate blocks production migrations. Source-level
preparation can continue, but must not be described as a completed app port.

## Public release gate (not authorized here)

Choose and approve a license; audit transitive licenses and notices; remove private
repository references/data; audit history and tarball; approve API/versioning and
security policy; verify package name/registry and dry-run; only then explicitly
approve changing visibility or publication. `private: true` stays until that step.
