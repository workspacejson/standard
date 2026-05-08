# Changelog

All notable changes to `@workspacejson/spec` are documented here.

## Unreleased

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
