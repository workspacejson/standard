# Changelog

## 0.5.0

### Minor Changes

- 4871663: Deprecate the hygiene score, and stop it certifying scans that observed nothing,
  per ADR-003 amendment A-002.

  `computeHygieneScore([], 0)` returned `{ value: 100, grade: 'A' }`. No findings
  meant no penalty; no penalty meant a full score; a full score meant an A. Nothing
  in the function related the score to how much had been examined — `coverageRatio`
  was computed and returned but never consulted by the scoring path. A scan that
  looked at nothing certified a repository as flawless, and that value reached a
  published artifact.

  **The function now returns `HygieneScore | null`,** and `null` when the scan
  observed nothing: no findings, and no file-count denominator to say anything was
  examined. `null` is not a bad grade. It is the statement that there is no score
  to give, and a reader has to decide what to do about that instead of inheriting
  an `A`. Where evidence exists — any finding, or a known denominator — the
  arithmetic is unchanged.

  **`coverageRatio` is now `number | undefined`.** It was `0` whenever no total was
  supplied, which is every current call site, so that zero was never a measurement
  — it was the default parameter arriving unchanged. "Coverage was not measured"
  and "coverage was zero" are different claims and no longer share a value.

  **Both are source-level breaks for TypeScript readers, which is why this is a
  minor.** Code assigning the result to a bare `HygieneScore`, or `coverageRatio`
  to a bare `number`, stops compiling. That is the intended alarm: it is exactly
  the code that would otherwise read absence as a pass. `AuditResult.score` is
  `HygieneScore | null` for the same reason — a caller handed no evidence needs
  somewhere truthful to put that, and the previous non-nullable field left
  fabricating a perfect score as the only way to satisfy it.

  **`computeHygieneScore`, `HygieneScore` and `AuditResult.score` are deprecated
  and scheduled for removal at the next document-profile boundary.** A letter grade
  is a judgement, and this standard is descriptive: it reports what a repository
  _is_, not what a team must do about it. Scoring belongs to the consumer that
  reads the descriptive fields.

  Migrating needs nothing that is not already public — `Finding.state`,
  `.severity`, `.confidence` and `.temporalWeight` are the only inputs the function
  ever had:

  ```ts
  const failures = findings.filter((f) => f.state === "FAIL");
  const critical = failures.filter((f) => f.severity === "critical");
  ```

  **Nothing is removed in this release and no schema bytes change.** Under ADR-003
  §5 a normative-optional field earns a deprecation notice and a documented
  migration now, with removal at the next declared breaking boundary; the document
  profile is unchanged at `generated.specVersion: "0.4"`, so this release is not
  that boundary. `generated.hygiene` remains declared in the schema, because a
  first-party producer still emits it and removing the declaration while that is
  true would describe the artifact incorrectly. Emission ceases first, on the
  producer's own schedule, and the field and exports go together afterwards.

### Patch Changes

- d0bb585: Remove runtime dependencies that were declared but never imported.

  `@workspacejson/rules` declared `dedent`, `ignore`, `unified` and `zod` in
  `dependencies`. None of them is imported anywhere in the package. `zod` and
  `unified` appeared only as string literals in the framework-detection tables —
  the parser looks for the _word_ "zod" in a manifest, it never loads the library.

  Because these were `dependencies` rather than `devDependencies`, every consumer
  installed all four to run code that does not exist. Removing them changes no
  behavior: the full suite passes unchanged.

  `@workspacejson/spec` drops the unused `json-schema-to-typescript`
  devDependency along with `scripts/generate-types.js`, which read the schema file
  and discarded it. `src/types.ts` is hand-written and committed; nothing was ever
  generated. The build script is now `tsc`.

  A new `unused-dependency` guard in `scripts/check-architecture.mjs` fails the
  build if a declared runtime dependency is never imported, so this cannot
  silently return.

