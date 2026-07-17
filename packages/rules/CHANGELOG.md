# Changelog

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
