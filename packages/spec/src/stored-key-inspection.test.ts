import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inspectStoredKeys } from './stored-key-inspection.js';
import type { StoredKeyDocument, StoredKeyFinding, StoredKeySurface } from './stored-key-inspection.js';
import type { StoredKeyRejection } from './path-identity.js';
import { validate, validateV4 } from './index.js';

// Same corpus, same rule as the validator suite: it is the normative source and
// is consumed DIRECTLY. Reason expectations are never restated here — a local
// copy drifts, and once it does this suite is asserting a private opinion.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(__dirname, '../../../conformance/path-identity/corpus.json');

interface Case {
  id: string;
  kind: string;
  input?: string;
  expect: string;
  reason?: StoredKeyRejection;
}
interface Corpus {
  reasons: Record<string, string>;
  cases: Case[];
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus;
const storedKeyCases = corpus.cases.filter((c) => c.kind === 'storedKey');
const validInputs = storedKeyCases.filter((c) => c.expect === 'valid').map((c) => c.input as string);
const invalidCases = storedKeyCases.filter((c) => c.expect === 'invalid');
const invalidInputs = invalidCases.map((c) => c.input as string);
/** rawKey -> the reason the corpus declares for it. */
const declaredReason = new Map(invalidCases.map((c) => [c.input as string, c.reason as StoredKeyRejection]));

const BASIS_REVISION = '3c9a0f14b7e25d8613af04c2e9b7d5081f6a2c3d';

/**
 * Build a v0.4 document, then prove it is inside the declared input domain
 * before inspecting it.
 *
 * `inspectStoredKeys` accepts a schema-validated document, so a fixture that
 * does not validate would be testing the function outside its contract and the
 * result would mean nothing. Routing every fixture through `validate()` makes
 * that impossible to get wrong by accident — and doubles as the running proof
 * that v0.4 acceptance has not narrowed, since these fixtures are saturated
 * with malformed keys.
 *
 * It throws rather than calling `expect`, because fixtures are built at module
 * scope: a failed `expect` there surfaces as a collection error rather than a
 * named test failure. The acceptance property is asserted with `expect` in its
 * own suite at the bottom of this file.
 */
function accepted(document: unknown): StoredKeyDocument {
  if (!validate(document)) {
    throw new Error('fixture is not a schema-valid document; the test would be out of contract');
  }
  if (!validateV4(document)) {
    throw new Error('fixture is not accepted as v0.4; the test would be out of contract');
  }
  return document;
}

function doc(parts: {
  fileIndex?: Record<string, unknown>;
  coChange?: unknown[];
  fragility?: unknown[];
  manual?: Record<string, unknown>;
}): StoredKeyDocument {
  const generated: Record<string, unknown> = {
    specVersion: '0.4',
    generatedAt: '2026-06-01T00:00:00Z',
    by: { name: 'test', version: '0.1.0' },
    frameworkManifest: [],
    fileIndex: parts.fileIndex ?? {},
  };
  if (parts.coChange) {
    generated['coChange'] = parts.coChange;
    generated['basisRevision'] = BASIS_REVISION;
  }
  if (parts.fragility) generated['fragility'] = parts.fragility;
  return accepted({
    manual: parts.manual ?? {},
    generated,
    agents: {},
    health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 },
  });
}

const fragilityEntry = (file: unknown) => ({
  file,
  changeCount: 1,
  revertCount: 0,
  revertRate: 0,
  fragilityScore: 0,
  excluded: false,
});

const coChangeEntry = (files: unknown[]) => ({
  files,
  support: 1,
  occurrences: 1,
  generated: false,
});

/**
 * Index findings by pointer.
 *
 * Every assertion below goes through this. Findings are location-bearing
 * records and their ORDER IS NOT PART OF THE CONTRACT — a suite that asserted
 * `findings[0]` would pass today and pin an implementation detail that the
 * documentation explicitly refuses to promise.
 */
