# @workspacejson/spec

JSON Schema and TypeScript types for `workspace.json` v0.4.

This package is published from the `agents-audit` workspace and is the canonical
specification package for the workspace metadata format.

## Install

```bash
pnpm add @workspacejson/spec
```

## API

### Validation

```ts
import { validate, validateV4, validateLegacy, version } from '@workspacejson/spec';

console.log(version); // '0.4.2'

validate(doc);        // true if doc is a valid v0.3 or v0.4 document
validateV4(doc);      // true if doc is a valid v0.4 document
validateLegacy(doc);  // true if doc is a valid v0.1/v0.2 document
```

### Schema object

```ts
import { workspaceJsonSchema } from '@workspacejson/spec';

// workspaceJsonSchema.$id === 'https://www.workspacejson.dev/schema/v1.json'
// workspaceJsonSchema.title === 'workspace.json'
```

### TypeScript types

```ts
import type {
  WorkspaceJsonV3,
  WorkspaceJsonV4,
  CoChangeEntry,
  FragilityEntry,
  FrameworkEntry,
  FileIndexEntry,
  IntelligenceState,
} from '@workspacejson/spec';
```

`WorkspaceJsonV3` describes the v0.3 four-property shape:

```ts
const doc: WorkspaceJsonV3 = {
  manual: {},
  generated: {
    specVersion: '0.3',
    generatedAt: new Date().toISOString(),
    by: { name: 'my-tool', version: '1.0.0' },
    frameworkManifest: [],
    fileIndex: {},
  },
  agents: {},
  health: { intelligenceState: 'INSUFFICIENT_DATA', observationCount: 0, confidence: 0 },
};
```

`WorkspaceJsonV4` extends v0.3 with formally typed co-change and fragility arrays:

```ts
const doc: WorkspaceJsonV4 = {
  manual: {},
  generated: {
    specVersion: '0.4',
    generatedAt: new Date().toISOString(),
    by: { name: 'my-tool', version: '1.0.0' },
    frameworkManifest: [],
    fileIndex: {},
    coChange: [
      { files: ['src/auth.ts', 'src/session.ts'], rate: 0.9, occurrences: 12, generated: false },
      { files: ['pnpm-lock.yaml', 'package.json'], rate: 0.98, occurrences: 200, generated: true },
    ],
    fragility: [
      { file: 'src/auth.ts', changeCount: 34, revertCount: 8, revertRate: 0.24, fragilityScore: 0.82, excluded: false },
    ],
  },
  agents: {},
  health: {
    intelligenceState: 'CONFIDENT',
    observationCount: 1247,
    confidence: 0.87,
    workflowFragility: 0.5,
    codebaseHealth: 0.7,
    changeVolatility: 0.4,
  },
};
```

**Consumer guidance for `coChange`**: filter on `generated: true` to skip tooling-coupled pairs
(lockfiles, package manifests) and surface only real source couplings.

**Consumer guidance for `fragility`**: filter `excluded: false` before ranking. Entries with
`excluded: true` are generated or lock files with `fragilityScore: 0`.

## Producer-conformance contract

`workspace.json` deliberately separates human evidence from generated observations.
Producers preserve `manual` verbatim across regeneration and replace the producer-owned
`generated`, `agents`, and `health` sections. Human annotations for a producer belong under
`manual`; consumers must not rely on generated sections remaining unchanged after a run.

Producers should write only when their material projection changes. Timestamps identify the
last material generation, not merely the last command invocation.

### JSON Schema file

The raw JSON Schema is available via the `./schema` export:

```ts
import schema from '@workspacejson/spec/schema';
// or: import the file directly at packages/spec/schema/v1.json
```

Served at: `https://www.workspacejson.dev/schema/v1.json`

## Contents

- `schema/v1.json` — published JSON Schema (draft-2020-12)
- `src/schema.ts` — TypeScript const mirroring the schema
- `src/types.ts` — TypeScript types for v0.3, v0.4, and legacy v0.1/v0.2
- `src/index.ts` — `validate()`, `validateV4()`, `validateLegacy()`, `version`, type re-exports

## Migration from v0.3 to v0.4

v0.4 adds two always-present arrays to `generated` and formally types three `health` fields.
v0.3 documents remain valid — v0.4 is a strict superset.

```json
{
  "generated": {
    "specVersion": "0.4",
    "coChange": [],
    "fragility": []
  },
  "health": {
    "workflowFragility": 0.5,
    "codebaseHealth": 0.7,
    "changeVolatility": 0.4
  }
}
```

Check `generated.specVersion === "0.4"` or use `validateV4(doc)` before accessing these fields.

## Migration from v0.1/v0.2

v0.3 replaces the flat top-level shape with four required sections:

```json
{
  "manual": {},
  "generated": {
    "specVersion": "0.3",
    "generatedAt": "...",
    "by": { "name": "...", "version": "..." }
  },
  "agents": {},
  "health": {}
}
```

Use `validateLegacy(doc)` to detect v0.1/v0.2 documents; use `validate(doc)` for v0.3/v0.4.
