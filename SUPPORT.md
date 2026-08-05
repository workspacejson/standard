# Support

This repository is the canonical source of the **workspace.json specification**
and its deterministic reference behavior. It publishes
[`@workspacejson/spec`](./packages/spec) and [`@workspacejson/rules`](./packages/rules).

There is no paid support channel and no service-level commitment. What follows is
the honest description of what you can expect.

## Where to ask

| You want to | Go to |
| -- | -- |
| Report a bug in the schema, types, validation or rule engine | [GitHub Issues](https://github.com/workspacejson/standard/issues) — bug report form |
| Propose a specification or API change | [GitHub Issues](https://github.com/workspacejson/standard/issues) — feature request form |
| Report a security vulnerability | [`SECURITY.md`](./SECURITY.md) — **not** a public issue |
| Understand what belongs here versus elsewhere | [`OWNERSHIP.md`](./OWNERSHIP.md) |
| Understand how decisions get made | [`GOVERNANCE.md`](./GOVERNANCE.md) |
| Fix something yourself | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |

Discussions are not enabled. Issues are the single intake channel, which keeps
every question answerable in one place.

## This is the wrong repository for

Ownership boundaries are enforced mechanically here, so filing in the wrong place
costs you a round trip:

| Symptom | Correct repository |
| -- | -- |
| `.agents/workspace.json` is not generated, or generated wrongly | `workspacejson/cli` |
| A repository scan produced bad or missing data | `workspacejson/cli` |
| MCP, Codex or VS Code integration misbehaves | `workspacejson/integrations` |
| Documentation on `workspacejson.dev` is wrong or stale | `workspacejson/workspacejson.dev` |

If a validation error is *reported by* a producer but the schema itself is wrong,
it belongs here. When in doubt, file here and it will be redirected.

## Before you file

These four commands resolve most reports without an issue:

```bash
pnpm install
pnpm -r build            # build precedes typecheck — see CONTRIBUTING.md
pnpm run check:schema    # prints the canonical schema path, byte length and SHA-256
pnpm run check:examples  # validates every shipped example against that schema
```

[`docs/troubleshooting.md`](./docs/troubleshooting.md) covers the failure modes
that come up most often, including the build-before-typecheck ordering and
`workspace:` protocol questions.

## What to include

- the package and version, from `npm ls @workspacejson/spec @workspacejson/rules`
- your Node version — the packages declare `node >=20`
- the smallest `workspace.json` document that reproduces the problem
- the exact command and its complete output

## Response expectations

This project is maintained by a small number of people, listed in
[`MAINTAINERS.md`](./MAINTAINERS.md), alongside other work. Issues are read;
they are not guaranteed a fixed response time. Security reports are prioritized
over everything else.

Stating that plainly is more useful than a service-level promise nobody is
staffed to keep.
