# Security

If you discover a security issue in `@workspacejson/spec`, `@workspacejson/rules`,
or the workspace.json specification itself, report it privately through
[this repository's security advisory form](https://github.com/workspacejson/standard/security/advisories/new).

Do not open a public issue for a sensitive vulnerability before coordinated
disclosure.

> **Maintainer note — this channel is not live yet.** GitHub private
> vulnerability reporting cannot be enabled while this repository is private on
> its current plan, so the link above does not resolve today. Nobody outside the
> organization can read this file yet either, so no report is currently being
> dropped. **Enabling private vulnerability reporting is a required step of
> making this repository public** — see
> [`docs/repository-settings.md`](./docs/repository-settings.md). This note is
> removed when that is done.

## Supported versions

| Version | Supported |
| -- | -- |
| `0.4.x` | Yes — the current release family |
| `< 0.4` | No |

Both packages are released as a fixed group and always carry the same version.
Fixes are made on the current release family; there is no long-term-support
branch, and claiming one would be inaccurate.

## What to include

- a short summary of the issue
- the affected package, schema path, or API surface
- reproduction steps
- whether the issue affects published packages or only local development
- whether the issue affects the normative schema or only reference behavior

## What not to include

- public issue reports for sensitive vulnerabilities before coordinated disclosure
- secrets, tokens, or private repository data

## Scope

This repository owns the specification, schema, types, validation semantics and
deterministic rules. Issues in repository generation belong to
`workspacejson/cli`; issues in host adapters belong to
`workspacejson/integrations`; issues in the published website belong to
`workspacejson/site`.

## Publication note

`@workspacejson/spec` and `@workspacejson/rules` are currently published from
`workspace-json/agents-audit`. Until that authority transfers, coordinate any
security release with that repository.