function byPointer(findings: readonly StoredKeyFinding[]): Map<string, StoredKeyFinding> {
  const map = new Map<string, StoredKeyFinding>();
  for (const finding of findings) {
    expect(map.has(finding.pointer), `duplicate pointer ${finding.pointer}`).toBe(false);
    map.set(finding.pointer, finding);
  }
  return map;
}

/** RFC 6901 token decoding — `~1` before `~0`, the reverse of escaping. */
function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

// ─── clean documents ─────────────────────────────────────────────────────────

describe('a clean document produces no findings', () => {
  it('returns [] for a document with nothing path-bearing at all', () => {
    expect(inspectStoredKeys(doc({}))).toEqual([]);
  });

  it('returns [] when all four surfaces are populated and every key is valid', () => {
    const findings = inspectStoredKeys(
      doc({
        fileIndex: Object.fromEntries(validInputs.map((k) => [k, {}])),
        coChange: [coChangeEntry(['src/a.ts', 'src/b.ts']), coChangeEntry(['.gitignore', 'link'])],
        fragility: validInputs.map(fragilityEntry),
        manual: { fragileFiles: validInputs.map((path) => ({ path, reason: 'human' })) },
      }),
    );
    expect(findings).toEqual([]);
  });

  it('an absent optional path contributes nothing rather than a fabricated finding', () => {
    // The schema does not require `manual.fragileFiles[].path`. There is no
    // stored value here, so there is no rawKey to preserve and nothing to
    // classify. Reporting one would mean inventing a spelling.
    const findings = inspectStoredKeys(doc({ manual: { fragileFiles: [{ reason: 'no path at all' }] } }));
    expect(findings).toEqual([]);
  });
});

// ─── the mixed document: all four surfaces at once ───────────────────────────

describe('a mixed document reports every surface and ignores valid siblings', () => {
  const MALFORMED: Record<StoredKeySurface, string> = {
    'generated.fileIndex': 'src/../x',
    'generated.coChange[].files[]': './leading.ts',
    'generated.fragility[].file': 'C:\\drive\\x.ts',
    'manual.fragileFiles[].path': 'trailing/',
  };

  const mixed = doc({
    fileIndex: { 'src/ok.ts': {}, 'src/../x': {}, '.gitignore': {} },
    coChange: [
      coChangeEntry(['src/ok.ts', 'src/other.ts']), // both valid
      coChangeEntry(['./leading.ts', 'src/ok.ts']), // one malformed, one valid
    ],
    fragility: [fragilityEntry('src/ok.ts'), fragilityEntry('C:\\drive\\x.ts')],
    manual: {
      fragileFiles: [{ path: 'trailing/' }, { path: 'docs/ok.md', reason: 'hand-written, valid' }],
    },
  });

  const findings = inspectStoredKeys(mixed);

  it('reports exactly the four malformed occurrences and nothing else', () => {
    expect(findings.length).toBe(4);
  });

  it('reports one finding on each of the four ratified surfaces', () => {
    const bySurface = new Map(findings.map((f) => [f.surface, f]));
    expect([...bySurface.keys()].sort()).toEqual(
      (Object.keys(MALFORMED) as StoredKeySurface[]).sort(),
    );
    for (const [surface, rawKey] of Object.entries(MALFORMED) as [StoredKeySurface, string][]) {
      expect(bySurface.get(surface)?.rawKey).toBe(rawKey);
    }
  });

  it('points at each occurrence exactly, with exact array indexes', () => {
    expect([...byPointer(findings).keys()].sort()).toEqual(
      [
        '/generated/fileIndex/src~1..~1x',
        '/generated/coChange/1/files/0',
        '/generated/fragility/1/file',
        '/manual/fragileFiles/0/path',
      ].sort(),
    );
  });

  it('classifies each with the reason the corpus declares', () => {
    for (const finding of findings) {
      expect(finding.reason).toBe(declaredReason.get(finding.rawKey));
    }
  });

  it('leaves every valid sibling unreported', () => {
    const reported = new Set(findings.map((f) => f.rawKey));
    for (const valid of ['src/ok.ts', 'src/other.ts', '.gitignore', 'docs/ok.md']) {
      expect(reported.has(valid)).toBe(false);
    }
  });

  it('does not mutate the document', () => {
    const before = JSON.stringify(mixed);
    inspectStoredKeys(mixed);
    expect(JSON.stringify(mixed)).toBe(before);
  });

  it('is a pure read: repeated calls give the same findings', () => {
    expect(JSON.stringify(inspectStoredKeys(mixed))).toBe(JSON.stringify(findings));
  });
});

