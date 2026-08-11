# Conformance

This document describes how to check that an implementation conforms to
`workspace.json`, and what this repository verifies about itself.

It is deliberately explicit about what is **not** yet covered. A conformance
document that implies more coverage than exists is worse than none.

## What conformance means here

There are two roles, with different obligations.

**A producer** writes `.agents/workspace.json`. It conforms when:

- it writes to the canonical path — see [ADR-001](./adr/001-canonical-artifact-path.md);
- its output validates against the packaged schema;
- it declares `generated.specVersion` matching the profile it emits;
- it preserves the `manual` section verbatim across regeneration, replacing only
  the producer-owned `generated`, `agents` and `health` sections;
- it writes only when its material projection changes — timestamps identify the
  last material generation, not the last command invocation.

**A consumer** reads the artifact. It conforms when:

- it validates before reading, rather than trusting shape;
- it treats the four stable read paths as its safe surface;
- it distinguishes human-authored `manual` evidence from machine-generated
  `generated` evidence and does not silently merge them;
- it surfaces missing evidence as missing rather than as a negative finding.

That last point is the one implementations most often get wrong. An absent
`manual.fragileFiles` means the maintainer declared nothing, not that no file is
fragile.

`generated.coChange` makes the same distinction in four states, and a consumer
that collapses them reports a producer gap as a repository fact:

| Shape | Means |
| -- | -- |
| `coChange` absent | Not analyzed. Asserts nothing. |
| `coChange: []`, no `basisRevision` | Legacy / unknown. **Not** evidence that the repository has no co-changing pairs. |
| `coChange: []`, with `basisRevision` | Analyzed at that revision; no qualifying pairs. A positive finding. |
| `basisRevision` ≠ the repository's current revision | The observations are real but describe an earlier revision. Stale, not absent. |

The per-entry `generated` flag repeats the pattern at one level down, and it is
the same mistake in a smaller place. It is a **classification, not an
observation**: it cannot be read off the commit graph, this standard specifies no
portable deterministic classifier, and so it is **optional in the observation
form** and carries three states.

| Value | Means |
| -- | -- |
| `true` | Classified as tooling-coupled — skip when surfacing real source couplings. |
| `false` | Classified as **not** tooling-coupled. |
| absent | **No classification performed.** The producer asserts nothing either way. |

A reader must not collapse absent into `false`. Doing so converts a producer's
silence into a positive claim that the pair is a real source coupling — so
`if (!entry.generated)` is a defect, not a shorthand, and `undefined` needs its
own branch. The flag remains **required in the deprecated legacy form**, where
every published artifact already carries it. See ADR-003 A-010.

## Checking a document

The packaged validator is the reference implementation. Do not re-implement it —
a second validator is a second source of truth, and they drift.

```bash
npm install @workspacejson/spec
npx workspacejson-spec validate path/to/workspace.json
```

The binary exits `0` on a valid document and non-zero otherwise. It has exactly
one command, `validate <file>`; there is no `--help` flag, and any other
invocation exits non-zero with usage.

Programmatically:

```ts
import { validate, validateV4, validateLegacy } from '@workspacejson/spec';

validate(doc);        // true for a valid v0.3 or v0.4 document
validateV4(doc);      // true for a valid v0.4 document
validateLegacy(doc);  // true for a legacy v0.1/v0.2 document
```

To pin the schema in your own test suite, materialize it from the package rather
than copying it:

```ts
import schema from '@workspacejson/spec/schema' with { type: 'json' };
```

## Fixtures shipped by this repository

Eleven executable examples live in
[`packages/spec/examples/`](../packages/spec/examples/):

