# Changelog

## [0.4.2] - 2026-07-16

### Added

- `workspacejson-spec validate <file>`, exposed through `npx @workspacejson/spec`.

### Changed

- `validate()` now enforces the packaged JSON Schema; schema-invalid documents now return `false`.
- `validateV4()` follows the schema's optional v0.4 `coChange` and `fragility` fields.
- Packaged schema annotations use the current Buildomator implementation name.
- Package tarball verification now requires the runtime schema and concrete fixed-group
  dependency versions before publish.

## [0.4.1] - 2026-06-02

### Changed

- Canonical file renamed from `agents.workspace.json` to `workspace.json`, stored at
  `.agents/workspace.json`. The previous name was redundant once the directory provided
  the namespace context. Generators should write to `.agents/workspace.json`; the legacy
  path `.agents/agents.workspace.json` remains a valid read fallback.
- Schema `title` updated from `"agents.workspace.json"` to `"workspace.json"`.

### Fixed

- `coChange` entries now always include `occurrences`. The reference emitter
  (Vreko daemon v3) was stripping this field in the initial v0.4.0 cut.
- `fragility` entries now always include `changeCount` and `revertCount`. Same
  emitter gap — both fields are defined by the spec and present in the underlying
  git scan data but were dropped before serialization.

## [0.4.0] - 2026-06-01

### Added

- `generated.coChange` — machine-derived co-change pairs array. Each entry carries
  `files: [string, string]`, `rate: number`, `occurrences: number`, and
  `generated: boolean`. The `generated` flag distinguishes tooling-coupled pairs
  (e.g. lockfile + package.json) from real source couplings; consumers should filter
  on this flag rather than applying path heuristics at read time.
- `generated.fragility` — per-file fragility array derived from git history. Each entry
  carries `file`, `changeCount`, `revertCount`, `revertRate`, `fragilityScore` (0-1),
  and `excluded`. Entries with `excluded: true` are generated/lock files skipped in
  analysis.
- `health.workflowFragility`, `health.codebaseHealth`, `health.changeVolatility` — three
  aggregate health scores (0-1) formally typed in v0.4. These have been emitted by
  the Vreko daemon since the v0.3 bootstrap path; v0.4 promotes them from the
  `additionalProperties: true` escape hatch to first-class typed fields.
- `validateV4()` export — type guard for v0.4 documents (requires `specVersion === "0.4"`,
  `coChange` array, `fragility` array).
- `examples/populated-v0.4.json` — complete example showing all new v0.4 fields.

### Changed

- `specVersion` JSON Schema constraint widened from `{ const: "0.3" }` to
  `{ enum: ["0.3", "0.4"] }` — v0.3 documents remain valid.
- `validate()` now accepts both `"0.3"` and `"0.4"` documents (additive, not breaking).
- Package version bumped to `0.4.0`.

### Compatibility

v0.3 consumers are unaffected. The new fields fall outside the v0.3 required set and
`generated.additionalProperties: true` was already present. Upgrade path:
check `generated.specVersion === "0.4"` or use `validateV4()` before accessing
`coChange`, `fragility`, or the new health fields.

## Unreleased

## [0.3.0] - 2026-05-12

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