// ─── every corpus rejection, on every surface ────────────────────────────────

/**
 * The saturation document: every invalid corpus vector placed on every surface,
 * alongside every valid one. This is where the "the reason is the corpus's, not
 * a local opinion" claim is actually earned, across all twelve classifications.
 */
const distinctInputs = [...new Set(storedKeyCases.map((c) => c.input as string))];

const saturated = doc({
  // Object keys collapse duplicates by construction, so the distinct set is used.
  fileIndex: Object.fromEntries(distinctInputs.map((k) => [k, {}])),
  // Each malformed vector paired with a known-valid sibling.
  coChange: invalidInputs.map((bad) => coChangeEntry([bad, 'src/ok.ts'])),
  // Arrays keep duplicates, so every vector including the repeated `a.ts`.
  fragility: storedKeyCases.map((c) => fragilityEntry(c.input)),
  manual: { fragileFiles: storedKeyCases.map((c) => ({ path: c.input })) },
});

describe('every corpus rejection is reported, on every surface, with its declared reason', () => {
  const findings = inspectStoredKeys(saturated);

  it('reports every malformed occurrence and no valid one', () => {
    const perSurface: Record<StoredKeySurface, number> = {
      'generated.fileIndex': invalidInputs.length,
      'generated.coChange[].files[]': invalidInputs.length,
      'generated.fragility[].file': invalidInputs.length,
      'manual.fragileFiles[].path': invalidInputs.length,
    };
    const counted = findings.reduce<Record<string, number>>((acc, f) => {
      acc[f.surface] = (acc[f.surface] ?? 0) + 1;
      return acc;
    }, {});
    expect(counted).toEqual(perSurface);
    expect(findings.length).toBe(invalidInputs.length * 4);
  });

  it('gives every finding the reason the corpus declares for that spelling', () => {
    const mismatches = findings
      .filter((f) => f.reason !== declaredReason.get(f.rawKey))
      .map((f) => `${f.pointer}: expected ${declaredReason.get(f.rawKey)}, got ${f.reason}`);
    expect(mismatches).toEqual([]);
  });

  it('exercises every reason the corpus declares — no classification goes untested', () => {
    const exercised = new Set(findings.map((f) => f.reason));
    expect([...exercised].sort()).toEqual(Object.keys(corpus.reasons).sort());
  });

  it('only ever emits reasons the corpus declares', () => {
    const declared = new Set(Object.keys(corpus.reasons));
    for (const f of findings) expect(declared.has(f.reason)).toBe(true);
  });

  it('every pointer is distinct — one finding per location', () => {
    expect(new Set(findings.map((f) => f.pointer)).size).toBe(findings.length);
  });
});

// ─── duplicates are locations, not values ────────────────────────────────────

