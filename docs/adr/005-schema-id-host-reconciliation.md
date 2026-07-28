# ADR-005: Schema `$id` host reconciliation

| Field | Value |
| -- | -- |
| **Status** | Accepted |
| **Decision date** | 2026-07-28 |
| **Record written** | 2026-07-28 |
| **Author** | Qwynn Marcelle ([@qmarcelle](https://github.com/qmarcelle)) |
| **Decider** | Qwynn Marcelle |
| **Ratifying authority** | Qwynn Marcelle, sole steward ([OWNERSHIP.md](../../OWNERSHIP.md)) |
| **Canonical repository** | `workspacejson/standard` |
| **Canonical path** | `docs/adr/005-schema-id-host-reconciliation.md` |
| **Evidence snapshot** | `origin/main` at `802ebda`; `@workspacejson/spec@0.4.4`; both hosts verified serving the schema 2026-07-28 |
| **Supersedes** | Nothing |
| **Superseded by** | Nothing |
| **Depends on** | Nothing |
| **Spec version at decision** | v0.4 |

## Context

The schema's `$id` declares `https://www.workspacejson.dev/schema/v1.json`. Every
package manifest in this repository — `homepage`, `repository.url`, and the
canonical domain referenced throughout the documentation — uses the bare domain
`https://workspacejson.dev` without the `www.` prefix.

Both hosts serve the schema, so nothing is broken. But the two strings disagree,
and [`docs/versioning.md`](../versioning.md) instructs consumers to materialize
the schema from a pinned package version and hash-check it. A consumer who
hash-checks the `$id` string — or who uses it as a fetch URL — encounters a
different host than the one the package metadata points at. That is a
preventable source of confusion, and preventing it is cheap only before the
next publish.

### Why now

`0.4.5` has not published. Consumers have only ever seen `0.4.4`'s schema bytes.
Folding the `$id` change into `0.4.5` means consumers experience one transition
covering both the ADR-004 widening and the identity fix. If `0.4.5` publishes
first and the `$id` change follows as `0.4.6`, the same change costs a second
pin invalidation — and `versioning.md` explicitly instructs consumers to
hash-check the materialized schema.

### The filename question

The `v1` in `v1.json` is a legacy artifact of the file's original naming, not a
claim that the format is at version 1.0. Whether to rename the file is a
separate question from the `$id` host, and it is **deferred**. Renaming the
file would change the `exports` map, every test path that references
`SCHEMA_JSON_PATH`, and the `$id` URL path component — a larger break with no
functional gain in this release. The filename stays `v1.json` for `0.4.5` and
may be revisited at v0.5 if it still matters.

## Decision

Change the schema `$id` from `https://www.workspacejson.dev/schema/v1.json` to
`https://workspacejson.dev/schema/v1.json`, dropping the `www.` prefix to match
the bare canonical domain used everywhere else in the project.

The filename `v1.json` is unchanged. The on-disk path, the `exports` map, and
the `$id` URL path component all stay as they are.

## Consequences

- **Schema bytes change.** The `$id` string in both `packages/spec/schema/v1.json`
  and `packages/spec/src/schema.ts` is updated. Consumers who hash-check the
  materialized schema will see a different hash for `0.4.5` than for `0.4.4`.
  This is expected and is the reason the change rides in the same release as the
  ADR-004 widening rather than following it.

- **The `www.` host continues to serve the schema.** Both hosts resolve; the
  change is about which string is canonical, not which URL works. A consumer
  who fetches from the `www.` host after `0.4.5` still gets the schema — they
  just get one whose `$id` says `workspacejson.dev`.

- **No validation behavior changes.** The `$id` is an identifier, not a
  validation rule. The `allOf` conditions, the `required` array, the
  `additionalProperties` constraint, and the ADR-004 root `version` acceptance
  are all unchanged.

- **Test invariants are updated.** The `CANONICAL_ID` constant in
  `packages/spec/src/index.test.ts` changes to match. The split-brain tests
  continue to assert that the TypeScript const and the JSON file agree.

## What is not changing

- The filename `v1.json` — deferred to v0.5 if at all.
- The `$schema` URI (`https://json-schema.org/draft/2020-12/schema`).
- The `exports` map in `package.json`.
- Any validation behavior, read path, or field definition.

## Provenance

Written 2026-07-28 in `workspacejson/standard`, prompted by the sequencing
analysis for META-272. The argument for folding into `0.4.5` rather than
`0.4.6` is that `versioning.md` instructs consumers to hash-check the
materialized schema, and two byte-changing reasons in two consecutive releases
are indistinguishable from one reason that moved — which is the same argument
that kept ADR-004 out of v0.5.