| Example | Profile | Demonstrates |
| -- | -- | -- |
| `minimal-v0.3.json` | v0.3 | The smallest conforming document |
| `populated-v0.3.json` | v0.3 | Every v0.3 section populated |
| `with-manual-block-v0.3.json` | v0.3 | Human-authored `manual` evidence |
| `populated-v0.4.json` | v0.4 | Every v0.4 section populated |
| `cochange-observations-v0.4.json` | v0.4 | Observation form: raw counts, a zero-support observation, and `support == occurrences`. Its pair is stored in **non-canonical order** as a reader-tolerance fixture — **not** reference-producer output; new producers canonicalize by ascending UTF-8 bytes. See the ordering note under *Known gaps*. |
| `cochange-legacy-rate-v0.4.json` | v0.4 | Legacy form with no basis pin — executable proof that the A-009 widening invalidates no published artifact |
| `cochange-legacy-head-basis-v0.4.json` | v0.4 | Legacy artifact carrying `basisRevision: "HEAD"` — the regression guard proving the object-ID pattern is scoped to the observation form and not global |
| `cochange-absent-v0.4.json` | v0.4 | State: **not analyzed** — `coChange` absent |
| `cochange-empty-unpinned-v0.4.json` | v0.4 | State: **legacy / unknown** — empty array, no pin; not evidence of zero |
| `cochange-empty-pinned-v0.4.json` | v0.4 | State: **analyzed, no qualifying pairs** — empty array with a pin |
| `cochange-unclassified-v0.4.json` | v0.4 | State: **unclassified** — observation form in which every entry omits `generated`, carrying an unflagged lockfile pair on purpose, so a reader that resolves absence to `false` is visibly wrong against it |

Twelve **negative** fixtures live alongside them in
[`packages/spec/examples/invalid/`](../packages/spec/examples/invalid/), each
carrying a `generated.$comment` naming the single defect it exhibits:

| Fixture | Must be rejected because | Rejected by |
| -- | -- | -- |
| `cochange-negative-support.json` | A count of commits cannot be below zero | schema and validator |
| `cochange-non-integer-occurrences.json` | Counts are distinct commits, not a continuous measure | schema and validator |
| `cochange-missing-basis-revision.json` | An observation-form entry that names no revision cannot be recounted | schema and validator |
| `cochange-abbreviated-basis-revision.json` | An abbreviated object name does not name one commit permanently | schema and validator |
| `cochange-both-representations.json` | One entry carrying `rate` *and* `support` leaves a reader unable to know which was measured | schema and validator |
| `cochange-neither-representation.json` | An `occurrences` with no numerator is not an observation in either form | schema and validator |
| `cochange-mixed-forms.json` | The array mixes forms; each entry is individually well-formed, so only collection homogeneity catches it | schema and validator |
| `cochange-zero-denominator.json` | Observation-form `occurrences: 0` — a pair never observed has no entry, not a zero denominator | schema and validator |
| `cochange-both-forms-zero-occurrences.json` | Both `rate` and `support`, disguised by `occurrences: 0` — the adversarial case that defeated an earlier `oneOf` | schema and validator |
| `cochange-mixed-forms-disguised.json` | A mixed array whose second entry is a disguised both-form entry, which the earlier rule read as homogeneously legacy | schema and validator |
| `cochange-legacy-missing-generated.json` | The legacy form still requires `generated`; A-010 widened the observation form only | schema and validator |
| `cochange-support-exceeds-occurrences.json` | `support` counts a subset of what `occurrences` counts | **validator only** — see below |

That last row is the one asymmetry in the bundle, and it is stated here rather
than left to be discovered. The **bare packaged schema accepts** that document;
only the **reference validator rejects** it. Both directions are pinned by test
in `packages/spec/src/index.test.ts`, which also asserts that every *other*
negative fixture is rejected by the bare schema as well — so the asymmetry
cannot silently widen to a second obligation.

Every one of them is checked against the package-owned schema in CI by
`pnpm run check:examples`, using the package's own validator rather than a
re-implementation. Positives must validate. Negatives must be rejected by both
`validate()` and `validateLegacy()` — but **the two checks are not equally
informative, and only the first is evidence about the named defect**:

| Check | What a rejection proves |
| -- | -- |
| `validate()` | **Substantive.** The current schema rejects the named defect. |
| `validateLegacy()` | **Structural only.** It never inspects the defect. It keys on the *absence* of `generated.specVersion`, so it rejects every one of these fixtures for declaring a v0.4 profile — defect or no defect. What it covers is that a rejected v0.4 document cannot be re-admitted through the legacy path. |

