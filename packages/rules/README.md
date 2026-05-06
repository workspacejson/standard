# @workspacejson/rules

[![npm version](https://img.shields.io/npm/v/@workspacejson%2frules.svg)](https://www.npmjs.com/package/@workspacejson/rules)
[![npm downloads](https://img.shields.io/npm/dm/@workspacejson%2frules.svg)](https://www.npmjs.com/package/@workspacejson/rules)

Deterministic rule engine, parser, and repo scanner for `agents-audit`.

This package is published from the `workspace-json/agents-audit` monorepo and depends
on the canonical spec package.

## Install

```bash
pnpm add @workspacejson/rules
```

## Use

```ts
import { AgentsMdParser, RuleEngine, computeHygieneScore } from '@workspacejson/rules';
```

Homepage: https://workspacejson.dev/audit/

Package page: https://www.npmjs.com/package/@workspacejson/rules
