# Architecture decision records

This directory is the authoritative home of the decisions that shape
`workspace.json`. If a decision constrains what implementers may rely on, it is
recorded here — not in a chat log, not in an issue tracker, and not only in
someone's memory.

That matters because the standard is meant to be implemented by people outside
this organization. A public implementer cannot be asked to depend on access to a
private project-management system, so any decision that binds them lives in this
repository under version control.

## Index

| ADR | Title | Status | Date |
| -- | -- | -- | -- |
| [001](./001-canonical-artifact-path.md) | Canonical artifact path | Accepted | 2026-07-26 |
| [002](./002-bounded-enrichment-program.md) | Bounded enrichment program | Proposed | 2026-07-25 |
| [003](./003-field-lifecycle-and-admission.md) | Field lifecycle and admission | Accepted | 2026-08-03 |
| [004](./004-root-version-compatibility.md) | Root `version` compatibility profile for v0.4.x | Accepted | 2026-07-28 |
| [005](./005-schema-identity.md) | Schema identity — canonical host, filename, and single-file profile carriage | Accepted | 2026-07-28 |

## When an ADR is required

[`GOVERNANCE.md`](../../GOVERNANCE.md) defines the normative surface. A change to
any of the following needs an ADR merged before implementation:

- the bytes of `packages/spec/schema/v1.json`
- the four stable read paths
- the public export surface of `@workspacejson/spec` or `@workspacejson/rules`
- the descriptive-not-prescriptive property
- the daemon-free property

Everything else — bug fixes, additive non-breaking work, documentation, tests —
proceeds through ordinary review.

## Status vocabulary

| Status | Meaning |
| -- | -- |
| **Proposed** | Recorded and under review. Implementers must not rely on it. |
| **Accepted** | In force. Implementations and this repository conform to it. |
| **Superseded** | Replaced by a later ADR, which is named in the record. Kept for history. |
| **Rejected** | Considered and declined. Kept so the reasoning is not relitigated. |

An ADR is never deleted or silently edited after acceptance. There are two ways a
record changes, and they are not interchangeable:

- **Supersession.** A new record replaces it and names it explicitly. Use this
  when the decision itself changes.
- **Amendment.** The record is corrected or extended in place, against a pinned
  revision. Use this when the decision stands but a detail of it is wrong,
  incomplete, or overtaken by evidence.

A record that expects amendment says so, and names its ratification issue in the
metadata table. Amendments are numbered, and each carries a proposal,
disposition, rationale, authority, decision date and effective revision. One
owner updates the file; the revision it takes effect at is recorded in the
revision index below, not in the record. A rewritten copy of the document
produced elsewhere is not an amendment and carries no authority regardless of
its merit.

Either path keeps the history of a decision readable, which is the point of
recording it here at all.

## Format

Number files sequentially: `NNN-short-kebab-title.md`. Each record carries a
metadata table (status, date, owner, dependencies) followed by:

- **Context** — the situation that forced a decision, including what was already
  true and what was in tension
- **Decision** — what was decided, stated so an implementer can act on it
- **Boundaries** — what the decision does *not* cover, which is usually the part
  that gets misread
- **Consequences** — what follows, including the costs accepted
- **Supersession** — the conditions under which this record should be replaced
- **Provenance** — where the decision came from, for auditability

A record that expects amendment carries a **ratification issue** metadata field
and an **Amendments** section listing each numbered amendment with its
disposition. [ADR-003](./003-field-lifecycle-and-admission.md) is the worked
example.

The owner named in the metadata breaks ties if maintainers disagree about the
decision's application.

## The revision index

An amendment has to name the exact text it was written against, so every record
needs an immutable reference. That reference cannot live inside the record. A
commit SHA does not exist until the commit is made, and a digest of the file
changes the instant it is written into the file — attempting either leaves a
`*filled at merge*` placeholder in a record that says "Accepted", which is what
happened here before this index existed.

So the bookkeeping sits outside the records, in [`index.json`](./index.json),
generated from Git by `scripts/adr-index.mjs`:

| Field | Meaning |
| -- | -- |
| `adr`, `title`, `path` | which record |
| `status`, `decisionDate` | what it says about itself |
| `ratifyingIssue` | where its amendment ledger lives, when it has one |
| `blob` | **the pin** — the Git blob SHA of the record's bytes |
| `revision` | the commit that published those bytes |
| `pullRequest` | the public PR that carried it |

`blob` is what a reviewer pins to. `git cat-file blob <sha>` returns exactly the
reviewed text forever, and it is knowable before merge, so a review does not
have to wait on one. `revision` and `pullRequest` are `null` until the bytes
land on `main` — the entry reads *pending merge* and fills in on the next
generation, because a record cannot know the commit that publishes it.

Two commands:

```
pnpm run adr:index    # regenerate after editing or merging a record
pnpm run check:adr    # CI: index matches the records, no Accepted record
                      # depends on a placeholder nobody filled in
```

The check reads statuses back out of the records and out of the index table
above, so a status can not drift between the three places a reader might find
it.