Both are required, because a fixture accepted by either would reach a consumer.
Reading the second as independent confirmation of the defect would overstate what
the gate measures. The gate fails if either directory is empty, so it cannot pass
vacuously in either direction.

Reason-specificity is what makes a negative fixture worth shipping — a document
rejected for an unrelated defect proves nothing about the one it is named for.
The fixtures put their comment inside `generated`, which is
`additionalProperties: true`, so the comment is never itself the reason. The
attribution itself is pinned by the one-field perturbation tests in
`packages/spec/src/index.test.ts`, which change exactly one field of a valid
document per case.

If an example contradicts the schema, the fix is to the example. Weakening the
schema to make an example pass is explicitly prohibited in the gate's own
failure message — as is deleting a negative fixture the validator has stopped
rejecting, which is the regression it exists to catch.

The rule engine additionally ships fixtures under
[`packages/rules/src/testing/fixtures/`](../packages/rules/src/testing/fixtures/):
`AGENTS.md` documents covering eight repository shapes, and three miniature
repositories — a clean TypeScript project, a TypeScript monorepo and a Python
package — used by the scanner and rule tests.

`@workspacejson/rules` exports a `RuleTester` from its `./testing` entry point
for authoring rule tests against those fixtures.

## Verifying the schema you received

```bash
pnpm run check:schema
```

This prints the canonical path, byte length, SHA-256, `$id`, `$schema` and the
resolved `./schema` export, then asserts that:

1. the canonical schema exists at exactly one path;
2. `exports["./schema"]` resolves to that same file;
3. the packed tarball includes it — `files` covers `schema`;
4. all four stable read paths are present.

Measured on the current branch, after the A-009 amendment:

```text
path        packages/spec/schema/v1.json
bytes       14184
sha256      6ff46cb520c3bff5cf6f453e3fbb7d149b61c0e81d5442ed99218f869b451853
$id         https://workspacejson.dev/schema/v1.json
$schema     https://json-schema.org/draft/2020-12/schema
```

Those values are a snapshot, not a guarantee. Re-run the command against the
version you actually installed — that is what pinning means.

## What this repository verifies about itself

CI runs on Node 20 and 22. In order:

| Gate | Command | What it proves |
| -- | -- | -- |
| Architecture and clean-room guards | `check:architecture` | No cross-repository dependency, no proprietary reference, one schema copy, no publish capability |
| Guard red tests | `check:architecture:test` | Each guard rejects a deliberate violation, plus a baseline case proving the guards accept a clean tree |
| Build | `pnpm -r build` | Both packages compile and emit declarations |
| Typecheck | `pnpm -r typecheck` | Types resolve against emitted declarations |
| Tests | `pnpm -r test` | Unit and integration suites |
| Tarball verification | `release:verify-packs` | No `workspace:` protocol reaches a packed manifest |
| Schema provenance | `check:schema` | The four assertions above |
| Executable examples | `check:examples` | Every shipped example validates, and every negative fixture is rejected by both validators |
| Export validation | inline in CI | Each declared export resolves and imports |
| Binary behavior | inline in CI | `validate` succeeds on a valid document; a bare invocation exits non-zero |
| Producer conformance | `check:conformance` | A producer candidate satisfies the four-path contract |
| Producer conformance red tests | `check:conformance:test` | Breaking each protected behavior makes that suite fail |

The guard red tests deserve emphasis. A guard that rejected everything would look
identical to a working guard from a green build, so the suite includes a baseline
case asserting that the unmodified repository is *accepted*. Coverage without
that case is not evidence.

## The executable producer contract

`check:conformance` is the standard's assertion about what any conforming
producer must do. It runs against a **candidate** — a built producer package —
because the producer lives in `workspacejson/cli`, not here:

```bash
WORKSPACEJSON_CLI_CANDIDATE=/path/to/cli/packages/cli pnpm run check:conformance
WORKSPACEJSON_CLI_CANDIDATE=/path/to/cli/packages/cli pnpm run check:conformance:test
```

It **does not skip** when the candidate is absent; it exits non-zero with
instructions. A conformance gate that goes green because it could not find the
implementation reports conformance it never measured.

What it asserts, by stable path:

