# Changelog — `workspacejson/standard`

This file records repository-level changes. Per-package release notes live with
the packages they describe:

- [`packages/spec/CHANGELOG.md`](./packages/spec/CHANGELOG.md)
- [`packages/rules/CHANGELOG.md`](./packages/rules/CHANGELOG.md)

Both package changelogs were migrated **verbatim** and retain the full historical
release family, including releases published from `workspace-json/agents-audit`.

## Unreleased

### Added — public readiness

- Community and governance files: `SUPPORT.md`, `GOVERNANCE.md`,
  `MAINTAINERS.md`, `.github/CODEOWNERS` and `.github/ISSUE_TEMPLATE/config.yml`.
  Each states a real process and a real owner rather than adding ceremony.
- `docs/adr/` — the architecture decision records now live in this repository
  instead of only in a private tracker. ADR-001 records the canonical artifact
  path decision that shipped in `0.4.1` and had never been written down anywhere;
  ADR-002 is transcribed from its internal draft with private references removed.
- `docs/versioning.md`, `docs/conformance.md`, `docs/glossary.md`,
  `docs/troubleshooting.md` and `docs/repository-settings.md`.
- `scripts/check-docs.mjs` and `pnpm run check:docs`, wired into CI: every
  relative link must resolve, every documented `pnpm run` command must exist, and
  no internal tracker identifier may appear in public prose.
- `.editorconfig`, `.gitattributes` and `.github/dependabot.yml`.
- `assets/` — the brand lockups are vendored here instead of loaded from the
  historical repository.

### Changed — public surface

- Internal tracker identifiers were removed from public prose across the README,
  `OWNERSHIP.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.github/RELEASE-AUTHORITY.md`,
  the guard scripts, the CI comments and two package test descriptions. Every
  explanation was kept; only the unresolvable identifiers were replaced.
  `migration/` and `docs/adr/` remain exempt as provenance records.
- The README gained a status statement, a quickstart, a documentation map and a
  known-limitations section.
- Both issue templates were rewritten — they still described `agents-audit` — and
  now route out-of-scope reports to the correct repository.
- Package READMEs no longer describe themselves as published from the
  `agents-audit` workspace.
- `ci.yml` declares least-privilege `permissions: contents: read` at both
  workflow and job level, and cancels superseded non-`main` runs.
- The `aaif` keyword was removed from both packages: it implied a standards-body
  status the project does not hold.
- `@workspacejson/rules` description and `homepage` now describe reference
  behavior rather than the audit product.
- `author` on both packages reads `workspacejson contributors`, not the former
  hyphenated organization name.

### Fixed

- Both package changelogs recorded `0.4.4` as `Unreleased` while npm had
  published it on 2026-07-23. The registry is the arbiter; the dates are now
  correct.

### Deliberately not changed

The schema `$id` host, the `v1.json` filename, package versions, the
`version`/`specVersion` dual-emit work, the four ambient interop shims,
publication capability and repository visibility. Each changes a contract or
requires an authority this pass does not hold.

## Migration

### Migrated

- Extracted `@workspacejson/spec` and `@workspacejson/rules` from
  `workspace-json/agents-audit` at frozen source SHA
  `e47eb1b8556c4f361db9a78190a2f36b400756e8`, preserving history for
  standard-owned paths (124 → 98 commits). See
  [`migration/PROVENANCE.md`](./migration/PROVENANCE.md).

- **No package was renamed, version-bumped or published.** Both packages remain
  `0.4.4`, and publication authority remains with `workspace-json/agents-audit`
  until a coordinated cutover.

### Changed — package metadata

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
  workflow, and what an authority transfer must create.
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
