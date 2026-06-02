# @workspacejson/spec

JSON Schema and TypeScript types for `workspace.json` v0.3.

This package is published from the `agents-audit` workspace and is the canonical
specification package for the workspace metadata format.

## Install

```bash
pnpm add @workspacejson/spec
```

## API

### Validation

```ts
import { validate, validateLegacy, version } from '@workspacejson/spec';

console.log(version); // '0.3.0'

validate(doc);        // true if doc is a valid v0.3 document
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
- `src/types.ts` — TypeScript types for v0.3 (and legacy v0.1/v0.2)
- `src/index.ts` — `validate()`, `validateLegacy()`, `version`, type re-exports

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

Use `validateLegacy(doc)` to detect v0.1/v0.2 documents; use `validate(doc)` for v0.3.
