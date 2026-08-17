import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { validate, validateLegacy, validateV4, version, workspaceJsonSchema } from './index.js';
import { compileSchemaValidator } from './validator.js';
import type { CoChangeEntry } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_JSON_PATH = resolve(__dirname, '../schema/v1.json');
const EXAMPLES_DIR = resolve(__dirname, '../examples');
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
  // Parity with the manifest, NOT a literal. The literal used to be duplicated
  // in `src/index.ts` and asserted here, so the pair only held while someone
  // remembered to hand-edit both during a release — and Changesets never
  // rewrites a constant in source. The first release to move the number would
  // have shipped a package reporting the old version, or gone red on a string
  // nobody updated.
  it('matches the packaged manifest', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as { version: string };
    expect(version).toBe(pkg.version);
  });

  it('is a semver string, so the derivation cannot silently yield undefined', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
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

// A 40-character lowercase hex object name. `generated.coChange` may not be
// present without one — see the A-009 fixtures below.
const BASIS = '3c9a0f14b7e25d8613af04c2e9b7d5081f6a2c3d';

const minimalV4 = {
  manual: {},
  generated: {
    specVersion: '0.4',
    generatedAt: '2026-06-01T00:00:00Z',
    basisRevision: BASIS,
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

// ─── ADR-004: optional root `version` transition fixtures ────────────────────
// The six cases ADR-004 §7 requires before the profile may be published, plus
// the perturbation pair that turns the §2 equality invariant into a test rather
// than prose.
//
// Acceptance only. No producer in this repository emits a root `version`, and
// ADR-004 §8 sequences emission behind adoption — widening what a reader accepts
// is deliberately not permission to start writing the field.
describe('ADR-004 root `version` — acceptance transition fixtures', () => {
  const withRoot = <T extends object>(doc: T, version: string) => ({ version, ...doc });

  it('§3 root absent, specVersion present — the pre-existing shape stays valid', () => {
    expect(validate(minimalV3)).toBe(true);
    expect(validate(minimalV4)).toBe(true);
  });

  it('§3 both present and equal — the new shape validates', () => {
    expect(validate(withRoot(minimalV3, '0.3'))).toBe(true);
    expect(validate(withRoot(minimalV4, '0.4'))).toBe(true);
  });

  it('§4 both present and disagreeing — rejected, never silently reconciled', () => {
    expect(validate(withRoot(minimalV3, '0.4'))).toBe(false);
    expect(validate(withRoot(minimalV4, '0.3'))).toBe(false);
  });

  it('§5 root present, specVersion absent — rejected; specVersion stays required', () => {
    const { specVersion: _dropped, ...generatedWithoutSpecVersion } = minimalV4.generated;
    expect(validate({ ...minimalV4, version: '0.4', generated: generatedWithoutSpecVersion })).toBe(false);
  });

  it('§3 neither present — rejected; do not guess at the shape', () => {
    const { specVersion: _dropped, ...generatedWithoutSpecVersion } = minimalV4.generated;
    expect(validate({ ...minimalV4, generated: generatedWithoutSpecVersion })).toBe(false);
  });

  it('§1 root value outside the enum is rejected, including the 1.0 boundary of §9', () => {
    expect(validate(withRoot(minimalV4, '0.2'))).toBe(false);
    expect(validate(withRoot(minimalV4, '1.0'))).toBe(false);
    expect(validate(withRoot(minimalV4, '0.4.4'))).toBe(false);
  });

  it('§2 perturbation pair — moving specVersion alone breaks the document', () => {
    // Both keys move together: valid. Only one moves: invalid. This is what
    // makes the equality invariant mechanically checkable rather than advisory.
    const bothAt3 = { ...withRoot(minimalV3, '0.3') };
    const bothAt4 = { ...withRoot(minimalV4, '0.4') };
    expect(validate(bothAt3)).toBe(true);
    expect(validate(bothAt4)).toBe(true);

    const onlySpecVersionMoved = {
      ...withRoot(minimalV3, '0.3'),
      generated: { ...minimalV3.generated, specVersion: '0.4' },
    };
    const onlyRootMoved = { ...withRoot(minimalV3, '0.4') };
    expect(validate(onlySpecVersionMoved)).toBe(false);
    expect(validate(onlyRootMoved)).toBe(false);
  });

  it('validateV4 accepts the mirrored v0.4 shape and still rejects v0.3', () => {
    expect(validateV4(withRoot(minimalV4, '0.4'))).toBe(true);
    expect(validateV4(withRoot(minimalV3, '0.3'))).toBe(false);
  });

  it('the root key is optional, so widening changes no existing document outcome', () => {
    // ADR-004 §8 step 1: no document in existence carries the key, so publishing
    // the widened validator changes no validation result. This is the assertion
    // behind calling step 1 safe.
    expect(validate(minimalV3)).toBe(true);
    expect(validate(minimalV4)).toBe(true);
    expect(validate({ ...minimalV3, unsupported: true })).toBe(false);
  });
});

describe('ADR-004 — a disagreeing document is not mistaken for a legacy one', () => {
  it('validateLegacy rejects a disagreeing v0.4 document', () => {
    // Before ADR-004 a root `version` string uniquely marked the pre-v0.3 shape.
    // It no longer does. Without the `generated.specVersion` guard in
    // validateLegacy, this document — invalid under §4 — would be reported as a
    // legacy v0.1/v0.2 document, and scripts/validate-examples.mjs (which accepts
    // on `strict || legacy`) would pass it.
    const disagreeing = { version: '0.3', ...minimalV4 };
    expect(validate(disagreeing)).toBe(false);
    expect(validateLegacy(disagreeing)).toBe(false);
  });

  it('validateLegacy still accepts a genuine v0.1 document', () => {
    expect(validateLegacy({ version: '1', generatedAt: '2026-01-01T00:00:00Z' })).toBe(true);
  });

  it('validateLegacy rejects a valid mirrored v0.4 document', () => {
    expect(validateLegacy({ version: '0.4', ...minimalV4 })).toBe(false);
  });
});

// ─── Schema identity invariants ──────────────────────────────────────────────
// These tests are the single source of truth for the canonical $id URL.
// If any of them fail, you have a $id drift problem — fix the source, not the test.
const CANONICAL_ID = 'https://workspacejson.dev/schema/v1.json';

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
    // Changesets writes a bare `## <version>` heading, and step 6 of
    // `scripts/verify-release-identity.mjs` requires exactly that form before a
    // release may be tagged. This assertion previously required the
    // hand-written Keep-a-Changelog form `## [<version>]`, which meant the two
    // gates could not both be satisfied by the same file — whichever form the
    // changelog carried, one of them failed. Matching the release gate is what
    // makes them agree.
    //
    // Only the top heading is inspected. The bracketed entries below it are
    // historical, pre-Changesets, and are deliberately not matched: a bracketed
    // heading at the top would now yield no match at all, which is the correct
    // failure — it says the released version was not versioned by Changesets.
    const match = changelog.match(/^## (\d+\.\d+\.\d+)\s*$/m);
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

// ─── fileIndex key format pinned to repo-root-relative POSIX ─────────────────
// A downstream join probe silently produced zero rows because the spec
// said "relative path" without an anchor. The canonical form must be stated and
// kept in sync across both schema mirrors so the CLI shim normalizes toward a
// blessed target rather than an assumed one.
describe('canonical key format is repository-root-relative POSIX', () => {
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

// ─── coChange.files is a set, not a positional tuple ─────────────────────────
// types.ts said [string, string] (positional) while the schema said min/max-2
// array (set). A CLI that treated files[0] as canonical would silently mis-join.
// The contract is now set semantics — order must never affect the join.
describe('coChange.files has set semantics (order-independent join)', () => {
  const minimalV4 = {
    manual: {},
    generated: {
      specVersion: '0.4' as const,
      generatedAt: '2026-05-22T00:00:00Z',
      basisRevision: BASIS,
      by: { name: 'test', version: '0.1.0' },
      frameworkManifest: [],
      fileIndex: {},
      coChange: [] as CoChangeEntry[],
      fragility: [],
    },
    agents: {},
    health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 },
  };

  const withPair = (files: string[]) => ({
    ...minimalV4,
    generated: {
      ...minimalV4.generated,
      coChange: [{ files, support: 5, occurrences: 10, generated: false }],
    },
  });

  it('validateV4 accepts a coChange pair in either ordering', () => {
    expect(validateV4(withPair(['a.sql', 'b.sql']))).toBe(true);
    expect(validateV4(withPair(['b.sql', 'a.sql']))).toBe(true);
  });

  it('the co-change join (set membership) resolves identically under reversed pair order', () => {
    // Models the CLI join: find co-change partners of a target file by membership,
    // never by index. This is the assertion set semantics requires at the join level.
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

// ─── ADR-003 A-009: raw co-change observations ───────────────────────────────
// `generated.coChange` gains a raw-count form. `occurrences` is the SYMMETRIC
// UNION denominator there — qualifying commits in which at least one of the two
// files changed — because `files` is an unordered pair and an unordered pair has
// no subject file whose marginal could serve as a denominator.
//
// This lands as a WIDENING under an unchanged `generated.specVersion: "0.4"`.
// Two entry forms are accepted, exactly one per entry, and the legacy form is
// removed only at the next document-profile change. The tests below carry that
// staging: everything that validated before must still validate, which is the
// property the transition rests on.
//
// Every negative is a ONE-FIELD perturbation of `valid`. That is what makes each
// one attributable to the defect it names rather than to incidental breakage,
// and it is what the `examples/invalid/` fixtures rely on for their own
// reason-specificity.
describe('A-009 co-change raw observations', () => {
  const entry = (over: Partial<Record<string, unknown>> = {}) => ({
    files: ['src/auth.ts', 'src/session.ts'],
    support: 8,
    occurrences: 24,
    generated: false,
    ...over,
  });

  const withEntries = (entries: unknown[], generatedOver: Record<string, unknown> = {}) => ({
    ...minimalV4,
    generated: { ...minimalV4.generated, coChange: entries, ...generatedOver },
  });

  const valid = withEntries([entry()]);

  /** The pre-amendment shape, as already-published artifacts carry it. */
  const legacyEntry = (over: Partial<Record<string, unknown>> = {}) => ({
    files: ['src/auth.ts', 'src/session.ts'],
    rate: 0.87,
    occurrences: 9,
    generated: false,
    ...over,
  });

  it('accepts raw support and occurrences', () => {
    expect(validateV4(valid)).toBe(true);
  });

  // ---- the transition: two forms, exactly one per entry ---------------------
  // The whole point of Option 2. If any assertion in this block fails, the
  // release has stopped being a widening and has become a breaking change to
  // documents that still declare specVersion 0.4.
  describe('v0.4 transition: legacy and observation forms coexist', () => {
    const legacyDocument = {
      ...minimalV4,
      generated: (() => {
        const { basisRevision: _dropped, ...withoutBasis } = minimalV4.generated;
        return { ...withoutBasis, coChange: [legacyEntry()] };
      })(),
    };

    it('still accepts the legacy rate form, exactly as published', () => {
      expect(validate(legacyDocument)).toBe(true);
      expect(validateV4(legacyDocument)).toBe(true);
    });

    it('accepts a legacy artifact WITHOUT basisRevision — no existing document is invalidated', () => {
      expect('basisRevision' in legacyDocument.generated).toBe(false);
      expect(validateV4(legacyDocument)).toBe(true);
    });

    it('accepts the observation form alongside it', () => {
      expect(validateV4(valid)).toBe(true);
    });

    it('rejects an entry carrying BOTH representations', () => {
      // Two different contracts in one entry: a reader cannot know which was
      // measured, and the counts need not agree.
      expect(validate(withEntries([entry({ rate: 0.33 })]))).toBe(false);
      expect(validate(withEntries([legacyEntry({ support: 3 })]))).toBe(false);
    });

    it('rejects an entry carrying NEITHER representation', () => {
      const { support: _dropped, ...bare } = entry();
      expect(validate(withEntries([bare]))).toBe(false);
    });

    it('rejects both-and-neither per entry, not merely per document', () => {
      expect(validate(withEntries([legacyEntry(), entry({ rate: 0.5 })]))).toBe(false);
      const { support: _dropped, ...bare } = entry();
      expect(validate(withEntries([entry(), bare]))).toBe(false);
    });

    // ---- collection-level homogeneity --------------------------------------
    // Per-entry `oneOf` is not sufficient. Each entry in a mixed array is
    // individually well-formed, so without a rule at the array level one
    // artifact would carry two different meanings of `occurrences` with nothing
    // saying so, and a reader aggregating across entries would silently combine
    // them.
    it('rejects a MIXED array — every entry legacy, or every entry observation', () => {
      expect(validate(withEntries([legacyEntry(), entry()]))).toBe(false);
      expect(validate(withEntries([entry(), legacyEntry()]))).toBe(false);
    });

    it('the mixed array is rejected by the BARE SCHEMA, not only by the validator', () => {
      const bare = compileSchemaValidator<unknown>(
        JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as object,
      );
      expect(bare(withEntries([legacyEntry(), entry()]))).toBe(false);
    });

    // ---- the oneOf hole ----------------------------------------------------
    // REGRESSION. An earlier draft wrote the two branches as bare `required`
    // clauses and let `oneOf`'s exactly-one-match arithmetic do the excluding.
    // That is not sufficient once one branch carries a constraint the other
    // does not: an entry with `rate` AND `support` AND `occurrences: 0` matched
    // the legacy branch, failed the observation branch on the minimum, and so
    // satisfied `oneOf` with exactly one match — admitting the both-form entry
    // that the rule exists to forbid. "Exactly one branch passed" was true for
    // precisely the wrong reason.
    //
    // Each branch now forbids the other representation with an explicit `not`,
    // so exclusion holds per branch rather than by counting matches.
    describe('both-form entries cannot hide behind a failing branch', () => {
      const bare = compileSchemaValidator<unknown>(
        JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as object,
      );
      const disguised = entry({ rate: 0.3, support: 3, occurrences: 0 });

      it('rejects { rate, support, occurrences: 0 } — bare schema, validate() and validateV4()', () => {
        const doc = withEntries([disguised]);
        expect(bare(doc)).toBe(false);
        expect(validate(doc)).toBe(false);
        expect(validateV4(doc)).toBe(false);
      });

      it('rejects it at every occurrences value, so the fix is not minimum-specific', () => {
        for (const occurrences of [0, 1, 9, 24]) {
          const doc = withEntries([entry({ rate: 0.3, support: 3, occurrences })]);
          expect(bare(doc)).toBe(false);
          expect(validate(doc)).toBe(false);
        }
      });

      it('rejects a mixed array whose second entry is a disguised both-form entry', () => {
        // Under the old rule this read as homogeneously legacy, so the
        // collection check passed too. Neither rule may lean on the other.
        const doc = withEntries([legacyEntry(), legacyEntry({ support: 4, occurrences: 0 })]);
        expect(bare(doc)).toBe(false);
        expect(validate(doc)).toBe(false);
      });

      it('both adversarial fixtures ship and are rejected by the bare schema', () => {
        for (const name of [
          'cochange-both-forms-zero-occurrences.json',
          'cochange-mixed-forms-disguised.json',
        ]) {
          const fixture = JSON.parse(
            readFileSync(resolve(__dirname, `../examples/invalid/${name}`), 'utf8'),
          ) as unknown;
          expect(bare(fixture)).toBe(false);
          expect(validate(fixture)).toBe(false);
          expect(validateV4(fixture)).toBe(false);
        }
      });

      it('the controls still validate, so the fix did not over-reject', () => {
        expect(validateV4(withEntries([legacyEntry()]))).toBe(true);
        expect(validateV4(withEntries([legacyEntry({ occurrences: 0 })]))).toBe(true);
        expect(validateV4(withEntries([entry()]))).toBe(true);
        expect(validateV4(withEntries([entry({ support: 0, occurrences: 1 })]))).toBe(true);
      });

      it('both mirrors carry the explicit not clauses', () => {
        for (const source of [
          JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>,
          workspaceJsonSchema as unknown as Record<string, unknown>,
        ]) {
          const branches = (
            (
              (
                (source['properties'] as Record<string, Record<string, Record<string, unknown>>>)[
                  'generated'
                ]['properties']['coChange'] as Record<string, unknown>
              )['items'] as Record<string, unknown>
            )['oneOf'] as Array<Record<string, unknown>>
          );
          expect(branches.map((b) => b['not'])).toEqual([
            { required: ['support'] },
            { required: ['rate'] },
          ]);
        }
      });
    });

    it('accepts a homogeneous array of either form, at length > 1', () => {
      expect(validateV4(withEntries([legacyEntry(), legacyEntry()]))).toBe(true);
      expect(validateV4(withEntries([entry(), entry()]))).toBe(true);
    });

    it('an EMPTY array satisfies both homogeneity branches', () => {
      // Vacuously homogeneous. It asserts nothing about which form its producer
      // would have used, which is exactly why an unpinned empty array is
      // defined as legacy/unknown rather than as evidence of zero.
      expect(validateV4(withEntries([]))).toBe(true);
    });

    it('the legacy form is still constrained where it always was', () => {
      expect(validate(withEntries([legacyEntry({ rate: 1.5 })]))).toBe(false);
      expect(validate(withEntries([legacyEntry({ rate: -0.1 })]))).toBe(false);
      expect(validate(withEntries([legacyEntry({ occurrences: -1 })]))).toBe(false);
    });
  });

  // ---- swap invariance -----------------------------------------------------
  // The load-bearing property of the union denominator. If `occurrences` were
  // the subject file's marginal, two conformant producers could emit different
  // denominators for the same pair depending on which file they silently
  // treated as the subject. Under the union it cannot happen — and reversing
  // the stored pair must change neither count nor the document's validity.
  describe('swap invariance', () => {
    const forward = withEntries([entry({ files: ['src/auth.ts', 'src/session.ts'] })]);
    const reversed = withEntries([entry({ files: ['src/session.ts', 'src/auth.ts'] })]);

    it('reversing the pair changes neither support nor occurrences', () => {
      const counts = (doc: typeof forward) =>
        (doc.generated.coChange as CoChangeEntry[]).map((e) => [e.support, e.occurrences]);
      expect(counts(reversed)).toEqual(counts(forward));
      expect(counts(forward)).toEqual([[8, 24]]);
    });

    it('both orderings validate, and the observation is the same observation', () => {
      expect(validateV4(forward)).toBe(true);
      expect(validateV4(reversed)).toBe(true);

      // The join a consumer performs: by membership, never by index. Same
      // partner, same counts, either way the producer happened to store it.
      const observationFor = (doc: typeof forward, target: string) =>
        (doc.generated.coChange as CoChangeEntry[])
          .filter((e) => e.files.includes(target))
          .map((e) => ({
            partner: e.files.find((f) => f !== target),
            support: e.support,
            occurrences: e.occurrences,
          }));

      expect(observationFor(reversed, 'src/auth.ts')).toEqual(observationFor(forward, 'src/auth.ts'));
      expect(observationFor(forward, 'src/auth.ts')).toEqual([
        { partner: 'src/session.ts', support: 8, occurrences: 24 },
      ]);

      // And symmetric from the other file's side: one observation, not two
      // directed halves that could disagree.
      expect(observationFor(forward, 'src/session.ts')).toEqual([
        { partner: 'src/auth.ts', support: 8, occurrences: 24 },
      ]);
    });
  });

  // ---- the union denominator, DERIVED from asymmetric marginals ------------
  // Everything above uses `support: 8, occurrences: 24` as literals. Two
  // literals cannot demonstrate a counting rule: 24 is equally consistent with
  // "the union", "the larger marginal plus four" and "a number someone typed".
  // The rule only becomes visible once the counts are COMPUTED from a commit
  // ledger whose two marginals differ.
  //
  // The marginals are deliberately ASYMMETRIC — 20 and 12. That is what makes
  // the subject-marginal alternative incoherent rather than merely different:
  // an unordered pair has no subject, so a producer using "the subject's
  // marginal" as the denominator has two answers available (20 or 12) and
  // nothing in the artifact to choose between them. Two conforming producers
  // would emit different denominators for the same observation. The union is
  // the only denominator that is a function of the pair rather than of an
  // ordering the pair does not carry.
  describe('union denominator derived from asymmetric marginals (20, 12, ∩ 8)', () => {
    // A synthetic ledger of 24 qualifying commits, indexed 1..24.
    //   src/auth.ts    changed in commits  1..20   → marginal 20
    //   src/session.ts changed in commits 13..24   → marginal 12
    //   both                              13..20   → intersection 8
    //   either                             1..24   → union 24
    const commits = Array.from({ length: 24 }, (_, i) => i + 1);
    const touchedBy = {
      'src/auth.ts': new Set(commits.filter((c) => c <= 20)),
      'src/session.ts': new Set(commits.filter((c) => c >= 13)),
    } as const;

    const pair = ['src/auth.ts', 'src/session.ts'] as const;
    const marginal = (f: (typeof pair)[number]) => touchedBy[f].size;

    /** Qualifying commits in which BOTH files changed. */
    const countSupport = () =>
      commits.filter((c) => pair.every((f) => touchedBy[f].has(c))).length;

    /** Qualifying commits in which AT LEAST ONE changed — the symmetric union. */
    const countOccurrences = () =>
      commits.filter((c) => pair.some((f) => touchedBy[f].has(c))).length;

    it('the ledger has the asymmetric marginals the rule is interesting for', () => {
      expect(marginal('src/auth.ts')).toBe(20);
      expect(marginal('src/session.ts')).toBe(12);
      // Asymmetry is the whole point: if the marginals were equal, a
      // subject-marginal denominator would coincide with itself and the choice
      // of denominator would be unobservable.
      expect(marginal('src/auth.ts')).not.toBe(marginal('src/session.ts'));
    });

    it('support is the intersection: 8', () => {
      expect(countSupport()).toBe(8);
    });

    it('occurrences is the union, and inclusion–exclusion gives 20 + 12 − 8 = 24', () => {
      expect(countOccurrences()).toBe(24);
      expect(countOccurrences()).toBe(
        marginal('src/auth.ts') + marginal('src/session.ts') - countSupport(),
      );
    });

    it('the union is NEITHER marginal — this is what rules out a subject denominator', () => {
      // The substantive assertion. A producer that used "the subject file's
      // marginal" would emit 20 or 12 here depending on which endpoint it
      // silently treated as the subject. The union is 24 and is not either.
      expect(countOccurrences()).not.toBe(marginal('src/auth.ts'));
      expect(countOccurrences()).not.toBe(marginal('src/session.ts'));
    });

    it('the derived counts are the ones the suite carries', () => {
      // Ties the ledger to the literals used everywhere else in this file, so
      // the two cannot drift apart silently.
      expect([countSupport(), countOccurrences()]).toEqual([8, 24]);
    });

    // ---- THE DESIGNATED UNION-SEMANTICS TEST --------------------------------
    // A synthetic ledger that agrees only with itself proves nothing about what
    // this repository ships. This is the test that binds the derivation to the
    // ARTIFACT BYTES: the shipped observation example must carry the union, and
    // must fail here the moment it drifts toward either endpoint's marginal.
    //
    // It is stated four ways on purpose. A single equality would also be
    // satisfied by a fixture that happens to hold 24 for an unrelated reason;
    // the inclusion–exclusion identity and the two not-a-marginal assertions are
    // what make the number mean "the union" rather than "twenty-four".
    it('THE SHIPPED EXAMPLE carries the union denominator, not an endpoint marginal', () => {
      const shipped = JSON.parse(
        readFileSync(resolve(__dirname, '../examples/cochange-observations-v0.4.json'), 'utf8'),
      ) as {
        generated: { coChange: Array<{ files: string[]; support: number; occurrences: number }> };
      };
      const observed = shipped.generated.coChange.find(
        (e) => e.files.includes('src/auth.ts') && e.files.includes('src/session.ts'),
      );
      expect(observed, 'the auth/session observation must exist in the shipped example').toBeDefined();

      // 1. The shipped intersection is the derived intersection.
      expect(observed!.support).toBe(countSupport());

      // 2. The shipped denominator is the derived union.
      expect(observed!.occurrences).toBe(countOccurrences());

      // 3. Inclusion–exclusion, evaluated against the SHIPPED numbers:
      //    |A ∪ B| = |A| + |B| − |A ∩ B|  →  24 = 20 + 12 − 8.
      expect(observed!.occurrences).toBe(
        marginal('src/auth.ts') + marginal('src/session.ts') - observed!.support,
      );

      // 4. And it is neither marginal. This is the assertion that a producer
      //    silently using a subject denominator would fail: it would ship 20 or
      //    12 here, both of which satisfy every schema and validator check.
      expect(observed!.occurrences).not.toBe(marginal('src/auth.ts'));
      expect(observed!.occurrences).not.toBe(marginal('src/session.ts'));
    });

    it('the derived observation validates', () => {
      const derived = withEntries([
        entry({ files: [...pair], support: countSupport(), occurrences: countOccurrences() }),
      ]);
      expect(validateV4(derived)).toBe(true);
    });

    it('endpoint reversal does not change either derived count', () => {
      // Swap invariance at the level of the DERIVATION, not just of two stored
      // literals: recomputing with the endpoints reversed must give the same
      // pair of numbers, because both counts quantify over commits and neither
      // reads a subject.
      const reversedPair = [...pair].reverse() as unknown as typeof pair;
      const supportReversed = commits.filter((c) =>
        reversedPair.every((f) => touchedBy[f].has(c)),
      ).length;
      const occurrencesReversed = commits.filter((c) =>
        reversedPair.some((f) => touchedBy[f].has(c)),
      ).length;
      expect([supportReversed, occurrencesReversed]).toEqual([countSupport(), countOccurrences()]);
    });

    // ---- and the gap this exposes -------------------------------------------
    // The union rule is NOT machine-checkable from a single document, and that
    // is a second out-of-schema producer obligation alongside
    // `support <= occurrences`. A subject-marginal producer emits
    // `support: 8, occurrences: 20` — internally consistent, `support` below
    // `occurrences`, every declared constraint satisfied. Nothing in this
    // repository rejects it. Recorded here so the limit is pinned rather than
    // discovered by a consumer comparing two producers.
    it('a subject-marginal denominator passes every gate — the rule is a producer obligation', () => {
      const subjectMarginal = withEntries([
        entry({ files: [...pair], support: countSupport(), occurrences: marginal('src/auth.ts') }),
      ]);
      const bare = compileSchemaValidator<unknown>(
        JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as object,
      );
      expect(bare(subjectMarginal)).toBe(true);
      expect(validate(subjectMarginal)).toBe(true);
      expect(validateV4(subjectMarginal)).toBe(true);
      // It is nonetheless wrong: it disagrees with the ledger it claims to
      // summarize, and it is not the union.
      expect(marginal('src/auth.ts')).not.toBe(countOccurrences());
    });
  });

  // ---- pair ordering: a PRODUCER obligation, never a reader constraint -----
  // Two claims that are easy to conflate, and must not be:
  //
  //   SET SEMANTICS (reader-facing, normative here). `files` is an unordered
  //   pair. Either ordering is valid, joins are by membership, and no reader may
  //   attribute meaning to position. Adding an ordering constraint to the schema
  //   would narrow acceptance and turn this amendment from a widening into a
  //   break — so the schema deliberately says nothing about order.
  //
  //   CANONICAL SERIALIZATION (producer-facing, documented here, ENFORCED
  //   ELSEWHERE). A new producer serializes the two canonical stored keys in
  //   ascending UTF-8 byte order, so that endpoint reversal cannot change the
  //   bytes it emits and a regenerated artifact is stable. Enforcement belongs
  //   to the candidate-producer conformance suite that gates observation-form
  //   emission, recorded in ADR-003 A-009 — not to this repository. What is
  //   pinned here is the RULE and, critically, that applying it changes nothing
  //   about what readers accept.
  describe('canonical pair ordering (producer obligation; readers stay unconstrained)', () => {
    /**
     * Ascending UTF-8 BYTE order. Not locale collation, not case folding, not
     * Unicode normalization — each of those is a different total order, and
     * two producers disagreeing about which one applies would emit different
     * bytes for the same observation, which is the whole failure this rule
     * exists to prevent.
     */
    const canonicalOrder = (files: readonly string[]): string[] =>
      [...files].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));

    it('orders by UTF-8 bytes, so uppercase sorts before lowercase (NOT locale, NOT case-folded)', () => {
      // 'Z' is 0x5A, 'a' is 0x61. Byte order puts 'src/Z.ts' first. A
      // locale-aware or case-insensitive comparator would put 'src/a.ts' first,
      // which is the drift this assertion rules out.
      expect(canonicalOrder(['src/a.ts', 'src/Z.ts'])).toEqual(['src/Z.ts', 'src/a.ts']);
      expect(canonicalOrder(['src/Z.ts', 'src/a.ts'])).toEqual(['src/Z.ts', 'src/a.ts']);
    });

    it('does not normalize Unicode — precomposed and decomposed are distinct keys', () => {
      // U+00E9 vs 'e' + U+0301. These are different byte sequences and must be
      // ordered as such; applying NFC/NFD here would silently rewrite a stored
      // key, which ADR-006 forbids.
      const precomposed = 'src/café.ts';
      const decomposed = 'src/café.ts';
      expect(precomposed).not.toBe(decomposed);
      // 'e' (0x65) precedes the UTF-8 lead byte of U+00E9 (0xC3), so the
      // decomposed form sorts first under byte order.
      expect(canonicalOrder([precomposed, decomposed])).toEqual([decomposed, precomposed]);
    });

    it('endpoint reversal produces IDENTICAL producer bytes', () => {
      // The property the rule exists for: whichever way the analysis happened to
      // encounter the pair, the serialized artifact is the same.
      const forwardPair = ['src/auth.ts', 'src/session.ts'];
      const reversedPair = ['src/session.ts', 'src/auth.ts'];
      expect(canonicalOrder(reversedPair)).toEqual(canonicalOrder(forwardPair));

      const serialize = (files: string[]) =>
        JSON.stringify(withEntries([entry({ files: canonicalOrder(files) })]));
      expect(serialize(reversedPair)).toBe(serialize(forwardPair));
    });

    it('is idempotent — re-serializing an already-canonical pair changes nothing', () => {
      const once = canonicalOrder(['src/session.ts', 'src/auth.ts']);
      expect(canonicalOrder(once)).toEqual(once);
    });

    // ---- and the non-narrowing guarantee ------------------------------------
    // The assertions above describe what a PRODUCER should emit. The ones below
    // are the reason none of it may leak into the schema.
    it('a NON-canonically-ordered pair is still fully valid — this is not a schema rule', () => {
      const nonCanonical = ['src/session.ts', 'src/auth.ts'];
      expect(canonicalOrder(nonCanonical)).not.toEqual(nonCanonical);

      const doc = withEntries([entry({ files: nonCanonical })]);
      const bare = compileSchemaValidator<unknown>(
        JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as object,
      );
      expect(bare(doc)).toBe(true);
      expect(validate(doc)).toBe(true);
      expect(validateV4(doc)).toBe(true);
    });

    it('the schema declares no ordering constraint on files, in either mirror', () => {
      // A regression guard with teeth: if someone later expresses the producer
      // obligation as `uniqueItems`, a `const`, a `prefixItems` tuple or a
      // pattern pair, reversed documents stop validating and every published
      // artifact that stored the other ordering breaks.
      for (const source of [
        JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>,
        workspaceJsonSchema as unknown as Record<string, unknown>,
      ]) {
        const files = (
          (
            (
              (source['properties'] as Record<string, Record<string, unknown>>)['generated'][
                'properties'
              ] as Record<string, Record<string, unknown>>
            )['coChange']['items'] as Record<string, Record<string, unknown>>
          )['properties'] as Record<string, Record<string, unknown>>
        )['files'];
        expect(Object.keys(files).sort()).toEqual([
          'description',
          'items',
          'maxItems',
          'minItems',
          'type',
        ]);
      }
    });

    it('the shipped example is NOT canonically ordered, and that is legal', () => {
      // RETAINED DELIBERATELY, not an oversight to be corrected. The example
      // stores ["src/session.ts", "src/auth.ts"], which a new producer would
      // emit the other way round. Three things are true at once and none may be
      // inferred away from the others:
      //
      //   1. It is a READER-TOLERANCE fixture: executable evidence that a
      //      conforming reader must not depend on pair order.
      //   2. It is NOT reference-producer output. No example in this repository
      //      is a producer receipt.
      //   3. New producers still canonicalize by ascending UTF-8 bytes. This
      //      fixture's validity is NOT evidence that ordering is optional for a
      //      producer — reader tolerance and producer obligation are separate
      //      contracts, and this exercises only the first.
      const shipped = JSON.parse(
        readFileSync(resolve(__dirname, '../examples/cochange-observations-v0.4.json'), 'utf8'),
      ) as { generated: { coChange: Array<{ files: string[] }> } };
      const observed = shipped.generated.coChange.find(
        (e) => e.files.includes('src/auth.ts') && e.files.includes('src/session.ts'),
      );
      expect(observed!.files).toEqual(['src/session.ts', 'src/auth.ts']);
      expect(canonicalOrder(observed!.files)).toEqual(['src/auth.ts', 'src/session.ts']);
      expect(validate(shipped)).toBe(true);
    });
  });

  // ---- the negative fixtures are ONE-FIELD perturbations -------------------
  // `scripts/validate-examples.mjs` asserts that every fixture in
  // `examples/invalid/` is REJECTED, and each fixture carries a
  // `generated.$comment` naming the single defect it exhibits. Rejection alone
  // does not show the comment is true: a fixture carrying two defects, or one
  // defect other than the one named, is rejected just as firmly, and both the
  // gate and the comment would keep passing while the fixture stopped
  // demonstrating what it claims.
  //
  // The check that closes that gap is REPAIR. Restore the single named field to
  // a conforming value and change nothing else; if the document then validates,
  // the named defect was the only defect, and the fixture is attributable.
  describe('negative fixtures are attributable: repairing the named field makes each valid', () => {
    const invalidDir = resolve(__dirname, '../examples/invalid');

    type Doc = {
      generated: {
        basisRevision?: unknown;
        coChange: Array<Record<string, unknown>>;
      };
    };

    // One repair per fixture, touching ONLY the field its `$comment` names.
    const repairs: Record<string, (d: Doc) => void> = {
      'cochange-abbreviated-basis-revision.json': (d) => {
        d.generated.basisRevision = BASIS;
      },
      'cochange-both-forms-zero-occurrences.json': (d) => {
        // The named defect is carrying BOTH representations; `occurrences: 0`
        // is the disguise that made the old oneOf accept it, so restoring a
        // legal denominator is part of removing the same single defect.
        delete d.generated.coChange[0]!['rate'];
        d.generated.coChange[0]!['occurrences'] = 10;
      },
      'cochange-both-representations.json': (d) => {
        delete d.generated.coChange[0]!['rate'];
      },
      'cochange-legacy-missing-generated.json': (d) => {
        // A-010 widened the OBSERVATION form only. The legacy form still
        // requires the classification flag, so restoring it is the whole repair.
        d.generated.coChange[0]!['generated'] = false;
      },
      'cochange-missing-basis-revision.json': (d) => {
        d.generated.basisRevision = BASIS;
      },
      'cochange-mixed-forms-disguised.json': (d) => {
        d.generated.coChange[1] = {
          files: ['src/c.ts', 'src/d.ts'],
          rate: 0.4,
          occurrences: 10,
          generated: false,
        };
      },
      'cochange-mixed-forms.json': (d) => {
        d.generated.coChange[1] = {
          files: ['src/c.ts', 'src/d.ts'],
          rate: 0.3,
          occurrences: 10,
          generated: false,
        };
      },
      'cochange-negative-support.json': (d) => {
        d.generated.coChange[0]!['support'] = 1;
      },
      'cochange-neither-representation.json': (d) => {
        d.generated.coChange[0]!['support'] = 3;
      },
      'cochange-non-integer-occurrences.json': (d) => {
        d.generated.coChange[0]!['occurrences'] = 10;
      },
      'cochange-support-exceeds-occurrences.json': (d) => {
        d.generated.coChange[0]!['support'] = 9;
      },
      'cochange-zero-denominator.json': (d) => {
        d.generated.coChange[0]!['occurrences'] = 1;
      },
    };

    const fixtures = readdirSync(invalidDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    it('every shipped negative fixture has a declared repair', () => {
      // A fixture added without a repair would otherwise be silently exempt
      // from attribution.
      expect(fixtures).toEqual(Object.keys(repairs).sort());
    });

    for (const name of fixtures) {
      it(`${name} is rejected, and valid once its named field is repaired`, () => {
        const raw = readFileSync(resolve(invalidDir, name), 'utf8');
        expect(validate(JSON.parse(raw) as unknown)).toBe(false);

        const repaired = JSON.parse(raw) as Doc;
        repairs[name]!(repaired);
        expect(validate(repaired)).toBe(true);
      });
    }

    it('every fixture records the defect it exhibits', () => {
      for (const name of fixtures) {
        const doc = JSON.parse(readFileSync(resolve(invalidDir, name), 'utf8')) as {
          generated: { $comment?: string };
        };
        expect(doc.generated.$comment, name).toMatch(/^INVALID: /);
      }
    });
  });

  // ---- counts are counts ---------------------------------------------------
  describe('invalid counts are rejected', () => {
    it('rejects a negative support', () => {
      expect(validate(withEntries([entry({ support: -1 })]))).toBe(false);
    });

    it('rejects a negative occurrences', () => {
      expect(validate(withEntries([entry({ occurrences: -1 })]))).toBe(false);
    });

    it('rejects a fractional support', () => {
      expect(validate(withEntries([entry({ support: 8.5 })]))).toBe(false);
    });

    it('rejects a fractional occurrences', () => {
      expect(validate(withEntries([entry({ occurrences: 24.5 })]))).toBe(false);
    });

    it('rejects a stringified count', () => {
      expect(validate(withEntries([entry({ support: '8' })]))).toBe(false);
    });

    it('rejects support > occurrences, which the union denominator makes impossible', () => {
      // Not a judgement call: commits where BOTH files changed are a subset of
      // commits where AT LEAST ONE did. A producer emitting this counted file
      // events, a directed relationship, or two different boundaries.
      expect(validate(withEntries([entry({ support: 25, occurrences: 24 })]))).toBe(false);
      expect(validateV4(withEntries([entry({ support: 25, occurrences: 24 })]))).toBe(false);
    });

    it('rejects support > occurrences in ANY entry, not only the first', () => {
      expect(validate(withEntries([entry(), entry({ support: 25, occurrences: 24 })]))).toBe(false);
    });

    it('accepts the boundary where every qualifying commit changed both files', () => {
      expect(validateV4(withEntries([entry({ support: 24, occurrences: 24 })]))).toBe(true);
    });

    it('accepts a zero-support observation — no coupling observed is an observation', () => {
      expect(validateV4(withEntries([entry({ support: 0, occurrences: 24 })]))).toBe(true);
    });
  });

  // ---- zero denominators cannot reach a reader -----------------------------
  // The selected rule: observation-form `occurrences` has a MINIMUM OF 1.
  //
  // Justified by the producer model. A pair enters the observation set because
  // the miner saw at least one of its files in at least one qualifying commit;
  // a pair whose union of qualifying commits is empty was never observed at all.
  // Absence of an entry — not an entry with a zero denominator — is how an
  // unobserved pair is represented. So `occurrences: 0` does not describe a
  // repository state a conforming producer can be in; it describes a producer
  // that emitted a row it had no evidence for.
  //
  // Making it invalid means `support / occurrences` is total on conforming
  // artifacts: no reader can derive 0/0, NaN or infinity, and no reader needs a
  // guard the standard failed to specify. The alternative — defining 0 as
  // "unavailable" — would put that guard in every consumer instead, and a
  // consumer that forgot it would emit NaN into a report.
  //
  // The bound is observation-form only. Legacy `occurrences` keeps its original
  // minimum of 0, because narrowing it would invalidate published artifacts.
  describe('zero denominators: observation-form occurrences >= 1', () => {
    const bare = compileSchemaValidator<unknown>(
      JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as object,
    );

    it('rejects an observation entry with occurrences 0 — schema and validator agree', () => {
      const zero = withEntries([entry({ support: 0, occurrences: 0 })]);
      expect(bare(zero)).toBe(false);
      expect(validate(zero)).toBe(false);
      expect(validateV4(zero)).toBe(false);
    });

    it('accepts the smallest legitimate observation', () => {
      expect(validateV4(withEntries([entry({ support: 0, occurrences: 1 })]))).toBe(true);
      expect(validateV4(withEntries([entry({ support: 1, occurrences: 1 })]))).toBe(true);
    });

    it('keeps the legacy minimum at 0, so published artifacts stay valid', () => {
      const legacyZero = withEntries([legacyEntry({ rate: 0, occurrences: 0 })]);
      expect(bare(legacyZero)).toBe(true);
      expect(validate(legacyZero)).toBe(true);
    });

    it('the bound is carried by the observation branch of the item oneOf, in both mirrors', () => {
      const branchOf = (source: Record<string, unknown>) => {
        const items = (
          (
            (source['properties'] as Record<string, Record<string, Record<string, unknown>>>)[
              'generated'
            ]['properties']['coChange'] as Record<string, unknown>
          )['items'] as Record<string, unknown>
        )['oneOf'] as Array<Record<string, Record<string, Record<string, unknown>>>>;
        return items[1];
      };
      for (const source of [
        JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>,
        workspaceJsonSchema as unknown as Record<string, unknown>,
      ]) {
        expect(branchOf(source)['properties']['occurrences']['minimum']).toBe(1);
      }
    });

    it('every shipped observation-form fixture divides cleanly', () => {
      // The property the rule exists to buy, asserted against the bytes the
      // repository actually ships rather than against constructed documents.
      const dir = resolve(__dirname, '../examples');
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const doc = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as {
          generated?: { coChange?: Array<{ support?: number; occurrences: number }> };
        };
        for (const e of doc.generated?.coChange ?? []) {
          if (e.support === undefined) continue;
          const ratio = e.support / e.occurrences;
          expect(Number.isFinite(ratio)).toBe(true);
          expect(Number.isNaN(ratio)).toBe(false);
          expect(ratio).toBeGreaterThanOrEqual(0);
          expect(ratio).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // ---- the invariant the schema cannot carry -------------------------------
  // `support <= occurrences` is a producer obligation enforced by the reference
  // validator, NOT by the artifact schema: draft 2020-12 cannot compare two
  // instance values. The gap is asserted in both directions here, because a
  // disclosure in prose that no test pins is a disclosure that can quietly stop
  // being true. An implementer who materializes `@workspacejson/spec/schema`
  // and validates with their own tooling gets the weaker of these two answers.
  describe('support <= occurrences is enforced outside the schema', () => {
    const bareSchemaAccepts = compileSchemaValidator<unknown>(
      JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as object,
    );
    const impossible = withEntries([entry({ support: 25, occurrences: 24 })]);

    it('the bare packaged schema ACCEPTS an impossible pair of counts', () => {
      expect(bareSchemaAccepts(impossible)).toBe(true);
    });

    it('the reference validator REJECTS it', () => {
      expect(validate(impossible)).toBe(false);
      expect(validateV4(impossible)).toBe(false);
    });

    it('the two disagree only on this invariant, never on schema-expressible ones', () => {
      // A defect the schema CAN express must be rejected by both, or the
      // out-of-schema check is masking a schema hole rather than covering a
      // known gap.
      for (const schemaExpressible of [
        entry({ support: -1 }),
        entry({ occurrences: 24.5 }),
        entry({ rate: 0.33 }), // both forms at once
      ]) {
        const doc = withEntries([schemaExpressible]);
        expect(bareSchemaAccepts(doc)).toBe(false);
        expect(validate(doc)).toBe(false);
      }
      // And a clean document is accepted by both.
      expect(bareSchemaAccepts(valid)).toBe(true);
      expect(validate(valid)).toBe(true);
    });

    it('the shipped negative fixture exhibits exactly this asymmetry', () => {
      // docs/conformance.md tells implementers that this one fixture is
      // rejected by the reference validator alone. That claim is pinned here
      // against the bytes the repository actually ships.
      const fixture = JSON.parse(
        readFileSync(
          resolve(__dirname, '../examples/invalid/cochange-support-exceeds-occurrences.json'),
          'utf8',
        ),
      ) as unknown;
      expect(bareSchemaAccepts(fixture)).toBe(true);
      expect(validate(fixture)).toBe(false);
      expect(validateLegacy(fixture)).toBe(false);
    });

    it('every OTHER negative fixture is rejected by the bare schema too', () => {
      // The asymmetry is one fixture wide. If a second fixture started relying
      // on the out-of-schema check, the bundle an independent implementer
      // receives would have quietly lost another obligation.
      const invalidDir = resolve(__dirname, '../examples/invalid');
      const schemaOnly = readdirSync(invalidDir)
        .filter((f) => f.endsWith('.json'))
        .filter(
          (f) =>
            !bareSchemaAccepts(JSON.parse(readFileSync(resolve(invalidDir, f), 'utf8')) as unknown),
        );
      expect(schemaOnly.sort()).toEqual(
        readdirSync(invalidDir)
          .filter((f) => f.endsWith('.json'))
          .filter((f) => f !== 'cochange-support-exceeds-occurrences.json')
          .sort(),
      );
    });
  });

  // ---- no derived value is persisted alongside the counts ------------------
  it('rejects any other undeclared per-item field, including a per-item basisRevision', () => {
    // Basis pinning has exactly one home: the `generated` level. Repeating it
    // per item invites entries pinned to different revisions in one document.
    expect(validate(withEntries([entry({ basisRevision: BASIS })]))).toBe(false);
    expect(validate(withEntries([entry({ confidence: 0.9 })]))).toBe(false);
  });

  it('still requires the pair, and still requires both counts', () => {
    const { support: _s, ...noSupport } = entry();
    const { occurrences: _o, ...noOccurrences } = entry();
    const { files: _f, ...noFiles } = entry();
    expect(validate(withEntries([noSupport]))).toBe(false);
    expect(validate(withEntries([noOccurrences]))).toBe(false);
    expect(validate(withEntries([noFiles]))).toBe(false);
  });

  // ---- basis pinning -------------------------------------------------------
  describe('generated.basisRevision', () => {
    const withoutBasis = (coChange: unknown[]) => {
      const { basisRevision: _dropped, ...generatedWithoutBasis } = minimalV4.generated;
      return { ...minimalV4, generated: { ...generatedWithoutBasis, coChange } };
    };

    it('is required when ANY entry uses the observation form', () => {
      expect(validate(withoutBasis([entry()]))).toBe(false);
      // Including when the observation entry is not the first one.
      expect(validate(withoutBasis([legacyEntry(), entry()]))).toBe(false);
    });

    it('is NOT schema-required for an all-legacy array — that is what keeps this a widening', () => {
      expect(validate(withoutBasis([legacyEntry()]))).toBe(true);
    });

    // ---- legacy extension compatibility ------------------------------------
    // The object-ID pattern is scoped to the observation-form `then` branch,
    // NOT declared globally. A legacy artifact may already carry this key with
    // any value under `additionalProperties: true`, and a global pattern would
    // have made such a document newly invalid — turning the amendment into a
    // narrowing by the back door. These are the regression tests for that.
    describe('legacy artifacts may carry any basisRevision value', () => {
      const bare = compileSchemaValidator<unknown>(
        JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as object,
      );
      const legacyWith = (basisRevision: unknown) => ({
        ...minimalV4,
        generated: { ...minimalV4.generated, basisRevision, coChange: [legacyEntry()] },
      });

      it('accepts a legacy artifact with basisRevision "HEAD" — bare schema AND validator', () => {
        expect(bare(legacyWith('HEAD'))).toBe(true);
        expect(validate(legacyWith('HEAD'))).toBe(true);
        expect(validateV4(legacyWith('HEAD'))).toBe(true);
      });

      it('accepts other non-object-ID legacy values too', () => {
        for (const value of ['refs/heads/main', 'v1.2.3', '3c9a0f1', 'HEAD~5', '']) {
          expect(bare(legacyWith(value))).toBe(true);
          expect(validate(legacyWith(value))).toBe(true);
        }
      });

      it('the shipped regression fixture carries "HEAD" and validates both ways', () => {
        const fixture = JSON.parse(
          readFileSync(resolve(__dirname, '../examples/cochange-legacy-head-basis-v0.4.json'), 'utf8'),
        ) as { generated: { basisRevision: string } };
        expect(fixture.generated.basisRevision).toBe('HEAD');
        expect(bare(fixture)).toBe(true);
        expect(validate(fixture)).toBe(true);
      });

      it('but the SAME value is rejected once an observation entry appears', () => {
        // The scoping is real, not accidental permissiveness.
        const observationWithHead = {
          ...minimalV4,
          generated: { ...minimalV4.generated, basisRevision: 'HEAD', coChange: [entry()] },
        };
        expect(bare(observationWithHead)).toBe(false);
        expect(validate(observationWithHead)).toBe(false);
      });

      it('no global constraint on basisRevision exists in either mirror', () => {
        for (const source of [
          JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>,
          workspaceJsonSchema as unknown as Record<string, unknown>,
        ]) {
          const declared = (
            (
              (source['properties'] as Record<string, Record<string, unknown>>)['generated'][
                'properties'
              ] as Record<string, Record<string, unknown>>
            )['basisRevision']
          );
          // A description is documentation, not a constraint. Anything else
          // here would apply to legacy documents as well.
          expect(Object.keys(declared)).toEqual(['description']);
        }
      });
    });

    it('is NOT schema-required for an EMPTY array, and this is a known limitation', () => {
      // Stated as a limitation rather than a design choice. An empty array
      // written by an observation producer SHOULD carry a pin: present-and-empty
      // asserts the analysis ran and found nothing, and that claim is only
      // checkable against a named revision. But an empty array carries no
      // discriminator, so schema validation cannot tell it apart from an empty
      // array written by a legacy producer, and requiring a pin here would
      // invalidate legacy artifacts — breaking the transition.
      //
      // The obligation is therefore a PRODUCER obligation for the whole
      // transition, and this assertion pins the gap so the prose describing it
      // cannot drift away from the behavior.
      expect(validate(withoutBasis([]))).toBe(true);
    });

    it('accepts an empty array WITH a pin — what a conforming new producer emits', () => {
      expect(validateV4(minimalV4)).toBe(true);
      expect(minimalV4.generated.coChange).toEqual([]);
      expect(minimalV4.generated.basisRevision).toBe(BASIS);
    });

    it('is not required when coChange is absent — an unanalyzed document needs no pin', () => {
      const { basisRevision: _b, coChange: _c, ...generatedWithout } = minimalV4.generated;
      expect(validate({ ...minimalV4, generated: generatedWithout })).toBe(true);
    });

    it('accepts a full 40-character SHA-1 object name', () => {
      expect(validateV4(withEntries([entry()], { basisRevision: 'a'.repeat(40) }))).toBe(true);
    });

    it('accepts a full 64-character SHA-256 object name', () => {
      expect(validateV4(withEntries([entry()], { basisRevision: 'f'.repeat(64) }))).toBe(true);
    });

    it('rejects an abbreviated object name — it does not name one commit forever', () => {
      expect(validate(withEntries([entry()], { basisRevision: '3c9a0f1' }))).toBe(false);
      expect(validate(withEntries([entry()], { basisRevision: BASIS.slice(0, 39) }))).toBe(false);
    });

    it('rejects a length between the two object-name widths', () => {
      expect(validate(withEntries([entry()], { basisRevision: 'a'.repeat(41) }))).toBe(false);
      expect(validate(withEntries([entry()], { basisRevision: 'a'.repeat(63) }))).toBe(false);
      expect(validate(withEntries([entry()], { basisRevision: 'a'.repeat(65) }))).toBe(false);
    });

    it('rejects a symbolic reference', () => {
      expect(validate(withEntries([entry()], { basisRevision: 'main' }))).toBe(false);
      expect(validate(withEntries([entry()], { basisRevision: 'refs/heads/main' }))).toBe(false);
      expect(validate(withEntries([entry()], { basisRevision: 'HEAD' }))).toBe(false);
    });

    it('rejects uppercase hex — one spelling per revision, so pins compare as strings', () => {
      expect(validate(withEntries([entry()], { basisRevision: BASIS.toUpperCase() }))).toBe(false);
    });

    it('rejects a non-hex character and a non-string', () => {
      expect(validate(withEntries([entry()], { basisRevision: `${BASIS.slice(0, 39)}g` }))).toBe(false);
      expect(validate(withEntries([entry()], { basisRevision: 12345 }))).toBe(false);
    });
  });

  // ---- both mirrors agree --------------------------------------------------
  describe('the schema mirrors agree on the new contract', () => {
    const gen = (s: Record<string, unknown>) =>
      (s['properties'] as Record<string, Record<string, unknown>>)['generated'] as Record<string, unknown>;
    const json = () => JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    const item = (s: Record<string, unknown>) =>
      ((gen(s)['properties'] as Record<string, Record<string, unknown>>)['coChange']['items']) as Record<string, unknown>;

    it('both mirrors require only what BOTH forms carry', () => {
      // A-010 removed `generated` from this set. It is not something both forms
      // carry: the observation form may omit it, and an item-level requirement
      // would force a producer to classify a pair it has no classifier for.
      for (const source of [json(), workspaceJsonSchema as unknown as Record<string, unknown>]) {
        const required = [...(item(source)['required'] as string[])].sort();
        expect(required).toEqual(['files', 'occurrences']);
      }
    });

    it('both mirrors express the two forms as a oneOf, so exactly one applies', () => {
      for (const source of [json(), workspaceJsonSchema as unknown as Record<string, unknown>]) {
        const branches = item(source)['oneOf'] as Array<Record<string, unknown>>;
        // The legacy branch carries `generated` after A-010: the requirement did
        // not disappear, it moved down into the one form that is frozen.
        expect(branches.map((b) => b['required'])).toEqual([['rate', 'generated'], ['support']]);
      }
    });

    it('both mirrors still declare rate, retained for the transition only', () => {
      for (const source of [json(), workspaceJsonSchema as unknown as Record<string, unknown>]) {
        const props = item(source)['properties'] as Record<string, Record<string, unknown>>;
        expect(Object.keys(props).sort()).toEqual([
          'files',
          'generated',
          'occurrences',
          'rate',
          'support',
        ]);
        expect(item(source)['additionalProperties']).toBe(false);
        expect(props['rate']['description']).toContain('LEGACY FORM ONLY');
        expect(props['rate']['description']).toContain('next document-profile change');
      }
    });

    it('both mirrors carry the basisRevision contract INSIDE the observation branch only', () => {
      for (const source of [json(), workspaceJsonSchema as unknown as Record<string, unknown>]) {
        // Conditional, not unconditional: `dependentRequired` on `coChange`
        // would have invalidated every legacy artifact.
        expect(gen(source)['dependentRequired']).toBeUndefined();
        const [rule] = gen(source)['allOf'] as Array<Record<string, unknown>>;
        expect((rule['if'] as Record<string, unknown>)['properties']).toEqual({
          coChange: { contains: { required: ['support'] } },
        });
        expect(rule['then']).toEqual({
          required: ['basisRevision'],
          properties: {
            basisRevision: { type: 'string', pattern: '^([0-9a-f]{40}|[0-9a-f]{64})$' },
          },
        });
      }
    });

    it('both mirrors enforce collection-level homogeneity with anyOf', () => {
      for (const source of [json(), workspaceJsonSchema as unknown as Record<string, unknown>]) {
        const coChange = (gen(source)['properties'] as Record<string, Record<string, unknown>>)[
          'coChange'
        ];
        const branches = coChange['anyOf'] as Array<Record<string, Record<string, unknown>>>;
        expect(branches.map((b) => b['items'])).toEqual([
          { required: ['rate'] },
          { required: ['support'] },
        ]);
      }
    });

    it('the profile identifier does not move — this is still v0.4', () => {
      for (const source of [json(), workspaceJsonSchema as unknown as Record<string, unknown>]) {
        const props = gen(source)['properties'] as Record<string, Record<string, unknown>>;
        expect(props['specVersion']['enum']).toEqual(['0.3', '0.4']);
        expect((source['properties'] as Record<string, Record<string, unknown>>)['version']['enum']).toEqual([
          '0.3',
          '0.4',
        ]);
      }
    });

    it('both mirrors carry the same counting semantics in the descriptions', () => {
      for (const source of [json(), workspaceJsonSchema as unknown as Record<string, unknown>]) {
        const props = item(source)['properties'] as Record<string, Record<string, unknown>>;
        expect(props['support']['description']).toContain('BOTH files changed');
        expect(props['occurrences']['description']).toContain('AT LEAST ONE');
        expect(props['occurrences']['description']).toContain('union denominator');
      }
      // Descriptions are the contract an independent implementer builds from,
      // so a split between the mirrors is a split contract.
      const jsonProps = (item(json())['properties']) as Record<string, Record<string, unknown>>;
      const tsProps = (item(workspaceJsonSchema as unknown as Record<string, unknown>)['properties']) as Record<string, Record<string, unknown>>;
      for (const field of ['support', 'occurrences', 'files']) {
        expect(tsProps[field]['description']).toBe(jsonProps[field]['description']);
      }
      expect(
        (gen(workspaceJsonSchema as unknown as Record<string, unknown>)['properties'] as Record<string, Record<string, unknown>>)['basisRevision']['description'],
      ).toBe((gen(json())['properties'] as Record<string, Record<string, unknown>>)['basisRevision']['description']);
    });

    it('the counting semantics name commits rather than file events', () => {
      const props = item(json())['properties'] as Record<string, Record<string, unknown>>;
      expect(props['support']['description']).toContain('distinct qualifying commits');
      expect(props['occurrences']['description']).toContain('distinct qualifying commits');
      expect(
        ((gen(json())['properties'] as Record<string, Record<string, unknown>>)['coChange'])['description'],
      ).toContain('qualifying commit');
    });
  });
});

// A-010 — the tooling-coupling flag is a classification, not an observation.
//
// The defect this closes: `generated` was required on every item, and the
// producer that mines the commit graph has no classifier to fill it with. It was
// emitting a constant `false`, which on the pinned dotenv fixture asserted that
// `package-lock.json ↔ package.json` — the textbook tooling-coupled pair — is a
// real source coupling. A required boolean does not produce knowledge; it
// produces a value.
//
// The widening is deliberately asymmetric, and both halves are asserted here:
// optional in the observation form, still required in the frozen legacy form.
describe('A-010 tooling-coupling classification is optional and three-state', () => {
  const observation = (over: Record<string, unknown> = {}) => ({
    files: ['src/auth.ts', 'src/session.ts'],
    support: 8,
    occurrences: 24,
    ...over,
  });

  const legacy = (over: Record<string, unknown> = {}) => ({
    files: ['src/auth.ts', 'src/session.ts'],
    rate: 0.87,
    occurrences: 9,
    ...over,
  });

  const doc = (entries: unknown[], generatedOver: Record<string, unknown> = {}) => ({
    ...minimalV4,
    generated: { ...minimalV4.generated, coChange: entries, ...generatedOver },
  });

  /** A legacy document carries no basis pin, exactly as published. */
  const legacyDoc = (entries: unknown[]) => {
    const { basisRevision: _dropped, ...generatedWithoutBasis } = minimalV4.generated;
    return { ...minimalV4, generated: { ...generatedWithoutBasis, coChange: entries } };
  };

  describe('the observation form', () => {
    it('accepts an entry that omits the flag — the shape the amendment exists to admit', () => {
      expect(validateV4(doc([observation()]))).toBe(true);
    });

    it('still accepts both classified states, so widening removed nothing', () => {
      expect(validateV4(doc([observation({ generated: true })]))).toBe(true);
      expect(validateV4(doc([observation({ generated: false })]))).toBe(true);
    });

    it('accepts a partially classified array — the flag is per entry, not per array', () => {
      // Nothing at the collection level makes classification all-or-nothing. A
      // producer that can classify lockfiles and nothing else is conformant.
      expect(
        validateV4(
          doc([
            observation({ files: ['package.json', 'pnpm-lock.yaml'], generated: true }),
            observation(),
          ]),
        ),
      ).toBe(true);
    });

    it('omitting the flag does not make an entry formless — the discriminator is support vs rate', () => {
      // Guards against a plausible misreading in which the flag is treated as
      // part of the form discriminator. It is not: an entry with `support` and
      // no flag is unambiguously the observation form.
      expect(validateV4(doc([observation()]))).toBe(true);
      expect(validate(doc([observation({ rate: 0.5 })]))).toBe(false);
    });

    it('rejects a non-boolean flag — optional widens presence, not type', () => {
      expect(validate(doc([observation({ generated: 'true' })]))).toBe(false);
      expect(validate(doc([observation({ generated: null })]))).toBe(false);
      expect(validate(doc([observation({ generated: 1 })]))).toBe(false);
    });
  });

  describe('the legacy form stays frozen', () => {
    it('rejects a legacy entry that omits the flag', () => {
      // The requirement moved into the legacy branch rather than disappearing.
      // Every artifact published in this form already carries the flag, so
      // widening here would loosen a shape nobody should still emit.
      expect(validate(legacyDoc([legacy()]))).toBe(false);
    });

    it('accepts the legacy entry that carries it, unchanged', () => {
      expect(validate(legacyDoc([legacy({ generated: false })]))).toBe(true);
      expect(validate(legacyDoc([legacy({ generated: true })]))).toBe(true);
    });

    it('the shipped legacy example still validates', () => {
      const shipped = JSON.parse(
        readFileSync(resolve(EXAMPLES_DIR, 'cochange-legacy-rate-v0.4.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(validate(shipped)).toBe(true);
    });
  });

  describe('absence is a third state, and the shipped fixture proves it', () => {
    const shipped = () =>
      JSON.parse(
        readFileSync(resolve(EXAMPLES_DIR, 'cochange-unclassified-v0.4.json'), 'utf8'),
      ) as { generated: { coChange: Array<Record<string, unknown>> } };

    it('THE SHIPPED UNCLASSIFIED EXAMPLE validates and classifies nothing', () => {
      const document = shipped();
      expect(validate(document)).toBe(true);
      expect(document.generated.coChange.length).toBeGreaterThan(0);
      for (const item of document.generated.coChange) {
        expect('generated' in item).toBe(false);
      }
    });

    it('carries the lockfile pair unflagged — the case a reader must not resolve to false', () => {
      // The pair whose misclassification opened this amendment. Present on
      // purpose: a reader collapsing absent into false reads it as a confirmed
      // real source coupling.
      const document = shipped();
      const lockfilePair = document.generated.coChange.find((item) =>
        (item['files'] as string[]).includes('pnpm-lock.yaml'),
      );
      expect(lockfilePair).toBeDefined();
      expect(lockfilePair!['generated']).toBeUndefined();
    });

    it('absent and false are distinguishable at the document level, not merely at the type level', () => {
      // The whole point of the three states. A reader that cannot tell these
      // two documents apart has lost the distinction the amendment created.
      const unclassified = doc([observation()]);
      const classifiedNegative = doc([observation({ generated: false })]);
      expect(validateV4(unclassified)).toBe(true);
      expect(validateV4(classifiedNegative)).toBe(true);
      expect('generated' in (unclassified.generated.coChange as Array<Record<string, unknown>>)[0]!).toBe(false);
      expect((classifiedNegative.generated.coChange as Array<Record<string, unknown>>)[0]!['generated']).toBe(false);
    });
  });

  describe('the mirrors agree on the widening', () => {
    const gen = (s: Record<string, unknown>) =>
      (s['properties'] as Record<string, Record<string, unknown>>)['generated'] as Record<string, unknown>;
    const item = (s: Record<string, unknown>) =>
      (gen(s)['properties'] as Record<string, Record<string, unknown>>)['coChange']['items'] as Record<
        string,
        unknown
      >;
    const sources = () => [
      JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>,
      workspaceJsonSchema as unknown as Record<string, unknown>,
    ];

    it('neither mirror requires the flag at item level', () => {
      for (const source of sources()) {
        expect(item(source)['required']).not.toContain('generated');
      }
    });

    it('both mirrors require it on the legacy branch only', () => {
      for (const source of sources()) {
        const branches = item(source)['oneOf'] as Array<Record<string, unknown>>;
        const legacyBranch = branches.find((b) => b['title'] === 'legacy form')!;
        const observationBranch = branches.find((b) => b['title'] === 'observation form')!;
        expect(legacyBranch['required']).toContain('generated');
        expect(observationBranch['required']).not.toContain('generated');
      }
    });

    it('both mirrors document the three states rather than leaving absence to inference', () => {
      // A bare `{type: boolean}` is what let a reader assume two states. The
      // description is the contract an independent implementer builds from.
      for (const source of sources()) {
        const description = (item(source)['properties'] as Record<string, Record<string, unknown>>)[
          'generated'
        ]['description'] as string;
        expect(description).toContain('ABSENT');
        expect(description).toContain('must not collapse absent into false');
        expect(description).toContain('classification, not an observation');
      }
      const [fromJson, fromTs] = sources();
      expect(
        (item(fromTs!)['properties'] as Record<string, Record<string, unknown>>)['generated']['description'],
      ).toBe(
        (item(fromJson!)['properties'] as Record<string, Record<string, unknown>>)['generated']['description'],
      );
    });
  });
});
