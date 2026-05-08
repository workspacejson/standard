# Contributing

This repository is a workspace for `agents-audit`, `@workspacejson/spec`, and
`@workspacejson/rules`.

## Before You Start

- Read `AGENTS.md` at the repo root
- Keep changes within the owning package when possible
- Avoid changing package entrypoints unless the public surface changes

## Common Commands

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm -r build
node packages/agents-audit/dist/cli.js scan .
```

## Change Expectations

- Update package READMEs when public APIs change
- Update `CHANGELOG.md` for release-facing changes
- Keep the CLI contract documented in `packages/agents-audit/README.md`

## Reporting Issues

File bugs at [GitHub Issues](https://github.com/workspace-json/agents-audit/issues).
For security vulnerabilities, follow the process in [`SECURITY.md`](./SECURITY.md).

