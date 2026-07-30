# @workspacejson/spec

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/workspace-json-lockup-dark.png">
    <img src="../../assets/workspace-json-lockup-light.png" alt="workspace.json — portable repository intelligence" width="520">
  </picture>
</p>

JSON Schema and TypeScript types for `workspace.json` v0.4.

This is the **canonical specification package**. The schema it ships is the
normative one — there is exactly one copy, and downstream repositories
materialize it from this package rather than maintaining their own.

Source of truth: [`workspacejson/standard`](https://github.com/workspacejson/standard).
Publication authority for this package currently sits with the historical
repository it was extracted from; see the repository's release-authority note.

## Install

```bash
npm install @workspacejson/spec
```

## Validate a document

```bash
npx workspacejson-spec validate .agents/workspace.json
```

Exits `0` on a valid document, non-zero otherwise. `validate <file>` is the only
command; there is no `--help` flag, and any other invocation exits non-zero with
usage.

## API

### Validation

```ts
import { validate, validateV4, validateLegacy, version } from '@workspacejson/spec';

console.log(version); // '0.4.4'

validate(doc);        // true if doc is a valid v0.3 or v0.4 document
validateV4(doc);      // true if doc is a valid v0.4 document
validateLegacy(doc);  // true if doc is a valid v0.1/v0.2 document
```

### Schema object

```ts
import { workspaceJsonSchema } from '@workspacejson/spec';

// workspaceJsonSchema.$id === 'https://workspacejson.dev/schema/v1.json'
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
import schema from '@workspacejson/spec/schema' with { type: 'json' };
```

Materialize it from this package and hash-check it. Do not maintain an editable
second copy — that is how copies drift.

The schema declares `$id: https://workspacejson.dev/schema/v1.json` and is
served at that URL. The `www.` host also serves the schema, but the bare domain
is canonical. See [ADR-005](../../docs/adr/005-schema-identity.md)
for the reconciliation record.

The `v1` in the filename is a legacy artifact of the file's original naming, not
a claim that the format is at version 1.0. The current document profile is v0.4.

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

## Requirements

Node.js >= 20.

## Further reading

Full documentation lives in the source repository:

- [Versioning and compatibility](https://github.com/workspacejson/standard/blob/main/docs/versioning.md)
- [Conformance](https://github.com/workspacejson/standard/blob/main/docs/conformance.md)
- [Troubleshooting](https://github.com/workspacejson/standard/blob/main/docs/troubleshooting.md)
- [Glossary](https://github.com/workspacejson/standard/blob/main/docs/glossary.md)

## License

[Apache-2.0](./LICENSE).
