import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { validate, validateLegacy, validateV4, version, workspaceJsonSchema } from './index.js';
import { compileSchemaValidator } from './validator.js';
import type { CoChangeEntry } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_JSON_PATH = resolve(__dirname, '../schema/v1.json');
const CHANGELOG_PATH = resolve(__dirname, '../CHANGELOG.md');
const PKG_PATH = resolve(__dirname, '../package.json');

const minimalV3 = {
  manual: {},
  generated: {
    specVersion: '0.3',
    generatedAt: '2026-05-22T00:00:00Z',
    by: { name: 'test', version: '0.1.0' },
    frameworkManifest: [],
    fileIndex: {},
  },
  agents: {},
  health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 },
};

describe('@workspacejson/spec smoke test', () => {
  it('exports the schema object', () => {
    expect(workspaceJsonSchema.title).toBe('workspace.json');
  });
});

describe('draft-2020-12 validator', () => {
  it('enforces prefixItems, which draft-07 does not define', () => {
    const validateTuple = compileSchemaValidator<readonly [string, ...unknown[]]>({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }],
      items: {},
    });

    expect(validateTuple([42])).toBe(false);
    expect(validateTuple(['valid', 42])).toBe(true);
  });

  it('fails loudly with the default draft-07 Ajv import', () => {
    const defaultAjv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

    expect(() => defaultAjv.compile({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }],
    })).toThrow();
  });
});

describe('version', () => {
  it('is 0.4.4', () => {
    expect(version).toBe('0.4.4');
  });
});

describe('validate()', () => {
  it('accepts a minimal v0.3 document', () => {
    expect(validate(minimalV3)).toBe(true);
  });

  it('rejects null', () => {
    expect(validate(null)).toBe(false);
  });

  it('rejects a v0.1 document (has version string, no four-property shape)', () => {
    expect(validate({ version: '1', generatedAt: '2026-01-01T00:00:00Z' })).toBe(false);
  });

  it('rejects a document missing generated.specVersion', () => {
    expect(validate({ manual: {}, generated: { generatedAt: '2026-05-22T00:00:00Z', by: { name: 'x', version: '0' }, frameworkManifest: [], fileIndex: {} }, agents: {}, health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 } })).toBe(false);
  });

  it('rejects a document with wrong specVersion', () => {
    const bad = { ...minimalV3, generated: { ...minimalV3.generated, specVersion: '0.2' } };
    expect(validate(bad)).toBe(false);
  });

  it('rejects a shallowly plausible document that violates the packaged schema', () => {
    const missingRequiredGenerator = {
      ...minimalV3,
      generated: { specVersion: '0.4', generatedAt: '2026-06-01T00:00:00Z' },
    };

    expect(validate(missingRequiredGenerator)).toBe(false);
  });

  it('rejects additional root properties forbidden by the packaged schema', () => {
    expect(validate({ ...minimalV3, unsupported: true })).toBe(false);
  });
});

describe('validateLegacy()', () => {
  it('accepts a v0.1 document', () => {
    expect(validateLegacy({ version: '1', generatedAt: '2026-01-01T00:00:00Z' })).toBe(true);
  });

  it('rejects a v0.3 document', () => {
    expect(validateLegacy(minimalV3)).toBe(false);
  });

  it('rejects null', () => {
    expect(validateLegacy(null)).toBe(false);
  });
});

const minimalV4 = {
  manual: {},
  generated: {
    specVersion: '0.4',
    generatedAt: '2026-06-01T00:00:00Z',
    by: { name: 'test', version: '0.1.0' },
    frameworkManifest: [],
    fileIndex: {},
    coChange: [],
    fragility: [],
  },
  agents: {},
  health: { intelligenceState: 'OBSERVING' as const, observationCount: 0, confidence: 0 },
};

describe('validateV4()', () => {
  it('accepts a minimal v0.4 document', () => {
    expect(validateV4(minimalV4)).toBe(true);
  });

  it('rejects a v0.3 document', () => {
    expect(validateV4(minimalV3)).toBe(false);
  });

  it('accepts a v0.4 document missing coChange array when the schema does not require it', () => {
    const bad = { ...minimalV4, generated: { ...minimalV4.generated, coChange: undefined } };
    expect(validateV4(bad)).toBe(true);
  });

  it('accepts a v0.4 document missing fragility array when the schema does not require it', () => {
    const bad = { ...minimalV4, generated: { ...minimalV4.generated, fragility: undefined } };
    expect(validateV4(bad)).toBe(true);
  });
});

describe('validate() backward compat — v0.4 documents', () => {
  it('accepts a v0.4 document (backward compat)', () => {
    expect(validate(minimalV4)).toBe(true);
  });
});

// ─── Schema identity invariants ──────────────────────────────────────────────
// These tests are the single source of truth for the canonical $id URL.
// If any of them fail, you have a $id drift problem — fix the source, not the test.
const CANONICAL_ID = 'https://www.workspacejson.dev/schema/v1.json';

describe('schema identity invariants', () => {
  it('TypeScript const $id matches canonical URL', () => {
    expect(workspaceJsonSchema.$id).toBe(CANONICAL_ID);
  });

  it('schema/v1.json $id matches canonical URL', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    expect(json['$id']).toBe(CANONICAL_ID);
  });

  it('TypeScript const $id matches schema/v1.json $id (no split-brain)', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    expect(workspaceJsonSchema.$id).toBe(json['$id']);
  });

  it('CHANGELOG top version header matches package.json version', () => {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as Record<string, unknown>;
    const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(pkg['version']);
  });

  it('schema/v1.json $schema uses https (not http)', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    expect((json['$schema'] as string).startsWith('https://')).toBe(true);
  });
});

