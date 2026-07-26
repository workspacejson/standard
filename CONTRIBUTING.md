# Contributing

This repository is the canonical source of the **workspace.json specification**
and its deterministic reference behavior. It publishes `@workspacejson/spec` and
`@workspacejson/rules`.

## Before you start

- Read [`OWNERSHIP.md`](./OWNERSHIP.md) — it states what belongs here and what
  belongs in `workspacejson/cli`, `workspacejson/integrations` or
  `workspacejson/site`.
- Read [`AGENTS.md`](./AGENTS.md) for entry points and the "do not change
  without an issue" list.
- Keep changes within the owning package where possible.
- Avoid changing package entry points unless the public surface changes.

## Common commands

```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test

pnpm run check:architecture        # dependency direction + clean-room guards
pnpm run check:architecture:test   # deliberate violations must be rejected
pnpm run check:schema              # canonical schema provenance
pnpm run check:examples            # every shipped example must validate
pnpm run release:verify-packs      # packed tarball gates
```

## Changes that need extra care

**The schema.** `packages/spec/schema/v1.json` is normative and is the single
canonical copy. Changing its bytes changes the contract for every consumer.

**The four stable read paths.** `manual.fragileFiles`, `manual.coChangePatterns`,
`generated.fileIndex` and `generated.frameworkManifest` are externally consumed.
CI fails if any is removed or renamed.

**`types/ambient.d.ts`.** An ambient `declare module` shadows a package's real
types across the whole workspace. This repository previously carried a stale
duplicate of its own `@workspacejson/spec` contract that silently won over the
published types. Prefer fixing the import; if you must add a declaration,
document why in the file.

**Descriptive, not prescriptive.** The standard describes what a repository is.
It never encodes what a team must do, and never assumes a daemon is running.

## Change expectations

- Update package READMEs when public APIs change.
- Add a changeset for release-facing changes.
- Update `CHANGELOG.md` for repository-level changes.

## Publication

This repository is currently **incapable of publishing** and that is deliberate.
Authority for both packages still belongs to `workspace-json/agents-audit` until
the coordinated cutover. Do not add an npm secret, a publish step, or a release
workflow. See [`.github/RELEASE-AUTHORITY.md`](./.github/RELEASE-AUTHORITY.md).

## Reporting issues

File bugs at [GitHub Issues](https://github.com/workspacejson/standard/issues).
For security vulnerabilities, follow [`SECURITY.md`](./SECURITY.md).
