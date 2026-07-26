# ADR-001: Canonical artifact path

| Field | Value |
| -- | -- |
| **Status** | Accepted |
| **Decision date** | 2026-06-02 — shipped in `@workspacejson/spec@0.4.1` |
| **Record written** | 2026-07-26 |
| **Owner** | Qwynn Marcelle ([@qmarcelle](https://github.com/qmarcelle)) |
| **Supersedes** | Nothing |
| **Superseded by** | Nothing |
| **Depended on by** | [ADR-002](./002-bounded-enrichment-program.md) |
| **Spec version at decision** | v0.4 |

## Context

`workspace.json` is a *committed* artifact. Every consumer — a producer writing
it, an agent reading it, a validator checking it, a reviewer diffing it — has to
agree on where the file is before anything else about the format matters. A
format with a negotiable location is not portable.

The location moved twice before settling, and both moves are visible in
[`packages/spec/CHANGELOG.md`](../../packages/spec/CHANGELOG.md):

| Release | On-disk path | Note |
| -- | -- | -- |
| v0.1 – v0.2.0 | `agents.workspace.json` at the repository root | Later recorded as incorrect |
| v0.2.x | `.agents/agents.workspace.json` | Corrected write path; root form retained as a read fallback |
| **v0.4.1** | **`.agents/workspace.json`** | Current canonical path |

By v0.4 the cost of the churn was concrete. Three forms were live across
different surfaces, so a reader following one document could not find the file
another document described. On the single artifact the whole standard hangs on,
that reads as unreliability rather than as flexibility.

A naming distinction was also being conflated: the name of the *standard* — what
implementers say they support — is not the name of the *file on disk*. Treating
those as one question is what produced three candidates instead of two answers.

## Decision

**The canonical on-disk path is `.agents/workspace.json`, relative to the
repository root.**

The standard is named `workspace.json`. The artifact it defines lives at
`.agents/workspace.json`. These are deliberately different scopes: the first
names a format, the second names a location in a working tree.

Rationale for the location:

1. **`.agents/` is the established directory for agent-facing repository
   metadata**, alongside `AGENTS.md` conventions. Placing the artifact there
   groups it with material of the same kind instead of adding another entry at
   the repository root.
2. **The `agents.` prefix is redundant inside `.agents/`.** It restates the
   directory in the filename and lengthens every reference without adding
   disambiguation. This is the reason recorded at the time of the v0.4.1 change.
3. **A bare root `workspace.json` collides with an existing, widely indexed
   meaning** — it is also the name of a deprecated build-tool configuration file.
   A root-level file of that name invites misidentification by humans and tooling
   alike. The collision does not apply once the file is namespaced by `.agents/`.

### Read compatibility

Since v0.4.1 the standard has stated that generators write to
`.agents/workspace.json` and that the previous path,
`.agents/agents.workspace.json`, **remains a valid read fallback**. That
allowance is part of this decision, not an exception to it. A consumer may accept
a document found at the legacy path; a producer may not write there.

No deprecation date is set for the read fallback. When one is, it requires its
own record — removing it is a breaking change for any repository that still
carries the older filename.

## Boundaries

This decision covers the location, the format name, and the read fallback. It
does **not** cover:

- **Producer behavior.** How the file is generated, by what command, and how
  often is owned by `workspacejson/cli`, not by this repository.
- **Discovery beyond the canonical path and the recorded fallback.** A consumer
  may accept an explicit path argument. It may not invent further default
  locations.
- **Vendor-specific sidecar views.** Some tools maintain derived views alongside
  the canonical artifact, conventionally `.agents/workspace.<vendor>.json`. Those
  are **not** part of this standard, carry no compatibility guarantee here, and
  must never be required in order to read the canonical file.
- **The schema's `$id` host.** The identifier declared inside the schema document
  is a separate canonicalization question, tracked independently. It is not
  settled by this record, and changing it changes schema bytes.

## Consequences

- Every surface this repository owns — schema, shipped examples, package
  documentation and reference behavior — uses `.agents/workspace.json`. That is
  true as of this record.
- Consumers may resolve the path relative to the repository root rather than
  treating it as per-tool configuration.
- Documents still using an older form are wrong, not alternative. Normalizing
  them is a documentation change, not a compatibility break, because the read
  fallback keeps existing repositories readable.
- The cost accepted: the artifact sits one directory below the root and is
  therefore slightly less discoverable to a human browsing the repository. That
  is traded for grouping with other agent-facing metadata and for avoiding the
  root-level name collision.

## Open questions

This record states what is in force. Two related questions are genuinely still
open and are **not** decided here:

1. **Public copy normalization.** Surfaces outside this repository — notably the
   published website and its documentation — have historically used more than one
   form. Bringing them to the canonical string is outstanding work owned by those
   repositories.
2. **The status of vendor sidecar views.** Whether `.agents/workspace.<vendor>.json`
   should be described by the open standard at all, or left entirely as vendor
   plumbing, is unresolved. Until it is resolved the standard says nothing about
   it, which is the conservative position.

Neither open question changes the canonical path.

## Supersession

Replace this record if the `.agents/` convention is abandoned by the broader
agent-metadata ecosystem, or if a location change becomes necessary for
interoperability with a standard this one adopts.

Any replacement must state a migration path for repositories that already carry a
committed artifact at the current path. Changing the canonical location is a
breaking change for every consumer regardless of what the version number would
otherwise suggest — see [`docs/versioning.md`](../versioning.md).

## Provenance

The decision itself is dated **2026-06-02** and shipped in
`@workspacejson/spec@0.4.1`, which is published on npm. Its original record is
the v0.4.1 entry in [`packages/spec/CHANGELOG.md`](../../packages/spec/CHANGELOG.md),
with the corresponding consumer-side change recorded in
[`packages/rules/CHANGELOG.md`](../../packages/rules/CHANGELOG.md).

This ADR was written on 2026-07-26 during the public-readiness pass on
`workspacejson/standard` (internal tracker: META-246), which found that
[ADR-002](./002-bounded-enrichment-program.md) declared a dependency on an
ADR-001 that had never been committed anywhere. The record does not make a new
decision; it makes an existing, shipped, implemented one citable by public
implementers instead of leaving them to infer it from a changelog.

The outstanding cross-surface normalization described under **Open questions** is
tracked internally as META-199.
