# ADR-005: Schema identity — canonical host, filename, and single-file profile carriage

| Field | Value |
| -- | -- |
| **Status** | Accepted |
| **Decision date** | 2026-07-28 |
| **Record written** | 2026-07-28 |
| **Author** | Qwynn Marcelle ([@qmarcelle](https://github.com/qmarcelle)) |
| **Decider** | Qwynn Marcelle |
| **Ratifying authority** | Qwynn Marcelle, sole steward ([OWNERSHIP.md](../../OWNERSHIP.md)) |
| **Canonical repository** | `workspacejson/standard` |
| **Canonical path** | `docs/adr/005-schema-identity.md` |
| **Evidence snapshot** | `origin/main` at `802ebda`; `@workspacejson/spec@0.4.4` on the registry; both hosts verified serving the schema 2026-07-28 |
| **Supersedes** | Nothing |
| **Superseded by** | Nothing |
| **Depends on** | [ADR-001](./001-canonical-artifact-path.md), [ADR-004](./004-root-version-compatibility.md) |
| **Spec version at decision** | v0.4 |

## Context

Three questions about the schema's *identity* — as distinct from its contents —
have been open long enough to be recorded as known inconsistencies in
[`docs/versioning.md`](../versioning.md) rather than resolved. They are treated
together here because each one changes the bytes of
`packages/spec/schema/v1.json`, and the cost of changing those bytes is paid per
change, not per reason.

That cost is concrete. `docs/versioning.md` instructs downstream repositories to
materialize the schema from a pinned package version and hash-check it, and
`pnpm run check:schema` exists to print the length and digest for exactly that
purpose. Every byte change invalidates every pin. Three separate byte-changing
releases to one file is how a consumer loses track of which digest is current.

### The host disagrees with every other surface

The schema declares `$id: https://www.workspacejson.dev/schema/v1.json`. Nothing
else does. The package manifests use the bare domain, recorded in
[`migration/PROVENANCE.md`](../../migration/PROVENANCE.md) as a deliberate move
to the canonical bare domain. `workspacejson/cli` asserts the **bare** host in
`scripts/check-architecture.test.mjs` — a downstream test is currently asserting
a host this repository does not emit.

Both hosts serve the schema, so nothing is broken today. But the strings
disagree, and the schema is the outlier rather than the standard-setter.

### The filename says something untrue

`docs/versioning.md` already records that the `v1` in the filename is a legacy
artifact of the file's original naming and **not** a claim that the format is at
version 1.0. The name is misleading on its face and correct only by footnote.

### Whether profiles need separate files

`schema/v1.json` currently validates two document profiles — v0.3 and v0.4 —
through the `generated.specVersion` enum. Whether a future profile warrants a
sibling file, and therefore a second `$id`, determines whether the filename must
carry a disambiguating number at all. The filename question cannot be answered
before this one.

## Decision

### 1. The canonical `$id` host is the bare domain

```
https://workspacejson.dev/schema/v1.json
```

This is consistency restoration, not a new choice. Three surfaces already treat
the bare domain as canonical; this record moves the fourth.

The old `$id` must continue to resolve. A consumer that fetches the previous URL
is not broken by this change — only a consumer that compares the `$id` string
byte-for-byte, or that has pinned the file digest, observes anything.

### 2. One schema file carries every profile

No sibling schema file is introduced, for v0.5 or afterward. Profiles continue
to ride the `generated.specVersion` enum, with divergent per-profile constraints
expressed as conditional subschemas — the mechanism ADR-004 §2 already
established for the root `version` equality invariant.

The reasoning is not primarily about elegance:

- A second schema file is a second source of truth. This repository has already
  been through one split-brain episode in which two branches independently
  published a package claiming the same version, one with real validation and
  one without. The apparatus built since — `check:schema` single-sourcing, and
  the `schema.ts` ↔ `schema/v1.json` parity tests — would need duplicating per
  file, or drift returns by the same route.
- The artifact schema is one of five layers an implementer receives. Obligations
  such as deterministic ordering, real-file membership and manual-evidence
  preservation cannot be expressed in JSON Schema at all. A per-file version
  number would version one-fifth of the contract while appearing to version all
  of it.
- Introducing a `v2.json` would retroactively make the existing filename a
  version claim, contradicting what `docs/versioning.md` states, and would add a
  third versioning axis beside package version and spec version — the two that
  document already works to keep separate.

**The constraint this creates, recorded so it is not rediscovered.** JSON Schema
`additionalProperties` considers only the `properties` declared in the *same*
schema object — not those inside `allOf`, `if` or `then`. The root is
`additionalProperties: false`. Therefore a single file must declare the **union**
of every retained profile's root properties and exclude them per-profile via
conditionals. Adding a root property only inside a conditional does not work; it
is rejected before the conditional is reached.

Readability degrades as retained profiles accumulate. The lever for that is
deprecation — retiring an old profile — not splitting the file.

### 3. `schema/v1.json` is not renamed

Decided against, permanently. This is not a deferral, and the distinction is the
substance of the decision: an open question invites a later rename, and a later
rename is a second byte change and a second invalidated digest.

- The filename is already invisible to consumers. `package.json` declares
  `"./schema": "./schema/v1.json"` — the export *key* is `./schema`. Consumers
  write `@workspacejson/spec/schema`. The filename leaks only through the `$id`
  path component.
- An `$id` is an identifier, and stability is the property that makes it worth
  having. Correcting the host is justified because it removes a disagreement
  between surfaces. Moving the path component in the same act would be churn on
  the same identifier for a cosmetic gain.
- The misleading `v1` is a documentation problem, and `docs/versioning.md`
  already solves it in prose.
- Under §2 there will never be a sibling schema file. A filename only needs to
  disambiguate when there is something to disambiguate from.

Recording §2 and §3 together is deliberate: §3 depends on §2, and a future reader
who finds only one of them cannot reconstruct why either holds.

### 4. The change ships once, in the v0.4.5 line

The host correction lands in the same release as the ADR-004 reader widening.
That release has not yet been published, so a consumer moving from `0.4.4`
observes **one** transition covering both the widened acceptance and the
corrected identity.

It must **not** ride in v0.5. That release carries profile changes, and two
independent byte-changing reasons in one release are indistinguishable to
someone debugging a digest that no longer matches.

## Boundaries

This record covers the schema's identity. It does **not** cover:

- **Any profile change.** No field is added, removed, relocated or retyped, and
  the four stable read paths are untouched.
- **The export key.** `./schema` is unchanged, so no consumer import path moves.
- **Historical provenance records.** Files under `migration/` record what was
  true at migration time and are not rewritten to match a later decision.
- **When a profile is retired.** §2 names deprecation as the lever for
  conditional complexity without deciding any particular retirement.
- **The artifact path.** Unchanged, as in ADR-001.

## Consequences

A downstream repository that pinned the schema digest must re-pin.
`pnpm run check:schema` prints the new path, length and digest. This is the
whole cost of the change, it is paid once, and folding the correction into an
unpublished release is what keeps it at one.

`workspacejson/cli` converges for free: its architecture test already asserts the
bare host, and has been asserting a value this repository did not emit.

The `$id` string and the file's own path now disagree in a smaller way than
before — the URL says `workspacejson.dev` while the repository path says
`packages/spec/schema/v1.json`. That is not a defect; an `$id` is an identifier
in a namespace the repository does not own a filesystem view of.

Accepting §3 means living with a filename that requires a footnote. That is a
real cost, accepted knowingly, because the alternative spends a byte change and
roughly a dozen internal call-site updates to buy nothing a consumer can observe.

## Supersession

Supersede this record if a second schema document ever becomes necessary — which
would reopen §2 and, through it, §3 — or if the canonical domain changes again.

Any replacement must state what happens to consumers holding the previous `$id`
and digest, and must not treat a filename change as cosmetic: under the pinning
guidance in `docs/versioning.md` it is not.

## Provenance

Written 2026-07-28 in `workspacejson/standard`. The host question and the
filename question were both already recorded as open in `docs/versioning.md`,
which noted they were entangled because both change schema bytes. The third
question surfaced separately, while implementing the ADR-004 widening, as a
direct question about whether v0.5 required a new schema document.

Answering all three together was the finding, not the plan: the filename question
turned out to be undecidable in isolation, because whether a name must carry a
disambiguating number depends on whether anything will ever need disambiguating
from it.

The `additionalProperties` constraint recorded in §2 was encountered
concretely rather than anticipated — the root `version` property added under
ADR-004 had to be declared in the root `properties` as well as constrained in the
`allOf`, because the conditional alone was rejected.