| Path | Asserted |
| -- | -- |
| `generated.fileIndex` | Non-empty from repository evidence; every key repository-root-relative POSIX; every key names a file that exists; the repository's real files are represented; keys deterministically ordered |
| `generated.frameworkManifest` | A framework corroborated by a declared dependency is published at the documented `>= 0.7` floor; an uncorroborated `AGENTS.md` token is **not**; entries deterministically ordered |
| `manual.fragileFiles` | Preserved verbatim across regeneration; absent evidence left absent, never fabricated |
| `manual.coChangePatterns` | Preserved verbatim across regeneration; absent evidence left absent, never fabricated |

And beyond the four paths: an unparseable or schema-invalid artifact is refused
rather than overwritten, `--force` moves it aside recoverably instead of
destroying it, `generated.by.name` identifies the producer rather than an
invoker, output validates against the package-owned schema, a second run against
an unchanged repository is byte-identical, and mediated invocation produces the
same artifact as direct invocation after removing only `generated.generatedAt`.

### What it deliberately does not assert

**Per-file values inside `fileIndex`.** `FileIndexEntry` declares `fragility`,
`aiModificationCount` and `humanModificationCount` as optional, so `{}` is a
conformant entry. Those values are behavioral, their only available source is
git-derived, and whether that source may enter the stable contract is an open
question tracked outside this repository. A suite requiring them would fail a
producer that is behaving correctly, and would pre-empt a ruling the standard
does not own.

Nor does it require non-empty human-owned fields, or add git-derived co-change
to the acceptance surface.

### Vreko-mediated invocation

The contract asserts that mediation does not change what a producer emits. It
verifies this against the **public** mediation surface — a host importing the
package and calling the exported producer. Vreko itself is private and outside
this repository's clean-room boundary, so it cannot be executed here; a
Vreko-specific regression belongs in that repository and does not replace this
contract.

## Known gaps

Stated plainly, because a conformance document that hides them is misleading:

- **There is no self-service conformance battery for an unaided implementer.**
  A producer suite exists and is described below, but running it requires a
  candidate path supplied by the caller. An independent implementation cannot
  yet point at a single published battery and claim conformance without that
  step. What ships otherwise is this repository's own examples and its
  reference validator.
- **`validateLegacy()` has no shipped example.** All ten positive examples are
  v0.3 or v0.4, so the legacy path is covered by unit tests but not by an
  executable fixture a third party can point at. Its appearance in the negative
  gate is not coverage of the legacy path either — see the note under the
  negative-fixture table.
- **The negative fixtures cover one field group.** `examples/invalid/` exists as
  of the A-009 amendment and covers `generated.coChange` and
  `generated.basisRevision` only. Every other field's rejection behavior is
  still covered by unit tests inside the package rather than by a fixture a
  third party can point at. The directory is the mechanism; populating it for
  the rest of the schema has not been done.
- **An unpinned empty `coChange` is producer-non-conforming but schema-valid,
  and a reader must draw no conclusion from it.** A producer emitting the
  observation form declares `generated.basisRevision` whenever
  `generated.coChange` exists, including when the array is empty. Schema
  validation cannot check that case: an empty array carries no discriminator, so
  a validator cannot tell one written by a legacy producer from one written by
  an observation producer, and requiring a pin would invalidate legacy artifacts
  and break the transition. The obligation is therefore carried by the producer
  profile alone, and a producer can violate it while passing every automated
  gate here. The reader-side consequence is the one that matters and is defined
  normatively in A-009: an unpinned empty array means **legacy / unknown**, not
  zero — only a *pinned* empty array asserts that the analysis ran and found
  nothing. Both states ship as fixtures and are asserted by test.
- **Producer agreement is not measured on the `generated` flag, and cannot be.**
  As of A-010 the flag is optional and carries no specified derivation, so two
  independent producers may classify the same pair differently — or one may
  classify and the other omit — and **both conform**. Agreement between producers
  is therefore measured on `files`, `support` and `occurrences` only. A candidate
  producer is not marked non-conforming for omitting the flag, for disagreeing
  about it, or for classifying nothing at all; it *is* non-conforming if it emits
  a non-boolean, or if it emits the legacy form without it. Nothing here obliges
  a producer to classify: absent is a legitimate and, for a producer with no
  public deterministic classifier, the **correct** output.
