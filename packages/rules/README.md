# @workspacejson/rules

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/workspace-json/agents-audit/main/assets/workspace-json-lockup-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/workspace-json/agents-audit/main/assets/workspace-json-lockup-light.png">
    <img src="https://raw.githubusercontent.com/workspace-json/agents-audit/main/assets/workspace-json-lockup-light.png" alt="workspace.json — Portable Repository Intelligence" width="520">
  </picture>
</p>

Deterministic parser, scanner, validator, and rule engine for `agents-audit`
and other consumers of `.agents/workspace.json`.

This package is published from the `agents-audit` workspace and depends on
the published `@workspacejson/spec` package.

## Install

```bash
pnpm add @workspacejson/rules
```

## API

```ts
import {
  AgentsMdParser,
  RepoScanner,
  RuleEngine,
  WorkspaceJsonValidator,
  computeHygieneScore,
} from '@workspacejson/rules';
```

## Contents

- `src/parser` parses `AGENTS.md`
- `src/scanner` walks repository structure
- `src/validator` validates `.agents/workspace.json`
- `src/engine` evaluates deterministic rules
- `src/testing` provides the published test helper surface

## Notes

- This package is the implementation layer for the audit engine
- Public exports are kept stable through `src/index.ts`
