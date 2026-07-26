# Ownership — `workspacejson/standard`

This document states what this repository owns, what it may consume, and what it
must never define. It is enforced by `scripts/check-architecture.mjs` in CI, not
merely asserted here.

## Owns

- the normative JSON Schema and the TypeScript types generated from it
- validation semantics, including legacy validation behavior
- deterministic rules and reference behavior — parser, scanner, rule engine
- compatibility profiles and the stable read-path contract
- conformance fixtures and executable examples
- ADRs and governance for the specification

## Publishes

| Package | Registry state |
| -- | -- |
| `@workspacejson/spec` | published — **authority still held by `workspace-json/agents-audit`** |
| `@workspacejson/rules` | published — **authority still held by `workspace-json/agents-audit`** |

This repository is currently **incapable** of publishing: it has no npm secret
and ships no release workflow. See
[`.github/RELEASE-AUTHORITY.md`](./.github/RELEASE-AUTHORITY.md), which records
what a coordinated authority transfer must do.

## Consumes

- no implementation-repository internals
- no `workspacejson/cli`, `workspacejson/integrations` or `workspacejson/site` code
- no `@marcelle-labs/*` package, no private Vreko source, no `workspace.vreko.json`

`@workspacejson/rules` depends on `@workspacejson/spec` through the shared pnpm
workspace. Both packages are owned and released here, so this is an
intra-repository link — not a cross-repository dependency — and `pnpm pack`
rewrites it to an exact version before publication.

## Must never define

- producer or generation orchestration — that is `workspacejson/cli`
- host integrations (MCP, Codex, VS Code) — that is `workspacejson/integrations`
- site rendering or documentation assembly — that is `workspacejson/site`
- private Vreko behavior or any proprietary sidecar
- **prescriptive policy** — enforcement rules, approval gates, merge blocking.
  The standard describes what a repository is; it does not dictate what a team
  must do.
- **daemon assumptions** — the committed `.agents/workspace.json` must remain
  useful with nothing running.

## Dependency direction

```text
workspacejson/standard      <- depends on NONE of the others
        ↓
workspacejson/cli       workspacejson/integrations
        \                    /
              workspacejson/site
```

Proprietary repositories may consume released Apache-2.0 `@workspacejson/*`
packages. The reverse direction is prohibited.

## Migration provenance

| Field | Value |
| -- | -- |
| Source repository | `workspace-json/agents-audit` |
| Frozen source SHA | `e47eb1b8556c4f361db9a78190a2f36b400756e8` |
| Extraction method | `git filter-repo` path filter, history preserved |
| Rollback ref | `workspace-json/agents-audit@e47eb1b8556c4f361db9a78190a2f36b400756e8` |

Full detail — including the governing issue identifiers, tree hashes, commit map
and intentional differences — is in
[`migration/PROVENANCE.md`](./migration/PROVENANCE.md).

The historical repository remains unmodified and remains the publication
authority until the coordinated cutover completes.
