# Release checks

## Validate the final snapshot

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:consumer
npm --prefix studio test
npm run docs:build
```

Run validation locally and record the results in the draft PR. The tested source
snapshot must match the commit pushed for review.

## Review the deliverable

- Verify the 86-family catalog and all three tools through the gallery and browser
  acceptance checks in COMPONENT_COVERAGE.md.
- Install the packed tarball in an independent React app. Verify public entries,
  declarations, compiled styles, fonts, hydration and a single React instance.
- Audit tracked files, history, package contents and static assets for credentials,
  private data, local paths, research notes and unintended files.
- Review direct and transitive dependency licenses against the final lockfile.
  Preserve required copyright notices, source availability and license texts.
- Verify LICENSE.md, CONTRIBUTING.md and the commercial contact link. Confirm
  package name, version, registry and access before publication.
- Keep application credentials, notebook content and deployment configuration in
  their owning application's private storage.

## Publish deliberately

Prepare a reviewed version and its exact tarball. Visibility changes, npm
publication and deployed websites are distinct actions with their own intended
audiences. Apply the approved action only after its checks complete.

A consumer application should pin the verified package version or artifact and
run its own unit, build and interaction checks. Persistence, authorization,
transport and application-specific behavior remain consumer responsibilities.
