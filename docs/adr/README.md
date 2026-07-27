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
| [004](./004-root-version-compatibility.md) | Root `version` compatibility profile for v0.4.x | Proposed | 2026-07-27 |

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

An ADR is never deleted or silently edited after acceptance. It is superseded by
a new record that names it explicitly, so the history of a decision stays
readable.

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

The owner named in the metadata breaks ties if maintainers disagree about the
decision's application.
