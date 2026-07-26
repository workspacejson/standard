# @workspacejson/rules

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/workspace-json-lockup-dark.png">
    <img src="../../assets/workspace-json-lockup-light.png" alt="workspace.json — portable repository intelligence" width="520">
  </picture>
</p>

Deterministic parser, scanner, validator and rule engine for consumers of
`.agents/workspace.json`.

This package is the **reference behavior** for the workspace.json
specification — it makes "what the specification means" executable. It is a
reference implementation, not a product, and it depends on
[`@workspacejson/spec`](https://www.npmjs.com/package/@workspacejson/spec) for
the normative schema and types.

Source of truth: [`workspacejson/standard`](https://github.com/workspacejson/standard).

## Install

```bash
npm install @workspacejson/rules
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

| Module | Responsibility |
| -- | -- |
| `src/parser` | Parses `AGENTS.md` |
| `src/scanner` | Walks repository structure |
| `src/validator` | Validates `.agents/workspace.json` |
| `src/engine` | Evaluates deterministic rules |
| `src/testing` | The published test-helper surface |

Public exports are kept stable through `src/index.ts`.

## Writing rule tests

The `./testing` entry point exports a `RuleTester` for authoring tests against
the shipped fixtures:

```ts
import { RuleTester } from '@workspacejson/rules/testing';
```

It re-exports vitest helpers, so it must be imported from inside a vitest run.
Importing it outside one throws about vitest's internal state — that is expected,
not a packaging bug.

## Requirements

Node.js >= 20.

## Further reading

- [Conformance](https://github.com/workspacejson/standard/blob/main/docs/conformance.md)
- [Versioning and compatibility](https://github.com/workspacejson/standard/blob/main/docs/versioning.md)
- [Troubleshooting](https://github.com/workspacejson/standard/blob/main/docs/troubleshooting.md)

## License

[Apache-2.0](./LICENSE).