- 05ea429: Widen the validator to accept an optional root `version`, per ADR-004.

  `generated.specVersion` has always been the profile declaration, but at least one
  external reader gates on a **root** `version` key instead. No producer has ever
  emitted it, so that gate has never executed.

  The root object is `additionalProperties: false`, which means repairing the
  mismatch is not the additive change it appears to be: adding a root key is
  additive to the schema as a document and breaking for every already-deployed
  validator. Acceptance therefore has to ship before emission, and this release is
  the acceptance half.

  `validate()` and `validateV4()` now accept an optional root `version` of `"0.3"`
  or `"0.4"`. When present it must equal `generated.specVersion` — a document whose
  two declarations disagree is invalid, not resolved by precedence. No new profile
  name is introduced and `generated.specVersion` is unchanged: still required,
  still primary, still emitted. A reader that ignores the root key sees no
  difference.

  `validateLegacy()` is corrected as a consequence. It previously identified the
  pre-v0.3 shape as "has a root `version` string and fails `validate()`", which
  stops being sufficient once v0.3/v0.4 documents may carry that key: a disagreeing
  document would have been reported as legacy v0.1/v0.2 rather than rejected. It
  now keys on the absence of `generated.specVersion`, so a disagreement is rejected
  by both functions.

  **This release does not emit the field.** No producer writes a root `version`,
  and ADR-004 §8 requires evidence that known validate-before-read consumers accept
  it before any producer begins. Widening what a reader accepts is deliberately not
  permission to start writing.

- 8e5bf70: Correct the published package metadata to name this repository, and record the
  README and changelog corrections that ship inside the tarball.

  Both manifests still described the packages as they were published from the
  frozen historical workspace. None of it was reachable: `repository.url` and
  `bugs.url` pointed at a repository that no longer exists under that name, so
  every "open an issue" and "view source" link on both npm pages led nowhere.

  `repository` now names this repository and carries a `directory` pointer, so npm
  resolves each package to its own subtree rather than the monorepo root. `bugs`
  follows it. `homepage` is the bare canonical host on both packages, per ADR-005 —
  `@workspacejson/rules` additionally pointed at a `/audit/` subpath that predates
  the neutral naming and no longer describes what the package is.

  `author` reads `workspacejson contributors` on both, matching the org that now
  holds them.

  Two keywords were removed. `agents-audit` named the historical package rather
  than these; `aaif` implied a standards-body status this project does not hold.

  `@workspacejson/rules` has a new `description`. The old one described a narrower
  package — AGENTS.md hygiene auditing — than the one that actually ships, which
  carries the parser, repository scanner, validator and rule engine.

  **Why a metadata-only change gets a changeset at all.** `README.md` and
  `CHANGELOG.md` are both listed in `files`, so they are published bytes, not
  repository furniture. Both package READMEs claimed to be published from the
  historical workspace and loaded their brand assets from a frozen repository;
  both changelogs recorded 0.4.4 as unreleased while the registry had already
  served it. Those corrections reached consumers with no release note explaining
  why the page changed. The manifest fields above are in the same position: they
  are part of the published artifact even though no runtime behavior moves.

  Nothing in either package's runtime, types, schema or exports changes. `patch`
  is correct on its own terms; the fixed group is taking a `minor` this release
  for reasons recorded in the accompanying changesets, and this rides along.

- Updated dependencies [d0bb585]
- Updated dependencies [bd14f39]
- Updated dependencies [7739260]
- Updated dependencies [27475a2]
- Updated dependencies [05ea429]
- Updated dependencies [8e5bf70]
- Updated dependencies [8e08c8c]
  - @workspacejson/spec@0.5.0

## [0.4.4] - 2026-07-23

### Patch Changes

- Updated dependency: `@workspacejson/spec@0.4.4`.

## [0.4.3] - 2026-07-17

### Patch Changes

- Fix the `agents-audit` CLI entry-point guard so it fires when invoked through npm's `.bin` symlink (`npx agents-audit`, `npm exec agents-audit`). The guard previously compared `resolve(process.argv[1])` against the resolved module URL, which never matched through a symlink — every subcommand (`generate`, `scan`) silently no-op'd and exited 0 instead of running. It now compares real paths via `realpathSync`.

  Also hardens `scripts/verify-package-tarball.mjs` for `agents-audit`: after packing and installing the tarball fresh, it now runs `npx agents-audit generate` and asserts `.agents/workspace.json` actually exists and parses, rather than trusting a clean exit code.

