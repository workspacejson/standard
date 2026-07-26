# workspace.json — the standard

**workspace.json** is an open specification for committed repository
intelligence. A portable JSON artifact at **`.agents/workspace.json`** combines
producer-generated repository metadata with evidence authored by humans or
specialized tools.

This repository is the **canonical source of the specification** and of the
deterministic reference behavior that interprets it. It is one of four:

| Repository | Owns |
| -- | -- |
| **`workspacejson/standard`** *(this repo)* | specification, JSON Schema, standard types, validation semantics, deterministic rules, compatibility profiles, conformance fixtures, ADRs and governance |
| `workspacejson/cli` | production and generation — the producer, repository scanning, deterministic reconciliation, CLI distribution |
| `workspacejson/integrations` | host adapters — MCP, Codex, VS Code, skills and plugins |
| `workspacejson/site` | assembled, published documentation at `workspacejson.dev` |

Dependency direction is one-way:

```text
workspacejson/standard
        ↓
workspacejson/cli       workspacejson/integrations
        \                    /
              workspacejson/site
```

**This repository depends on none of the other three.** That is enforced
mechanically by `scripts/check-architecture.mjs` in CI, with deliberate
violations tested in `scripts/check-architecture.test.mjs`.

## Packages

| Package | Version | Description |
| -- | -- | -- |
| [`@workspacejson/spec`](./packages/spec) | `0.4.4` | JSON Schema, TypeScript types, validation API, and the `workspacejson-spec` binary |
| [`@workspacejson/rules`](./packages/rules) | `0.4.4` | AGENTS.md parser, repository scanner, workspace.json validator integration, and the deterministic rule engine |

Published versions are **registry-defined**. The versions above describe the
current release family; the registry remains the source of truth.

## Two properties that are load-bearing

**The standard is descriptive, never prescriptive.** `workspace.json` reports
what a repository *is*. It does not encode what a team *must do*. Prescriptive
policy — approval gates, merge blocking, enforcement rules — belongs outside
`workspace.json`, and CI rejects such fields in the schema.

**The committed file must remain useful without a daemon.** `.agents/workspace.json`
is an artifact you can read, diff and review with nothing running. Nothing in the
standard may assume a background process is present.

## Stable read paths

Four paths are externally consumed and are treated as a compatibility surface.
They must remain present and correctly shaped:

```text
manual.fragileFiles
manual.coChangePatterns
generated.fileIndex
generated.frameworkManifest
```

`scripts/check-architecture.mjs` and `scripts/verify-schema-provenance.mjs` both
fail if any of the four is removed or renamed.

## The canonical schema

The normative schema lives at exactly one path in this repository:

```text
packages/spec/schema/v1.json
```

It is shipped inside the `@workspacejson/spec` tarball and resolvable as
`@workspacejson/spec/schema`. Downstream repositories — including the website —
must **materialize** it from a pinned package source and hash-check it, never
maintain an editable second copy. `pnpm run check:schema` prints the canonical
path, byte length and SHA-256 for pinning.

## Development

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

`@workspacejson/rules` depends on `@workspacejson/spec` via `workspace:*`. That
is correct here: both packages live in **this one** pnpm workspace, and `pnpm
pack` rewrites the protocol to the exact version before publication. It is an
intra-repository link, not a cross-repository one. `scripts/verify-package-tarball.mjs`
proves no `workspace:` protocol ever reaches a packed manifest.

## Publication authority

**No package publication authority has transferred to this repository yet.**

`@workspacejson/spec` and `@workspacejson/rules` are still published from
`workspace-json/agents-audit`, which holds the credential. This repository has
no npm secret and **no release workflow at all** — see
[`.github/RELEASE-AUTHORITY.md`](./.github/RELEASE-AUTHORITY.md). Transferring
authority is tracked as META-243 and must revoke the old authority in the same
change.

## Provenance

This repository was extracted from `workspace-json/agents-audit` at frozen
source SHA `e47eb1b8556c4f361db9a78190a2f36b400756e8`, preserving history for
standard-owned paths. See [`migration/PROVENANCE.md`](./migration/PROVENANCE.md)
for the exact command, included and excluded paths, tree hashes, commit map and
rollback reference.

## License

[Apache-2.0](./LICENSE).
