# AGENTS.md — `workspacejson/standard`

This repository is the canonical source of the **workspace.json specification**
and its deterministic reference behavior.

## Entry points

```text
packages/spec/src/index.ts     public validation API and schema export
packages/spec/src/cli.ts       `workspacejson-spec` binary
packages/spec/schema/v1.json   THE canonical normative schema — exactly one copy
packages/rules/src/index.ts    rule engine, parser, scanner, validator
packages/rules/src/testing/rule-tester.ts   public `./testing` export
```

## Boundaries

This repository owns contracts, not implementations. Before adding anything, check
[`OWNERSHIP.md`](./OWNERSHIP.md).

- **No producer code.** Generation lives in `workspacejson/cli`.
- **No host integrations.** MCP, Codex and VS Code live in `workspacejson/integrations`.
- **No site rendering.** Documentation assembly lives in `workspacejson/site`.
- **No proprietary references.** `@marcelle-labs/*`, private Vreko source and
  `workspace.vreko.json` are prohibited.
- **Descriptive, never prescriptive.** No enforcement, approval-gate or
  merge-blocking fields.
- **No daemon assumptions.** The committed file must work with nothing running.

`pnpm run check:architecture` enforces all of the above and runs first in CI.

## Do not change without an issue

- the four stable read paths: `manual.fragileFiles`, `manual.coChangePatterns`,
  `generated.fileIndex`, `generated.frameworkManifest`
- schema bytes at `packages/spec/schema/v1.json`
- package names, versions, `bin`, `exports` or `files`
- `types/ambient.d.ts` — adding a declaration there shadows a real package's
  types for the entire workspace. Prefer fixing the import.

## Common commands

```bash
pnpm install
pnpm -r typecheck && pnpm -r build && pnpm -r test
pnpm run check:architecture && pnpm run check:architecture:test
pnpm run check:schema && pnpm run check:examples
pnpm run release:verify-packs
```

## Publication

This repository **cannot publish**. Authority for `@workspacejson/spec` and
`@workspacejson/rules` still belongs to `workspace-json/agents-audit` until
META-243. Do not add an npm secret or a publish step.