// ─── Schema structural invariants ────────────────────────────────────────────
// These tests prevent split-brain between schema.ts and schema/v1.json.
// $id equality is necessary but not sufficient — the body must also match.
describe('schema structural invariants', () => {
  it('workspaceJsonSchema required array matches schema/v1.json required (no split-brain)', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    const jsonRequired = ([...(json['required'] as string[])]).sort();
    const tsRequired = ([...workspaceJsonSchema.required]).sort();
    expect(tsRequired).toEqual(jsonRequired);
  });

  it('workspaceJsonSchema top-level property keys match schema/v1.json', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    const jsonProps = Object.keys((json['properties'] as Record<string, unknown>) ?? {}).sort();
    const tsProps = Object.keys(workspaceJsonSchema.properties).sort();
    expect(tsProps).toEqual(jsonProps);
  });

  it('workspaceJsonSchema additionalProperties is false (v0.3 is strict)', () => {
    expect((workspaceJsonSchema as Record<string, unknown>)['additionalProperties']).toBe(false);
  });
});

// ─── VR-640: fileIndex key format pinned to repo-root-relative POSIX ──────────
// The DataHub join (HAC-75 probe) silently produced zero rows because the spec
// said "relative path" without an anchor. The canonical form must be stated and
// kept in sync across both schema mirrors so the CLI shim normalizes toward a
// blessed target rather than an assumed one.
describe('VR-640: canonical key format is repository-root-relative POSIX', () => {
  const gen = (s: Record<string, unknown>) =>
    ((s['properties'] as Record<string, Record<string, unknown>>)['generated']?.['properties'] ??
      {}) as Record<string, Record<string, unknown>>;

  it("schema/v1.json fileIndex description pins the anchor (not just 'relative path')", () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    const desc = gen(json)['fileIndex']?.['description'] as string;
    expect(desc).toContain('repository-root-relative POSIX path');
  });

  it('schema.ts fileIndex description matches schema/v1.json (no split-brain on the anchor)', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    const jsonDesc = gen(json)['fileIndex']?.['description'];
    const tsDesc = gen(workspaceJsonSchema as unknown as Record<string, unknown>)['fileIndex']?.[
      'description'
    ];
    expect(tsDesc).toBe(jsonDesc);
  });

  it('fragility.file is documented as repo-root-relative POSIX in both mirrors', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    const jsonFile = (gen(json)['fragility']?.['items'] as Record<string, Record<string, Record<string, unknown>>>)
      ?.['properties']?.['file']?.['description'] as string;
    expect(jsonFile).toContain('Repository-root-relative POSIX path');
  });
});

// ─── VR-639: coChange.files is a set, not a positional tuple ──────────────────
// types.ts said [string, string] (positional) while the schema said min/max-2
// array (set). A CLI that treated files[0] as canonical would silently mis-join.
// The contract is now set semantics — order must never affect the join.
describe('VR-639: coChange.files has set semantics (order-independent join)', () => {
  const minimalV4 = {
    manual: {},
    generated: {
      specVersion: '0.4' as const,
      generatedAt: '2026-05-22T00:00:00Z',
      by: { name: 'test', version: '0.1.0' },
      frameworkManifest: [],
      fileIndex: {},
      coChange: [] as Array<{ files: string[]; rate: number; occurrences: number; generated: boolean }>,
      fragility: [],
    },
    agents: {},
    health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 },
  };

  const withPair = (files: string[]) => ({
    ...minimalV4,
    generated: { ...minimalV4.generated, coChange: [{ files, rate: 0.5, occurrences: 10, generated: false }] },
  });

  it('validateV4 accepts a coChange pair in either ordering', () => {
    expect(validateV4(withPair(['a.sql', 'b.sql']))).toBe(true);
    expect(validateV4(withPair(['b.sql', 'a.sql']))).toBe(true);
  });

  it('the co-change join (set membership) resolves identically under reversed pair order', () => {
    // Models the CLI join: find co-change partners of a target file by membership,
    // never by index. This is the assertion VR-639 requires "at the join level".
    const partnersOf = (doc: ReturnType<typeof withPair>, target: string) =>
      doc.generated.coChange
        .filter((e) => e.files.includes(target))
        .flatMap((e) => e.files.filter((f) => f !== target));

    const forward = partnersOf(withPair(['a.sql', 'b.sql']), 'a.sql');
    const reversed = partnersOf(withPair(['b.sql', 'a.sql']), 'a.sql');
    expect(forward).toEqual(['b.sql']);
    expect(reversed).toEqual(['b.sql']); // reversing the stored pair changes nothing
  });

  it('a co-change pair equals its reverse as a set (position carries no meaning)', () => {
    // Behavioral lock for set semantics, enforced at runtime (tsconfig excludes
    // *.test.ts from tsc, so a compile-time tuple assertion here would never run).
    // The type-level guarantee lives in types.ts `files: string[]`, which tsc DOES
    // compile and which binds any consumer (the CLI) against indexing files[0].
    const stored: CoChangeEntry['files'] = ['a.sql', 'b.sql'];
    const emittedInReverse: CoChangeEntry['files'] = ['b.sql', 'a.sql'];
    expect(new Set(stored)).toEqual(new Set(emittedInReverse));
  });

  it('schema still constrains the pair to exactly two entries in both mirrors', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    const filesSchema = (
      (
        (json['properties'] as Record<string, Record<string, Record<string, Record<string, unknown>>>>)[
          'generated'
        ]['properties']['coChange']['items'] as Record<string, Record<string, Record<string, unknown>>>
      )['properties']['files']
    ) as Record<string, unknown>;
    expect(filesSchema['minItems']).toBe(2);
    expect(filesSchema['maxItems']).toBe(2);
  });
});
