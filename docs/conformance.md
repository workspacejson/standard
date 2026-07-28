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

Four executable examples live in
[`packages/spec/examples/`](../packages/spec/examples/):

| Example | Profile |
| -- | -- |
| `minimal-v0.3.json` | v0.3 |
| `populated-v0.3.json` | v0.3 |
| `with-manual-block-v0.3.json` | v0.3 |
| `populated-v0.4.json` | v0.4 |

Every one of them is validated against the package-owned schema in CI by
`pnpm run check:examples`, using the package's own validator rather than a
re-implementation. The gate fails if the examples directory is empty, so it
cannot pass vacuously.

If an example contradicts the schema, the fix is to the example. Weakening the
schema to make an example pass is explicitly prohibited in the gate's own
failure message.

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

Measured on the current `main`:

```text
path        packages/spec/schema/v1.json
bytes       6994
sha256      a32149fa2d0ae08412b97b8fde1c3d2a7887adbefcee99014ce143a6d525b0ca
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
| Executable examples | `check:examples` | Every shipped example validates |
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

- **There is no external conformance suite.** An independent implementation
  cannot currently run a standard battery to claim conformance. What exists is
  this repository's own examples and its reference validator.
- **`validateLegacy()` has no shipped example.** All four examples are v0.3 or
  v0.4, so the legacy path is covered by unit tests but not by an executable
  fixture a third party can point at.
- **There are no negative examples.** The examples prove that valid documents
  validate. They do not prove that invalid documents are rejected — that is
  covered only by unit tests inside the package.
- **Producer conformance is not mechanically checked here.** The obligations
  listed at the top of this document — `manual` preservation, material-change
  write semantics — are stated in the contract and tested by producers, not
  verified by a fixture in this repository.

Closing these gaps is real work with real design questions, and none of it is
claimed as done.
