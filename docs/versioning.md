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
  couplings. Do not apply path heuristics at read time.
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
