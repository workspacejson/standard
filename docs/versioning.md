# Versioning and compatibility

This document states what a consumer of `workspace.json` may rely on, and what
may change underneath them. It describes the **currently released** behavior.
Where something is undecided, it says so rather than implying a guarantee.

## Two version numbers, two different things

They are frequently confused, and confusing them produces real bugs.

| Number | Where it lives | What it identifies |
| -- | -- | -- |
| **Package version** | `@workspacejson/spec` / `@workspacejson/rules` `package.json` | A release of this tooling. Follows semver. |
| **Spec version** | `generated.specVersion` inside a document | Which profile of the format that *document* conforms to. |

A document written by an old producer stays at its own `specVersion` no matter
which package version reads it. Never infer one from the other.

## Current released state

Published versions are **registry-defined**. `npm view @workspacejson/spec version`
is the arbiter; anything written in a document, including this one, is a snapshot.

At the time of writing, both packages are at `0.4.4` and the current document
profile is **v0.4**.

The two packages are released as a **fixed group** — configured in
[`.changeset/config.json`](../.changeset/config.json) — so they always carry the
same version number. That is deliberate: it removes an entire class of
"which pair of versions is compatible?" question. It also means a package may be
released with no changes of its own, purely to stay aligned with its partner.

## Document profiles

| Profile | Shape | How to validate |
| -- | -- | -- |
| **v0.4** | v0.3 plus typed `generated.coChange` and `generated.fragility` arrays, plus three formally typed `health` fields | `validateV4(doc)` |
| **v0.3** | Four required sections: `manual`, `generated`, `agents`, `health` | `validate(doc)` |
| **v0.1 / v0.2** | Legacy flat top-level shape | `validateLegacy(doc)` |

A root `version` key no longer distinguishes the legacy shape on its own, since
v0.3/v0.4 documents may now carry it as a mirror. `validateLegacy()` identifies
the legacy shape by the **absence of `generated.specVersion`**, so a document
whose two profile declarations disagree is rejected by both `validate()` and
`validateLegacy()` rather than being misreported as legacy.

**v0.4 is a strict superset of v0.3.** Every valid v0.3 document is a valid v0.4
document. `validate()` accepts both; use `validateV4()` when you intend to read
the v0.4-only fields, or check `generated.specVersion === "0.4"` before touching
them.

Legacy v0.1/v0.2 documents are validated by a separate function precisely so a
consumer has to opt into handling them. They are not accepted by `validate()`.

## The compatibility floor

Four read paths are externally consumed and are treated as a hard compatibility
surface:

```text
manual.fragileFiles
manual.coChangePatterns
generated.fileIndex
generated.frameworkManifest
```

**Removing or renaming any of the four is a breaking change regardless of what
the version number would otherwise suggest.** A patch release cannot do it; a
minor release cannot do it. This is enforced mechanically rather than by
convention — both `scripts/check-architecture.mjs` and
`scripts/verify-schema-provenance.mjs` fail the build if one of the four is
absent from the canonical schema.

The floor covers *presence and shape*, not contents. A producer emitting more
entries in `generated.fileIndex` than it did last month has not broken anything.

## The validator acceptance floor

There is a second floor, and it moves independently of the four read paths: what
the shipped validator *accepts*. It is worth stating separately because a change
can move this floor while leaving every read path untouched.

`0.4.5` widens acceptance to allow an optional root `version` mirroring
`generated.specVersion`, per [ADR-004](./adr/004-root-version-compatibility.md).
Reading is unaffected — `generated.specVersion` remains the primary profile
declaration and remains required, and a reader that ignores the root key is
unaffected by its presence. No new profile name is introduced; the document
profile is still v0.4.

**Widening acceptance is not permission to emit.** No producer writes the root
key, and ADR-004 §8 sequences emission behind evidence that known
validate-before-read consumers accept it. The two steps must not be collapsed.

The same floor moves again for `generated.coChange`, and outward. A co-change
entry now takes **exactly one of two forms**:

| Form | Carries | Status |
| -- | -- | -- |
| Legacy | `rate` + `occurrences` | Deprecated; still accepted |
| Observation | `support` + `occurrences` | What new producers emit |

Both, or neither, in one entry is invalid. The array is also **homogeneous**:
every entry legacy, or every entry observation. A mixed array is rejected, because
each of its entries is individually well-formed and nothing else would catch it.
An empty array satisfies both branches.

Observation-form `occurrences` has a **minimum of 1**, so `support / occurrences`
is total on a conforming artifact and no reader can derive `0/0`, `NaN` or
infinity. A pair never observed changing has **no entry** — absence, not a zero
denominator. Legacy `occurrences` keeps its original minimum of 0.

`generated.basisRevision` is required, and constrained to a full-length Git
object name, **only where an entry uses the observation form**. Everywhere else
the key is unconstrained, so a legacy artifact already carrying
`basisRevision: "HEAD"` stays valid;
`packages/spec/examples/cochange-legacy-head-basis-v0.4.json` is the regression
guard for that.

**At the document level this is a pure widening.** Every document that validated
before validates after — no narrowing at all, including on `basisRevision` —
and `packages/spec/examples/cochange-legacy-rate-v0.4.json` proves it executably
rather than by assertion.

**At the package API level it is not free.** `CoChangeEntry` becomes a union, so
`entry.rate` is `number | undefined` rather than `number`; a TypeScript consumer
reading it without narrowing stops compiling. That is a source-level break for
readers, and it is why the package release is a minor rather than a patch.

