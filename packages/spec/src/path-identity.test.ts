import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateStoredKey } from './path-identity.js';
import type { StoredKeyRejection } from './path-identity.js';
import { validate, validateV4 } from './index.js';

// The corpus is the normative source and is consumed DIRECTLY. Its vectors are
// deliberately not copied into a second handwritten fixture set here: a
// duplicate drifts, and the moment it does, the implementation is being tested
// against a private opinion rather than against the published contract.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(__dirname, '../../../conformance/path-identity/corpus.json');

interface Case {
  id: string;
  kind: string;
  input?: string;
  inputs?: string[];
  storedKey?: string;
  query?: string;
  expect: string;
  reason?: StoredKeyRejection;
  note?: string;
}
interface Corpus {
  corpusVersion: number;
  delegation: { executedHere: string[]; delegated: string[] };
  reasons: Record<string, string>;
  cases: Case[];
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus;
const byKind = (kind: string) => corpus.cases.filter((c) => c.kind === kind);

describe('the corpus this suite is driven by', () => {
  it('is the merged normative corpus, not a local copy', () => {
    expect(corpus.corpusVersion).toBe(1);
    expect(corpus.cases.length).toBeGreaterThan(0);
  });

  it('declares the kinds this repository executes', () => {
    expect(corpus.delegation.executedHere).toEqual(['storedKey', 'identity', 'matching']);
  });

  // Delegated cases stay delegated. If a filesystem or raw-byte case ever
  // appeared in `executedHere`, this suite would silently start asserting
  // something it cannot actually decide.
  it('leaves filesystem and raw-byte cases delegated', () => {
    expect(corpus.delegation.delegated).toEqual(['hostQuery', 'discovery', 'acquisition']);
    for (const kind of corpus.delegation.delegated) {
      expect(byKind(kind).length).toBeGreaterThan(0);
    }
  });
});

// ─── storedKey ───────────────────────────────────────────────────────────────

describe('validateStoredKey — every storedKey vector', () => {
  const cases = byKind('storedKey');

  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const result = validateStoredKey(c.input as string);
    expect(result.valid).toBe(c.expect === 'valid');
  });