- Updated dependencies
  - @workspacejson/spec@0.4.3

## 0.4.2

### Patch Changes

- Ship strict schema-backed validation, producer-safe generation, and package tarball release guards.
- Updated dependencies
  - @workspacejson/spec@0.4.2

All notable changes to `@workspacejson/rules` are documented here.

## [0.4.1] - 2026-06-02

### Changed

- Canonical workspace file path updated from `.agents/agents.workspace.json` to
  `.agents/workspace.json` throughout rule context and validator references.
- Package description and keywords updated to remove stale filename references.
- `@workspacejson/spec` dependency updated to `0.4.1`.

## [0.3.0] - 2026-05-12

### Changed

- Version bump to align with `@workspacejson/spec@0.3.0` monorepo restructure.
  No rule logic changes; versioned together for consistent consumer installation.

## [0.2.1] - 2026-05-10

### Changed

- Republish against `@workspacejson/spec@0.2.1` so the package metadata and dependency line
  reflect the standalone spec repo.

## [0.2.0] - 2026-05-08

### Added

- Five-state finding system: findings now carry `FAIL`, `WARN`, `PASS`, `SKIP`,
  `INSUFFICIENT_DATA`, or `PREVIEW` state, replacing the previous binary pass/fail model.
- `RulePack` and `Preset` interfaces with three built-in presets: `default`, `strict`, and `ci`.
- `RuleTester` v2 with five-state assertions and preview support; exported from
  `@workspacejson/rules/testing`.
- Four new rules: `churn-fragility`, `blast-radius`, `rule-coverage-gap`,
  and `review-time-anomaly`.
- `temporal-decay` module: findings carry a `temporalWeight` derived from recency.
- `IncrementalCache` module for partial result reuse across rule runs.
- `RuleDependencyGraph` and `FindingGraphImpl` for declaring and resolving rule prerequisites.
- `integrity` added as a valid `RuleCategory`.
- `isActionable(finding)` predicate exported from the public index.

### Changed

- **Breaking:** `Rule.evaluate` now returns `Promise<Finding[]>`. The previous
  `Promise<Finding | Finding[]>` union is removed. Custom rule implementations must
  always return an array.
- `HygieneScore` uses v0.2 five-state scoring: penalty accumulates from `FAIL` and `WARN`
  findings in a single pass over findings.
- `RuleTester.buildContext` respects per-test `ctx.config` overrides.
- `configSchema` is now a JSON Schema descriptor object, not a Zod schema.
- `blast-radius` uses import-statement regex matching to reduce false positives.
- `rule-coverage-gap` declares prerequisites and clamps `gapRatio` to `[0, 1]`.
- `RuleEngine.run` wraps `topologicalOrder` in a try/catch and clears all setTimeout
  handles on exit.

### Fixed

- `missing-file-reference` now emits `PASS` when all file references resolve (was
  silently emitting nothing).
- `https://` URL check no longer produces false-positive `FAIL` findings.
- `commitsBetween` used for activity window in `review-time-anomaly` (was incorrectly
  using global `recentCommits`).
- `staleness` and `consistency` rules return `PASS` when prerequisite gates are not met
  rather than emitting no finding.
- `IncrementalCache` removed from public index export until wired into `RuleEngine`.
- `checkFilenameCase` glob expanded to cover monorepo package source directories.

## [0.1.1] - 2026-05-06

### Changed

- Added npm discoverability keywords.

## [0.1.0] - 2026-05-06

### Added

- Initial release: `Rule`, `Finding`, `HygieneScore`, `RuleEngine`, and `RuleTester` v1.
- Built-in rules: `staleness`, `consistency`, `missing-file-reference`, `pattern-zero-match`.