`occurrences` appears in both forms and **means different things in each** — the
symmetric union denominator in the observation form, the unspecified
pre-amendment quantity in the legacy form. Establish the form before reading it,
and never compare the two across forms.

The document profile does **not** move: `generated.specVersion` stays `"0.4"`,
and no new profile identifier is minted. Removing `rate` is deferred to the next
document-profile change, where a `specVersion` move is already happening.
Recorded as [ADR-003](./adr/003-field-lifecycle-and-admission.md) amendment
A-009, which also carries the release sequence: **widen the reader → verify known
consumer adoption → enable producer emission**, with removal a separate fourth
step that this amendment does not authorize.

## An optional field is not automatically additive

The root object is `additionalProperties: false`. A consumer validating a
document against a published schema rejects any root key that schema does not
declare — so adding one is additive to the schema *as a document* and breaking
for every already-deployed validator.

This is the trap ADR-004 was written to record: the general rule below that
"adding a new optional field" is not breaking holds inside `manual`, `generated`
and `health`, which are all `additionalProperties: true`. It does **not** hold at
the root. Anything added there requires the acceptance-then-emission sequence,
not a patch release.

## What counts as a breaking change

Breaking, regardless of version arithmetic:

- removing or renaming one of the four stable read paths;
- narrowing an existing field's accepted type or value range;
- making a previously optional field required;
- changing the canonical artifact path (see [ADR-001](./adr/001-canonical-artifact-path.md));
- removing a public export from either package.

Not breaking:

- adding a new optional field **to a section that permits additional properties**
  (`manual`, `generated`, `health`) — see the root-object caveat above, which is
  the one place this rule does not hold;
- adding a new profile that is a strict superset of the current one, as v0.4 was
  over v0.3;
- widening an accepted type;
- documentation, test and internal-implementation changes.

Changes in the first list require an architecture decision record before
implementation. See [`GOVERNANCE.md`](../GOVERNANCE.md).

## Reading a document defensively

The behavior a consumer should implement today:

```ts
import { validate, validateV4 } from '@workspacejson/spec';

if (!validate(doc)) {
  // Not a v0.3/v0.4 document. Do not guess at its shape.
  return;
}

// The four stable paths are the safe surface.
const fragile = doc.manual?.fragileFiles ?? [];

// v0.4-only fields require an explicit check.
if (validateV4(doc)) {
  const coChange = doc.generated.coChange ?? [];
}
```

Two consumer guidances are part of the released contract and are easy to get
wrong:

- **`generated.coChange`** — filter on `generated: true` to skip tooling-coupled
  pairs such as a lockfile and its manifest, and surface only real source
  couplings. Do not apply path heuristics at read time. **Check the entry form
  before reading the counts**, because during the v0.4 transition both are
  legal: an entry with `support` is the observation form, where `occurrences` is
  the symmetric union denominator and you derive `support / occurrences`
  yourself wherever `occurrences > 0`; an entry with `rate` is the deprecated
  legacy form, whose `occurrences` carries the older, unspecified meaning. Do not
  compare the two across forms, and do not assume the legacy denominator is
  symmetric. `generated.basisRevision` names the revision the observation-form
  counts were taken over.

  ```ts
  for (const e of doc.generated.coChange ?? []) {
    if (e.support !== undefined) {
      const ratio = e.occurrences > 0 ? e.support / e.occurrences : undefined;
    } // else: legacy entry — e.rate, on the older denominator
  }
  ```
- **`generated.fragility`** — filter `excluded: false` before ranking. Entries
  with `excluded: true` are generated or lock files carrying
  `fragilityScore: 0`.

**Absent evidence is not evidence of absence.** A missing or empty section means
the producer did not observe it, not that the underlying property is false. A
reader that reports "no fragile files" when `manual.fragileFiles` is absent is
reporting a producer gap as a repository fact.

## Schema identity

The normative schema lives at exactly one path — `packages/spec/schema/v1.json` —
and is shipped inside the `@workspacejson/spec` tarball, resolvable as
`@workspacejson/spec/schema`.

Downstream repositories must **materialize** it from a pinned package version and
hash-check it. They must not maintain an editable second copy; that is how the
copies drift. `pnpm run check:schema` prints the path, byte length and SHA-256
for pinning.

The schema's `$id` is `https://workspacejson.dev/schema/v1.json`, matching the
bare canonical domain used in package manifests and documentation. Both the
`www.` and bare hosts serve the schema, but the `$id` declares the bare domain
as canonical. See [ADR-005](./adr/005-schema-identity.md) for the
reconciliation record.

The `v1` in the filename is a legacy artifact of the schema file's original
naming, not a claim that the format is at version 1.0. The filename is unchanged
for v0.4.x; whether to rename it is deferred to v0.5.

## Deprecation policy

Nothing in the released surface is currently deprecated with a removal date.

One documented compatibility allowance is open-ended: the legacy artifact path
`.agents/agents.workspace.json` remains a valid **read** fallback, though
producers must write to `.agents/workspace.json`. See
[ADR-001](./adr/001-canonical-artifact-path.md).

When a deprecation is introduced, it will be announced in the package changelog
with the release that introduces it, kept working for at least one minor
release, and removed only in a release that says so explicitly. Nothing will be
removed silently.

## Publication

**This repository does not currently publish either package.** Both are published
from the historical repository this one was extracted from, which holds the only
credential. This repository has no npm secret and ships no release workflow, and
CI fails if a publish step or credential reference appears in any workflow.

Transferring that authority is a separate coordinated change that must revoke the
old authority in the same act. See
[`.github/RELEASE-AUTHORITY.md`](../.github/RELEASE-AUTHORITY.md).