- **The union-denominator guarantee is conditional while both forms are legal.**
  It holds for entries in the observation form. A legacy entry's `occurrences`
  carries the pre-amendment meaning, which was never normatively specified and
  may not be symmetric. A consumer that reads `occurrences` without first
  checking which form the entry takes will be wrong on legacy data, with no
  signal that it was.
- **One co-change invariant is outside the schema, so the two checks disagree.**
  `support <= occurrences` cannot be expressed in JSON Schema draft 2020-12,
  which has no way to compare two instance values. The consequence is precise
  and worth stating as two separate facts rather than one hedge:

  | Check | On a document where `support > occurrences` |
  | -- | -- |
  | Bare packaged schema, any conforming JSON Schema validator | **accepts** |
  | `validate()` / `validateV4()`, the reference validator | **rejects** |

  So an implementer who materializes `@workspacejson/spec/schema` and validates
  with their own tooling receives a strictly weaker check than this repository
  applies, and a producer that passes their gate can still be non-conforming. It
  is a **producer obligation carried by the profile, not by the schema** —
  recorded as such in ADR-003 A-009, disclosed here because §7 of that record
  voids a conformance signal measured against obligations absent from the bundle
  the implementer received, and pinned in both directions by test so this
  paragraph cannot drift away from the behavior.
- **No validator can prove that `occurrences` is the union rather than one
  endpoint's marginal.** This is the same class of limit as the one above, and
  the more consequential of the two, because the defect it admits is silent.
  `occurrences` is defined as the count of qualifying commits in which **at
  least one** of the two files changed — the symmetric union. A producer that
  instead emitted one endpoint's marginal would ship a document that is
  internally consistent in every checkable way:

  | Check | On an observation whose `occurrences` is a subject marginal |
  | -- | -- |
  | Bare packaged schema | **accepts** |
  | `validate()` / `validateV4()` | **accepts** |

  Both counts are non-negative integers, `support <= occurrences` still holds,
  the entry is unambiguously in the observation form, and `basisRevision` is
  pinned. Nothing in the document contradicts anything else in it. Detecting the
  substitution requires recounting against the repository history the artifact
  was derived from, which document validation does not have and never will.

  Three consequences follow, and they are stated separately because collapsing
  them is what makes this limit easy to under-report:

  1. **Union semantics are a producer-profile obligation**, not a document
     property. They are eventually exercised by candidate-producer conformance
     against real repository history — the only place the claim is falsifiable —
     and not by any check in this repository today.
  2. **The marginals must be asymmetric for a test to be meaningful.** Equal
     marginals make the union and the subject denominator coincide, so the
     substitution becomes unobservable. The worked invariant used throughout
     this standard is deliberately asymmetric: marginals **20** and **12** with
     intersection **8** give `support: 8` and `occurrences: 24`, and 24 is
     neither 20 nor 12. It is derived from a commit ledger and compared against
     the bytes of `examples/cochange-observations-v0.4.json` by test, so the
     shipped example cannot drift toward a marginal unnoticed.
  3. **Two conforming-looking producers can disagree.** An unordered pair has no
     subject, so "the subject's marginal" is not even well defined — a producer
     adopting it has two answers available and nothing in the artifact to choose
     between them. That is the reason the union was selected, recorded in
     ADR-003 A-009.
- **Emission policy for `rate` is unenforceable at the document level, by
  construction.** A new observation producer must emit `support` +
  `occurrences` and **must not** emit `rate`. But legacy `rate` artifacts remain
  schema-valid for the whole of the v0.4 transition — that is the entire point
  of the widening — so a document carrying `rate` is indistinguishable from a
  correctly-behaving legacy artifact. Validation cannot tell a valid legacy
  document from a new producer violating the emission policy, and no rule added
  here could make it, short of a narrowing that would invalidate published
  artifacts. What *is* checkable, and is checked, is that an entry never carries
  `rate` and `support` together and that an array never mixes the two forms.
  The residue — *which* producer wrote a legacy-form entry — is carried by the
  producer profile alone. `rate` is removed at the next document-profile change,
  at which point the obligation becomes a schema rule; that step is not
  authorized here.