describe('repeated malformed spellings are not deduplicated', () => {
  const REPEATED = 'src/../x';

  it('the same spelling at four locations yields four distinct findings', () => {
    const findings = inspectStoredKeys(
      doc({
        fileIndex: { [REPEATED]: {} },
        coChange: [coChangeEntry([REPEATED, 'src/ok.ts'])],
        fragility: [fragilityEntry(REPEATED)],
        manual: { fragileFiles: [{ path: REPEATED }] },
      }),
    );
    expect(findings.length).toBe(4);
    expect(new Set(findings.map((f) => f.rawKey))).toEqual(new Set([REPEATED]));
    expect([...byPointer(findings).keys()].sort()).toEqual(
      [
        '/generated/fileIndex/src~1..~1x',
        '/generated/coChange/0/files/0',
        '/generated/fragility/0/file',
        '/manual/fragileFiles/0/path',
      ].sort(),
    );
  });

  it('the same spelling twice within one surface yields two findings with distinct indexes', () => {
    const findings = inspectStoredKeys(
      doc({ fragility: [fragilityEntry(REPEATED), fragilityEntry('src/ok.ts'), fragilityEntry(REPEATED)] }),
    );
    expect(findings.length).toBe(2);
    expect([...byPointer(findings).keys()].sort()).toEqual([
      '/generated/fragility/0/file',
      '/generated/fragility/2/file',
    ]);
  });

  it('both halves of one co-change pair are reported independently', () => {
    const findings = inspectStoredKeys(
      doc({ coChange: [coChangeEntry(['double//sep.ts', 'double//sep.ts'])] }),
    );
    expect(findings.length).toBe(2);
    expect([...byPointer(findings).keys()].sort()).toEqual([
      '/generated/coChange/0/files/0',
      '/generated/coChange/0/files/1',
    ]);
  });
});

// ─── RFC 6901 escaping ───────────────────────────────────────────────────────

describe('pointer escaping is RFC 6901, in the right order', () => {
  // Every one of these is malformed AND contains a character needing escaping.
  // A valid key containing `/` produces no finding at all, so the escaping rule
  // is only reachable through keys like these.
  const VECTORS: Array<[rawKey: string, expectedPointer: string]> = [
    ['./leading.ts', '/generated/fileIndex/.~1leading.ts'],
    ['src/../x', '/generated/fileIndex/src~1..~1x'],
    ['trailing/', '/generated/fileIndex/trailing~1'],
    ['double//sep.ts', '/generated/fileIndex/double~1~1sep.ts'],
    ['~/../x.ts', '/generated/fileIndex/~0~1..~1x.ts'],
    ['a~b//c.ts', '/generated/fileIndex/a~0b~1~1c.ts'],
    // A key already containing the literal text `~0`. Escaping `/` first would
    // produce `~01` here and silently corrupt the pointer.
    ['lit~0/../x', '/generated/fileIndex/lit~00~1..~1x'],
  ];

  it.each(VECTORS)('%j escapes to %j', (rawKey, expectedPointer) => {
    const findings = inspectStoredKeys(doc({ fileIndex: { [rawKey]: {} } }));
    expect(findings.length).toBe(1);
    expect(findings[0]?.pointer).toBe(expectedPointer);
  });

  it('every pointer round-trips back to the exact stored key', () => {
    // The end-to-end property the escaping exists for: a consumer that decodes
    // the pointer recovers the key that was actually stored, byte for byte.
    for (const [rawKey] of VECTORS) {
      const findings = inspectStoredKeys(doc({ fileIndex: { [rawKey]: {} } }));
      const token = (findings[0] as StoredKeyFinding).pointer.slice('/generated/fileIndex/'.length);
      expect(decodePointerToken(token)).toBe(rawKey);
      expect(findings[0]?.rawKey).toBe(rawKey);
    }
  });

  it('escapes in the property token only, never the structural separators', () => {
    const findings = inspectStoredKeys(doc({ fileIndex: { 'trailing/': {} } }));
    const pointer = (findings[0] as StoredKeyFinding).pointer;
    // Three structural separators — `/generated` `/fileIndex` `/<token>` — and
    // the key's own `/` escaped to `~1` inside the token rather than adding a
    // fourth. A pointer with four separators would address a nested member that
    // does not exist.
    expect(pointer.split('/')).toHaveLength(4);
    expect(pointer).toBe('/generated/fileIndex/trailing~1');
  });

  it('escaping is not applied to array-index pointers, which need none', () => {
    const findings = inspectStoredKeys(doc({ fragility: [fragilityEntry('trailing/')] }));
    expect(findings[0]?.pointer).toBe('/generated/fragility/0/file');
  });
});

