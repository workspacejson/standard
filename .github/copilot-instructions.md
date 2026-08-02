# Copilot instructions for workspacejson/standard

Read `AGENTS.md`, `OWNERSHIP.md`, and `GOVERNANCE.md` before proposing or modifying code.

This repository is the canonical source of the workspace.json specification, JSON Schema, standard types, validation semantics, deterministic reference rules, compatibility profiles, conformance fixtures, ADRs, and governance.

## Repository boundaries

- Define contracts and deterministic reference behavior here.
- Producer and generation orchestration belong in `workspacejson/cli`.
- MCP, Codex, editor, and other host integrations belong in `workspacejson/integrations`.
- Site rendering and assembled documentation belong in `workspacejson/site`.
- Never import `@marcelle-labs/*`, private Vreko source, or depend on `workspace.vreko.json`.
- The standard is descriptive, never prescriptive.
- The committed `.agents/workspace.json` must remain useful without a daemon.

## Authority and evidence

- `packages/spec/schema/v1.json` is the only normative schema.
- Treat an ADR as authority only when its file exists in `docs/adr/` and its status is `Accepted`.
- Never infer public authority from an issue tracker, branch, comment, or unpublished plan.
- Preserve the four stable read paths:
  - `manual.fragileFiles`
  - `manual.coChangePatterns`
  - `generated.fileIndex`
  - `generated.frameworkManifest`
- Report absence as absence, never as safety or a negative finding.
- A metric must change when its referent changes. Do not present constants or unobserved values as measurements.
- Do not claim validation that was not run. Report exact commands and X/Y results when available.

## Development

Use Node 20 or 22 and pnpm 9.

On a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm run check:architecture
pnpm run check:architecture:test
pnpm run check:docs
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run release:verify-packs
pnpm run check:schema
pnpm run check:examples
```

Build before recursive typechecking because `@workspacejson/rules` consumes emitted declarations from `@workspacejson/spec`.

Run the narrowest relevant tests while developing, then the applicable repository gates before declaring completion.