- **Pair ordering is a producer obligation and deliberately not a schema rule.**
  `generated.coChange[].files` is an **unordered pair with set semantics**: both
  orderings are valid, joins are by membership, and no reader may attribute
  meaning to position. Readers are not narrowed, and reversed documents must
  keep validating — a schema ordering constraint would break every published
  artifact that stored the other ordering. Separately, a **new producer
  serializes the two canonical stored keys in ascending UTF-8 byte order** — not
  locale collation, not case-folded, and with no Unicode normalization applied,
  since each of those is a different total order and ADR-006 forbids rewriting a
  stored key. The property this buys is that endpoint reversal produces
  identical producer bytes, so a regenerated artifact is stable.

  **Enforcement now lives in this repository's candidate-producer conformance
  suite**, which checks that every emitted observation-form pair is ordered by
  ascending UTF-8 bytes — a real byte comparison, not `<`, since a bare string
  comparison is UTF-16 code unit order and the two disagree on
  supplementary-plane characters. The suite also checks that no emitted entry
  stores a derived `rate`. This paragraph previously said enforcement was out of
  scope for this repository while the suite examined `coChange[].files` not at
  all, so a producer emitting reversed endpoints passed a gate that advertised
  the check. The gate was added rather than the claim softened.

  **A candidate that emits no observation-form entries is recorded as
  `NOT MEASURED`, counted separately from passes.** A property that could not be
  exercised has not been demonstrated, and folding it into the pass total would
  inflate the denominator with a check that measured nothing.

  **`cochange-observations-v0.4.json` stores its pair as
  `["src/session.ts", "src/auth.ts"]`, which is *not* ascending UTF-8 order.
  That is deliberate and it stays.** Three statements about it, none of which may
  be inferred away:

  1. It is retained as a **reader-tolerance fixture** — executable evidence that
     a conforming reader must not depend on pair order, and that the reversed
     ordering is fully valid.
  2. It is **not reference-producer output**, and must not be read as a model of
     what a producer emits. No published example in this repository is a
     producer receipt.
  3. **New producers canonicalize pair members by ascending UTF-8 bytes.** The
     fixture's ordering is therefore *not* a precedent, and its validity is not
     evidence that canonical ordering is optional for producers. Reader
     tolerance and producer obligation are separate contracts, and this fixture
     exists to exercise the first one, not to relax the second.

### Producer conformance IS mechanically checked here

This bullet previously said the opposite. That was true when written and became
false when the executable contract landed; it is corrected rather than quietly
dropped.

`scripts/check-producer-conformance.mjs` is the standard's assertion about what
any conforming producer must do. It measures an external candidate — the
producer does not grade itself:

```bash
WORKSPACEJSON_CLI_CANDIDATE=/path/to/cli/packages/cli \
  pnpm run check:conformance

pnpm run check:conformance:test   # the mutation red tests
```

It asserts five groups: `generated.fileIndex` populated from repository
evidence, `generated.frameworkManifest` populated from repository evidence,
`manual.*` preserved verbatim and never fabricated, invalid artifacts failing
safely without destroying human evidence, and producer identity plus
determinism plus direct/mediated parity. It imports this repository's own
validator rather than re-implementing it, so there is no second source of truth
to drift.

The mutation tests assert that each mutation actually changed bytes and that
the suite goes red *on the expected check* rather than on any failure, with a
baseline case asserting the unmutated candidate is accepted — so the suite
cannot pass by rejecting everything.

**What it deliberately does not assert.** Nothing about per-file values inside
`generated.fileIndex`. `FileIndexEntry` declares every value field optional, so
`{}` is conformant. Those values are behavioral and git-derived, and whether
they may enter the stable contract is an open determination this repository
does not own — recorded as ADR-003 amendment A-004. Requiring them here would
pre-empt that ruling and fail a producer that is behaving correctly.

Closing these gaps is real work with real design questions, and none of it is
claimed as done.