// ─── identity-preserving keys produce nothing ────────────────────────────────

describe('valid keys that differ only by case or Unicode form are all valid', () => {
  it('case-distinct keys coexist and neither is reported', () => {
    const findings = inspectStoredKeys(
      doc({
        fileIndex: { 'A.ts': {}, 'a.ts': {} },
        fragility: [fragilityEntry('A.ts'), fragilityEntry('a.ts')],
      }),
    );
    expect(findings).toEqual([]);
  });

  it('NFC and NFD spellings coexist and neither is reported', () => {
    const nfc = 'caf\u00e9.ts';
    const nfd = 'cafe\u0301.ts';
    expect(nfc).not.toBe(nfd);
    const document = doc({
      fileIndex: { [nfc]: {}, [nfd]: {} },
      coChange: [coChangeEntry([nfc, nfd])],
      manual: { fragileFiles: [{ path: nfc }, { path: nfd }] },
    });
    // Both really are present as two separate keys — nothing collapsed them.
    expect(Object.keys((document as { generated: { fileIndex: object } }).generated.fileIndex)).toHaveLength(2);
    expect(inspectStoredKeys(document)).toEqual([]);
  });

  it('a genuine U+FFFD is a real pathname character, not evidence of lossy decoding', () => {
    // Rejecting it would make a real file unstorable. The bytes needed to tell a
    // genuine U+FFFD from a substituted one do not exist at this layer.
    const findings = inspectStoredKeys(
      doc({
        fileIndex: { 'bad\ufffd.ts': {}, '\ufffd': {} },
        fragility: [fragilityEntry('bad\ufffd.ts')],
        manual: { fragileFiles: [{ path: '\ufffd' }] },
      }),
    );
    expect(findings).toEqual([]);
  });

  it('an unpaired surrogate, by contrast, is reported', () => {
    const findings = inspectStoredKeys(doc({ fileIndex: { 'lone\ud800.ts': {} } }));
    expect(findings.length).toBe(1);
    expect(findings[0]?.reason).toBe('unpaired-surrogate');
  });
});

// ─── manual.coChangePatterns stays deferred ──────────────────────────────────

describe('manual.coChangePatterns is not guessed at', () => {
  // ADR-003 A-005 dispositions this surface "Keep and specify" and records that
  // its items are still bare objects. The packaged schema constrains them to
  // `{"type": "object"}` and nothing more. `types.ts` declares `files: string[]`,
  // but that is an authoring-time convenience no record has ratified.
  //
  // Inspecting a presumed `files` field would promote that TypeScript assumption
  // into a normative contract, in an implementation, ahead of the record that
  // decides it. These tests fail if someone adds the walk before A-005 ratifies
  // the item profile — which is the intended alarm.

  const withPatterns = doc({
    manual: {
      coChangePatterns: [
        { files: ['src/../x', './leading.ts'], note: 'the shape types.ts assumes' },
        { paths: ['trailing/'] },
        { files: 'not even an array' },
      ],
    },
  });

  it('reports nothing from a coChangePatterns full of malformed spellings', () => {
    expect(inspectStoredKeys(withPatterns)).toEqual([]);
  });

  it('emits no pointer into manual/coChangePatterns even when other surfaces are dirty', () => {
    const document = doc({
      fileIndex: { 'src/../x': {} },
      manual: {
        fragileFiles: [{ path: 'trailing/' }],
        coChangePatterns: [{ files: ['./leading.ts', 'double//sep.ts'] }],
      },
    });
    const findings = inspectStoredKeys(document);
    // The two dirty ratified surfaces are reported; the deferred one is not,
    // even though its malformed spellings sit in the same `manual` object.
    expect(findings.length).toBe(2);
    expect([...byPointer(findings).keys()].sort()).toEqual([
      '/generated/fileIndex/src~1..~1x',
      '/manual/fragileFiles/0/path',
    ]);
  });

  it('the schema still ratifies nothing about the item shape', () => {
    // If this ever tightens, A-005 has moved and the deferral above must be
    // revisited deliberately rather than discovered by drift.
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, '../schema/v1.json'), 'utf8'),
    ) as { properties: { manual: { properties: { coChangePatterns: { items: unknown } } } } };
    expect(schema.properties.manual.properties.coChangePatterns.items).toEqual({ type: 'object' });
  });
});

