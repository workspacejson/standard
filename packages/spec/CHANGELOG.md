# Changelog

All notable changes to `@workspacejson/spec` are documented here.

## Unreleased

## [0.3.0] - 2026-05-22

### Breaking changes
- Schema shape changed to four-property structure: `manual`, `generated`, `agents`, `health`.
- Canonical write path corrected to `.agents/agents.workspace.json` (v0.2.0 incorrectly stated repo root).
- Top-level `version` field removed; schema version now lives at `generated.specVersion = "0.3"`.
- Per-file fragility data lives at `generated.fileIndex.{path}` (not `files.{path}`).
- Framework detection lives at `generated.frameworkManifest`.

### Ecosystem alignment
- Field names match `jnuyens/gsd-plugin v2.42.3` SessionStart read paths (first shipped consumer of `.agents/agents.workspace.json`).

### Added
- `examples/` directory with minimal, populated, and with-manual-block example files.
- `validate()` and `validateLegacy()` exports in `src/index.ts`.

### Migration
Check `generated.specVersion === "0.3"` to detect v0.3 documents. Fall back to v0.1 shape if `specVersion` is absent.

## 0.2.0 - 2026-05-08

### Added

- `generate` subcommand support: the spec now describes the `agents.workspace.json` file
  written by `agents-audit generate`, including the `generatedAt` timestamp field.
- `agentFiles.workspaceJson` field documents the canonical workspace file path as reported
  in the generated snapshot.

### Changed

- Canonical workspace file location is now the repository root (`agents.workspace.json`).
  The legacy path (`.agents/agents.workspace.json`) remains a valid read fallback but
  `generate` no longer creates `.agents/`.
- `version` field accepts any string value; the reference implementation writes `"1"`.

## 0.1.1 - 2026-05-06

### Changed

- Added npm discoverability keywords.

## 0.1.0 - 2026-05-06

### Added

- Initial release: JSON Schema (`schema/v1.json`) and TypeScript types for `agents.workspace.json`.
- Validates `version`, `generatedAt`, `repository`, `topology`, `ciProvider`, `agentFiles`,
  `frameworks`, `conventions`, `packages`, `gitSummary`, and `hygiene` fields.
