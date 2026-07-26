# Changelog — `workspacejson/standard`

This file records repository-level changes. Per-package release notes live with
the packages they describe:

- [`packages/spec/CHANGELOG.md`](./packages/spec/CHANGELOG.md)
- [`packages/rules/CHANGELOG.md`](./packages/rules/CHANGELOG.md)

Both package changelogs were migrated **verbatim** and retain the full historical
release family, including releases published from `workspace-json/agents-audit`.

## Unreleased

### Migrated

- Extracted `@workspacejson/spec` and `@workspacejson/rules` from
  `workspace-json/agents-audit` at frozen source SHA
  `e47eb1b8556c4f361db9a78190a2f36b400756e8`, preserving history for
  standard-owned paths (124 → 98 commits). See
  [`migration/PROVENANCE.md`](./migration/PROVENANCE.md).

- **No package was renamed, version-bumped or published.** Both packages remain
  `0.4.4`, and publication authority remains with `workspace-json/agents-audit`
  until META-243.

### Changed — package metadata (META-201)

- `repository.url` and `bugs.url` now point at `workspacejson/standard`, with a
  `repository.directory` pointer per package.
- `homepage` uses the canonical bare domain `workspacejson.dev`.
- The stale `agents-audit` keyword was removed from both packages.

### Changed — type environment

- `@types/node@22.19.17` is now a declared devDependency of both packages.
  Previously `@workspacejson/spec` compiled with **no** real Node types at all,
  relying entirely on hand-written stubs, while `@workspacejson/rules` obtained
  them accidentally through vitest's transitive resolution.
- `types/ambient.d.ts` was reduced from 23 declarations to 4. Removed: a
  hand-written `declare module '@workspacejson/spec'` that described a stale
  v0.3-only contract and was taking precedence over the real package's types;
  all hand-written `node:*` declarations; and all CLI-only third-party stubs.
  Generated declaration bytes were verified **identical** before and after.

### Added

- `scripts/check-architecture.mjs` — dependency-direction and clean-room guards,
  with deliberate-violation red tests in `scripts/check-architecture.test.mjs`.
- `.github/RELEASE-AUTHORITY.md` — records why this repository ships no release
  workflow, and what META-243 must create.
- `scripts/verify-schema-provenance.mjs` — proves a single canonical schema that
  is exported, packed and complete.
- `scripts/validate-examples.mjs` — every shipped example must validate against
  the package-owned schema.
- Root `LICENSE` (Apache-2.0), copied byte-identically from `packages/spec/LICENSE`.
- `OWNERSHIP.md`.

### Fixed

- `scripts/verify-package-tarball.mjs` now parses the packed manifest. In the
  source it was passed as raw text, which silently disabled
  `assertNoWorkspaceProtocol`, `assertFixedGroupDependencies` and the bin-target
  check. Those assertions now actually run.

## Historical releases

Releases up to and including `0.4.4` were published from
`workspace-json/agents-audit` as a fixed group with `agents-audit`. That group is
now split: `workspacejson/standard` owns `@workspacejson/spec` and
`@workspacejson/rules`; `workspacejson/cli` owns `agents-audit`.