  it('classifies every rejection with the reason the corpus declares', () => {
    const mismatches: string[] = [];
    for (const c of cases.filter((x) => x.expect === 'invalid')) {
      const result = validateStoredKey(c.input as string);
      if (result.valid) continue;
      if (result.reason !== c.reason) {
        mismatches.push(`${c.id}: expected ${c.reason}, got ${result.reason}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('only ever emits reasons the corpus declares', () => {
    const declared = new Set(Object.keys(corpus.reasons));
    for (const c of cases) {
      const result = validateStoredKey(c.input as string);
      if (!result.valid) expect(declared.has(result.reason)).toBe(true);
    }
  });

  it('returns the input unchanged for every valid key — no repaired spelling', () => {
    for (const c of cases.filter((x) => x.expect === 'valid')) {
      const result = validateStoredKey(c.input as string);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.key).toBe(c.input);
    }
  });

  it('exposes no repaired key on any rejection', () => {
    for (const c of cases.filter((x) => x.expect === 'invalid')) {
      const result = validateStoredKey(c.input as string);
      // The shape itself is the guarantee: a rejection carries a reason and
      // nothing a caller could mistake for a usable key.
      expect(Object.keys(result).sort()).toEqual(['reason', 'valid']);
    }
  });
});

// ─── identity ────────────────────────────────────────────────────────────────

describe('validateStoredKey — identity vectors stay distinct', () => {
  it.each(byKind('identity').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const [a, b] = c.inputs as [string, string];
    const ra = validateStoredKey(a);
    const rb = validateStoredKey(b);

    // Both spellings are VALID. A corpus pair that classified either as noise
    // or invalid would encode the defect it exists to prevent.
    expect(ra.valid).toBe(true);
    expect(rb.valid).toBe(true);

    // And they remain two keys, not one.
    expect(a).not.toBe(b);
    if (ra.valid && rb.valid) expect(ra.key).not.toBe(rb.key);
  });
});

// ─── matching ────────────────────────────────────────────────────────────────

/**
 * Matching per ADR-006 §8: exact string equality over canonical keys, with a
 * malformed stored key participating in no lookup at all.
 *
 * This is the comparison rule the standard defines, expressed in terms of the
 * validator. It is not a second exported API — §10 leaves host containment to
 * integrations, and nothing here touches a filesystem.
 */
function storedKeyMatches(storedKey: string, query: string): boolean {
  const stored = validateStoredKey(storedKey);
  if (!stored.valid) return false; // declines to match, including its repaired value
  return stored.key === query;
}

describe('matching — every matching vector', () => {
  it.each(byKind('matching').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(storedKeyMatches(c.storedKey as string, c.query as string)).toBe(c.expect === 'match');
  });

  it('a malformed key matches neither its repaired value nor itself', () => {
    expect(storedKeyMatches('src/../a.ts', 'a.ts')).toBe(false);
    expect(storedKeyMatches('src/../a.ts', 'src/../a.ts')).toBe(false);
  });
});

// ─── mutation tests ──────────────────────────────────────────────────────────
// These fail if the implementation is ever changed into a normalizer. They are
// the guard on the property that the whole record exists to protect, so they
// assert it directly rather than trusting the vectors to cover it.

describe('mutation guards — normalizing or repairing must fail', () => {
  it('rejects each of the five keys a normalizer silently repairs', () => {
    // The exact set ADR-006 §3 names, and the set the historical witness
    // measured being repaired at the pinned revisions.
    const repairedByNormalization: Array<[string, string]> = [
      ['src/../x', 'x'],
      ['a/b/../b/c.ts', 'a/b/c.ts'],
      ['./leading.ts', 'leading.ts'],
      ['double//sep.ts', 'double/sep.ts'],
      ['trailing/', 'trailing'],
    ];
    for (const [malformed, whatANormalizerYields] of repairedByNormalization) {
      const result = validateStoredKey(malformed);
      expect(result.valid).toBe(false);
      // And crucially: the repaired spelling is not reachable from the result.
      // Checked against the VALUES rather than the serialized object — reason
      // names legitimately share words with paths (`trailing-separator`
      // contains "trailing"), so a substring scan reports a repair that is not
      // there. Asserting on values is the claim actually being made: no field
      // hands a caller the normalized key.
      expect('key' in result).toBe(false);
      expect(Object.values(result)).not.toContain(whatANormalizerYields);
    }
  });

  it('a valid result is byte-identical to its input, never a canonicalized form', () => {
    // If someone "helpfully" normalized on the valid path, these would collapse.
    for (const key of ['a.ts', 'src/a.ts', 'caf\u00e9.ts', 'cafe\u0301.ts', 'A.ts', 'a.ts', 'weird\nname.ts']) {
      const result = validateStoredKey(key);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.key).toBe(key);
    }
  });

  it('is filesystem-free — no path or fs symbol appears in the module source', () => {
    const source = readFileSync(resolve(__dirname, 'path-identity.ts'), 'utf8');
    // Comments legitimately discuss `node:path`, so the check targets imports.
    const imports = source.match(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?$/gm) ?? [];
    expect(imports).toEqual([]);
  });

  it('is total — never throws, whatever it is handed', () => {
    const hostile: unknown[] = [
      undefined, null, 0, 1, true, false, {}, [], Symbol('x'), 123n,
      '\u0000', '\ud800', '\udfff', '\ud800\udc00', 'a'.repeat(100_000), '/'.repeat(1000),
    ];
    for (const value of hostile) {
      expect(() => validateStoredKey(value as string)).not.toThrow();
    }
  });

  it('is deterministic — the same input yields the same verdict every time', () => {
    for (const key of ['src/a.ts', 'src/../a.ts', './x', 'C:\\x']) {
      const first = JSON.stringify(validateStoredKey(key));
      for (let i = 0; i < 50; i += 1) expect(JSON.stringify(validateStoredKey(key))).toBe(first);
    }
  });

  it('a well-formed surrogate pair is valid; a lone half is not', () => {
    expect(validateStoredKey('emoji\ud83d\ude00.ts').valid).toBe(true);
    expect(validateStoredKey('lone\ud800.ts')).toEqual({ valid: false, reason: 'unpaired-surrogate' });
    expect(validateStoredKey('lone\udfff.ts')).toEqual({ valid: false, reason: 'unpaired-surrogate' });
  });

  it('does not treat U+FFFD as evidence of lossy decoding', () => {
    // The discrimination needs the original bytes and belongs to acquisition.
    // A validator that rejected U+FFFD would make a real pathname unstorable.
    expect(validateStoredKey('bad\ufffd.ts')).toEqual({ valid: true, key: 'bad\ufffd.ts' });
    expect(validateStoredKey('\ufffd').valid).toBe(true);
  });
});

// ─── the compatibility boundary ──────────────────────────────────────────────
// ADR-006 §9: in the v0.4.x line a reader REPORTS a malformed key and DECLINES
// to match it, while continuing over the well-formed remainder. Packaged
// document validation must therefore keep accepting artifacts that carry a
// malformed key. Narrowing it is a v0.5 document-profile transition and is not
// authorized here.
//
// This suite is the guard on that boundary. If a future change wires
// validateStoredKey into validate(), these fail — which is the intended alarm,
// not an inconvenience.

describe('v0.4 document acceptance did not narrow', () => {
  const docWith = (generated: Record<string, unknown>) => ({
    manual: {},
    generated: {
      specVersion: '0.4',
      generatedAt: '2026-06-01T00:00:00Z',
      by: { name: 'test', version: '0.1.0' },
      frameworkManifest: [],
      fileIndex: {},
      ...generated,
    },
    agents: {},
    health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 },
  });

  it('accepts a document whose fileIndex carries a malformed key', () => {
    const doc = docWith({ fileIndex: { 'src/../a.ts': {}, 'src/ok.ts': {} } });
    expect(validateStoredKey('src/../a.ts').valid).toBe(false);
    expect(validate(doc)).toBe(true);
    expect(validateV4(doc)).toBe(true);
  });

  it('accepts malformed keys on every path-bearing surface at once', () => {
    const doc = docWith({
      basisRevision: '3c9a0f14b7e25d8613af04c2e9b7d5081f6a2c3d',
      fileIndex: { './leading.ts': {} },
      coChange: [{ files: ['a//b.ts', 'trailing/'], support: 1, occurrences: 2, generated: false }],
      fragility: [
        { file: '..', changeCount: 1, revertCount: 0, revertRate: 0, fragilityScore: 0, excluded: false },
      ],
    });
    for (const malformed of ['./leading.ts', 'a//b.ts', 'trailing/', '..']) {
      expect(validateStoredKey(malformed).valid).toBe(false);
    }
    // Every one of them is malformed, and the document still validates.
    expect(validate(doc)).toBe(true);
    expect(validateV4(doc)).toBe(true);
  });

  it('accepts a malformed manual.fragileFiles path', () => {
    const doc = {
      ...docWith({}),
      manual: { fragileFiles: [{ path: 'C:\\drive\\x.ts', reason: 'legacy producer' }] },
    };
    expect(validateStoredKey('C:\\drive\\x.ts').valid).toBe(false);
    expect(validate(doc)).toBe(true);
  });

  it('validate() is unchanged: it does not consult validateStoredKey', () => {
    // A document that is schema-valid and full of malformed keys is accepted,
    // and one that is schema-invalid is still rejected. The two concerns stay
    // separate, which is what "report and decline to match" requires.
    expect(validate(docWith({ fileIndex: { '..': {} } }))).toBe(true);
    expect(validate({ ...docWith({}), unsupported: true })).toBe(false);
  });
});
