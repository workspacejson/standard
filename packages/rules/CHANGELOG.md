# Changelog

All notable changes to `@workspacejson/rules` are documented here.

## Unreleased

## 0.2.0 - 2026-05-08

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

## 0.1.1 - 2026-05-06

### Changed

- Added npm discoverability keywords.

## 0.1.0 - 2026-05-06

### Added

- Initial release: `Rule`, `Finding`, `HygieneScore`, `RuleEngine`, and `RuleTester` v1.
- Built-in rules: `staleness`, `consistency`, `missing-file-reference`, `pattern-zero-match`.