// ─── no repaired spelling, anywhere ──────────────────────────────────────────

describe('inspection never returns a repaired spelling', () => {
  it('exposes only the four declared members on every finding', () => {
    for (const finding of inspectStoredKeys(saturated)) {
      expect(Object.keys(finding).sort()).toEqual(['pointer', 'rawKey', 'reason', 'surface']);
    }
  });

  it('carries the malformed key verbatim, and never what a normalizer would yield', () => {
    // The same five keys ADR-006 §3 names as silently repaired at the pinned
    // revisions. Asserted against VALUES, not a serialized substring scan: a
    // pointer legitimately embeds the escaped key, so `src~1..~1x` contains the
    // letter `x` and a substring test would report a repair that is not there.
    const repairedByNormalization: Array<[malformed: string, whatANormalizerYields: string]> = [
      ['src/../x', 'x'],
      ['a/b/../b/c.ts', 'a/b/c.ts'],
      ['./leading.ts', 'leading.ts'],
      ['double//sep.ts', 'double/sep.ts'],
      ['trailing/', 'trailing'],
    ];

    for (const [malformed, whatANormalizerYields] of repairedByNormalization) {
      const findings = inspectStoredKeys(
        doc({
          fileIndex: { [malformed]: {} },
          coChange: [coChangeEntry([malformed, 'src/ok.ts'])],
          fragility: [fragilityEntry(malformed)],
          manual: { fragileFiles: [{ path: malformed }] },
        }),
      );
      expect(findings.length).toBe(4);
      for (const finding of findings) {
        expect(finding.rawKey).toBe(malformed);
        expect(Object.values(finding)).not.toContain(whatANormalizerYields);
      }
    }
  });

  it('a valid key is never reported, so no result can carry a canonicalized form', () => {
    for (const input of validInputs) {
      expect(inspectStoredKeys(doc({ fileIndex: { [input]: {} } }))).toEqual([]);
    }
  });
});

// ─── the compatibility boundary, again ───────────────────────────────────────
// ADR-006 §9: a v0.4.x reader REPORTS and DECLINES TO MATCH. Adding the
// reporting half must not have narrowed acceptance. Every fixture above already
// passes through `accepted()`, which calls validate() and validateV4(); this
// suite states the property directly so it cannot be lost if that helper changes.

describe('v0.4 document acceptance is unchanged by the existence of inspection', () => {
  it('accepts the saturated document — every corpus rejection, on every surface', () => {
    expect(validate(saturated)).toBe(true);
    expect(validateV4(saturated)).toBe(true);
    expect(inspectStoredKeys(saturated).length).toBe(invalidInputs.length * 4);
  });

  it('validate() still does not consult the stored-key grammar', () => {
    // Accepted despite being full of malformed keys...
    const dirty = doc({ fileIndex: { '..': {}, 'C:/drive/x.ts': {} } });
    expect(validate(dirty)).toBe(true);
    expect(inspectStoredKeys(dirty).length).toBe(2);
    // ...and still rejected for an actual schema violation.
    expect(validate({ ...(dirty as object), unsupported: true })).toBe(false);
  });

  it('a document is either inspectable or invalid — the two questions stay separate', () => {
    // The composition the documentation prescribes. A schema-invalid value never
    // reaches inspection, so `[]` cannot be confused with "never checked".
    const raw: unknown = { manual: {}, generated: { specVersion: '0.9' } };
    expect(validate(raw)).toBe(false);
  });
});
