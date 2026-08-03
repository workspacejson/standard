# ADR-003: Field lifecycle and admission

| Field | Value |
| -- | -- |
| **Status** | Accepted |
| **Decision date** | 2026-08-03 |
| **Record written** | 2026-07-27 |
| **Author** | Qwynn Marcelle ([@qmarcelle](https://github.com/qmarcelle)) |
| **Decider** | Qwynn Marcelle |
| **Ratifying authority** | Qwynn Marcelle, sole steward ([OWNERSHIP.md](../../OWNERSHIP.md)) |
| **Canonical repository** | `workspacejson/standard` |
| **Canonical path** | `docs/adr/003-field-lifecycle-and-admission.md` |
| **Canonical revision** | *filled at merge — Git commit SHA* |
| **Ratification issue** | META-264 (internal tracker) |
| **Evidence snapshot** | Registry sweep 2026-07-27T13:23Z; `@workspacejson/spec@0.4.4` schema `sha256:7f1635bb…` |
| **Supersedes** | Nothing |
| **Superseded by** | Nothing |
| **Depends on** | [ADR-001](./001-canonical-artifact-path.md) |
| **Spec version at decision** | v0.4 |

## Context

The four stable read paths were designated a compatibility surface before their
contracts were written. `generated.fileIndex` constrains no inner property, so a
producer emitting `{}` for every path is conformant. `manual.coChangePatterns`
declares items as bare objects. `generated.hygiene` and `generated.topology` are
`{"type": "object"}` with no description. Meanwhile `health` — a required
top-level key — is emitted as three constants that never move.

Nothing in the standard says how a field reaches that surface, so nothing said it
could not. The absence of an admission rule is the defect; the individual fields
are symptoms.

A second failure is procedural. Several field debates have relitigated whether a
concept belongs in the standard because its one implementation is poor. Those are
different questions with different evidence, and merging them means a producer bug
can argue a concept out of the spec, or a good concept can smuggle a bad emitter
onto the stable surface.

This ADR governs how fields enter, move through, and leave the normative surface
that [`GOVERNANCE.md`](../../GOVERNANCE.md) defines. It does not adjudicate any
specific field. Those decisions are recorded as numbered amendments against this
record.

## Decision

### 1. Three independent axes

Field lifecycle, evidence tier, and release state are orthogonal. A field may be
stable with only replicated evidence. A field may have externally observed
evidence and remain normative-optional. Package versions move independently of
specification versions. Collapsing these axes is what let "implemented" become
synonymous with "stable."

### 2. Field lifecycle

```
Draft / reserved → Normative optional → Producer-supported → Stable surface
                                                                    ↓
                                                        Deprecated → Removed
```

**Draft / reserved.** Under discussion. Not published. Implementers must not rely
on it.

**Normative optional.** The concept belongs in the specification. Requires a
precise referent; descriptive rather than evaluative semantics; defined behavior
for missing, empty, unsupported, and stale; declared compatibility rules; public
conformance fixtures; a contract an independent implementer can build from the
pinned bundle in §7; and an identified consumer problem or bounded experiment.

**Producer-supported.** At least one conformant emitter exists. Requires
deterministic output where applicable; perturbation tests; provenance; no
constants presented as measurements; public fixtures passing; documented
limitations.

**Stable surface.** The project makes a compatibility promise. Requires
behavioral consumer use — a consumer whose output differs when the value differs,
not merely one that parses it; perturbation changing consumer behavior
appropriately; corrupt or absent evidence not manufacturing confidence; migration
and deprecation policy; explicit ratification.

A bounded first-party consumer experiment may satisfy the behavioral-use
requirement if it is a real integration rather than a demonstration, the field
changes an actual result, the consumer fails safely on absent or corrupt
evidence, perturbation tests pass, and the decision is ratified. The evidence tier
of such a result remains `REPORTED` or `REPLICATED`. It does not become
`EXTERNALLY OBSERVED`.

### 3. Schema admission criteria

Each criterion carries the procedure that determines it. A criterion with no
runnable procedure is recorded as *not currently determinable* rather than
assumed passed.

| # | Criterion | How determined |
| -- | -- | -- |
| 1 | Referent precisely defined | Written referent statement in the field description |
| 2 | Descriptive, not evaluative | Charter review against GOVERNANCE.md |
| 3 | Perturbs when the referent changes | Perturbation fixture pair (§6) |
| 4 | Missing, empty, unsupported, and stale are distinguishable | Fixture set (§6) |
| 5 | Independently implementable from the pinned bundle (§7) | Inspection of the bundle for sufficiency |
| 6 | Identity and provenance rules defined | Basis fields declared |
| 7 | Forward and backward compatibility specified | Compatibility note in the ADR admitting it |
| 8 | Concrete consumer problem or bounded experiment justifying it | Named problem statement |

Criterion 5 asks whether an independent implementer *could* build it. Whether one
*has* is a stable-surface question, recorded separately in §4.

### 4. Stable-surface promotion criteria

1. At least one conformant producer exists.
2. At least one consumer uses the value behaviorally, not merely parsing it.
3. Perturbing the field changes the consumer result appropriately.
4. Unsupported or corrupt values do not create false certainty.
5. Independent implementation or external observation exists, or the bounded
   first-party exception in §2 is ratified with its evidence tier recorded.
6. Migration and deprecation obligations are documented.

### 5. Removal classes

Removal obligations follow the state a field was published in, not the state its
maintainers wish it were in. Absence of a known consumer is not proof of no
consumer.

| State | Removal rule |
| -- | -- |
| Draft / reserved | Remove freely before publication |
| Experimental, explicitly compatibility-exempt | Minor release with release notes |
| Normative optional | Deprecation notice and documented migration; removal at the next declared breaking boundary |
| Stable surface | ADR, known-consumer notification, migration support, full deprecation cycle |

Relaxing a `required` constraint is a distinct change from ceasing to emit a
field, which is distinct again from removing it from `properties` under
`additionalProperties: false`. The first widens acceptance and affects no
consumer. The second produces artifacts that fail older validators. The third
invalidates artifacts that still carry the field. Sequence them separately and
account for each.

### 6. Fixtures precede admission

A field does not enter normative-optional without: a valid fixture; a minimal
valid fixture; a missing-field fixture; an empty-value fixture; unsupported and
stale fixtures where applicable; an invalid fixture; and a **perturbation pair** —
referent state X producing emitted value X, referent changed to Y producing an
appropriately changed value. Without the pair, criterion 3 is prose rather than a
test.

### 7. The normative bundle

"Implement the specification" is underspecified. An independent implementer
receives a version-pinned bundle of five layers:

| Layer | Governs |
| -- | -- |
| Artifact schema | Shape and scalar constraints |
| Producer profile | Behavioral generation obligations |
| Consumer profile | Reading and missing-evidence behavior |
| Executable fixtures | Testable examples and failures |
| Compatibility policy | How the profiles evolve together |

Obligations such as real-file membership, deterministic ordering, manual-evidence
preservation, and refusal on invalid artifacts cannot be expressed in JSON Schema
and legitimately live in the producer profile. An implementer judged against
obligations not present in the bundle they received has been judged unfairly, and
the resulting conformance signal is void.

### 8. Evidence ladder

```
REPORTED
REPLICATED
EXTERNALLY REVIEWED
EXTERNALLY OBSERVED
INDEPENDENTLY REPRODUCED
```

`EXTERNALLY REVIEWED` means someone outside the originating organization examined
the output. `EXTERNALLY OBSERVED` means behavior was demonstrated in a consumer
that party maintains. As of this record, `EXTERNALLY OBSERVED` has no occupant.
That rung is recorded as empty rather than filled by promoting a review.

### 9. Release-state evidence

Every release-state assertion carries version, dist-tag, published-at,
observed-at, and source. A bare version string is an unqualified temporal claim
that goes stale, not a fabrication; the term *fabrication* is reserved for a
claimed measurement that does not move with its referent.

Package versions and specification versions are independent. The CLI reports its
package version; the artifact reports its specification version; each producer
declares its supported specification range; producer and algorithm identity
belong in basis metadata. This independence is documented where the install
command is, not only here.

### 10. Grandfathered paths

`manual.fragileFiles`, `manual.coChangePatterns`, `generated.fileIndex`, and
`generated.frameworkManifest` predate this record. They are **stable surfaces
carrying audit debt**, not retroactively readmitted under these rules and not
demoted without migration.

**Interlock:** no field may be promoted to the stable surface until all four have
an explicit disposition — keep, specify, reclassify, deprecate, or remove. The
interlock is the only gate; no calendar date and no release anchor applies, since
anchoring to a deferred release makes the gate unreachable.

*Specify* is a disposition in its own right. Where a path's contract is
underdetermined rather than wrong, the adjudication is to write the contract, not
to change the path's status.

### 11. Amendments

This record is amended, never forked. Reviewers fetch the canonical revision,
review against it, and submit numbered amendments. Each amendment is recorded in
the ratification issue with proposal, disposition, rationale, authority, decision
date, effective revision, and supersession. One owner updates this file and records the new revision.

A full rewritten copy of this document produced elsewhere is not an amendment and
carries no authority regardless of its merit.

## Boundaries

This record covers the rules by which a field crosses the normative surface. It
does **not** cover:

- **Any specific field's disposition.** Those are numbered amendments. A record
  that both sets the rule and applies it to a contested field lets the field's
  merits argue against the rule, which is the procedural failure described in
  the context above.
- **What belongs in the standard at all.** [`GOVERNANCE.md`](../../GOVERNANCE.md)
  defines the normative surface and the descriptive-not-prescriptive charter.
  This record governs movement across that surface, not its extent.
- **Producer implementation quality.** Whether a given emitter is correct is
  measured by the producer profile and the conformance suite. §2's
  producer-supported tier requires that a conformant emitter exist; it does not
  define conformance.
- **Release mechanics.** How packages are versioned, tagged and published is
  [`docs/versioning.md`](../versioning.md). §9 asserts only that the two version
  numbers are independent.
- **The donation or governance home.** Who eventually stewards the standard is a
  separate decision, and §11's amendment mechanism assumes the current
  sole-steward model.
- **Retroactive judgment of the grandfathered paths.** §10 requires that each of
  the four carry a disposition. It does not presume what any disposition should
  be, and *keep* is one of them.

## Consequences

Admission becomes slower and falsifiable. Some fields will sit at
normative-optional indefinitely, which is the correct outcome for a field nobody
consumes. The four grandfathered paths block stable-surface promotion until
adjudicated, which is intentional: the paths external consumers are measured
against should not be the only ones never tested against the rules.

Fields that cannot answer a criterion are recorded as *not currently
determinable*. Several will be, and that is the honest state rather than a gap in
the model.

## Supersession

Replace this record when the standard acquires a governance body other than sole
stewardship. §11's amendment mechanism assumes one owner who updates the file and
records the new revision and digest, and that assumption does not survive shared
authority. Replace it also if an external standards process adopts the format and
brings its own admission procedure.

Any replacement must state what happens to amendments still open against this
record, and whether the §10 interlock carries forward or is discharged. An
interlock that lapses silently across a supersession would let the four
grandfathered paths escape the disposition requirement without anyone having
decided that they should.

## Provenance

Written 2026-07-27 in `workspacejson/standard`. Unlike [ADR-001](./001-canonical-artifact-path.md)
and [ADR-002](./002-bounded-enrichment-program.md), this record was not
transcribed from an earlier internal document; it was drafted directly against
the repository. The evidence snapshot in the metadata table records the registry
and schema state observed at drafting.

The ratification ledger is the internal issue named in the metadata table, which
holds amendment dispositions, rationale, authority and decision dates per §11.
Two conflicts with an existing internal governance record were logged in the
ratification issue and are resolved by this ratification:

- **C-1 — Dated gates.** §10 states the interlock is the only gate and no
  calendar date or release anchor applies. This supersedes the contrary
  assertion in the internal governance record. No universal calendar-based
  admission gate is required for grandfathered paths.

- **C-2 — Hygiene framing.** `generated.hygiene` is already published on two
  normative surfaces (the schema and the rules export). The operative question
  is a §5 removal class, not an admission test. A-002's disposition (deprecate
  and remove) follows from this framing.

A-007 and A-008 were added on 2026-07-27, after the initial six, during a
reconciliation of the record against its own §10 interlock. That reconciliation
found the interlock unsatisfiable as drafted: it requires a disposition for all
four grandfathered paths, while only `generated.fileIndex` and
`manual.coChangePatterns` carried amendments. A-002 and A-003 concern
`generated.hygiene` and `generated.topology`, neither of which is a grandfathered
path.

## Amendments against revision 1

| ID | Proposal | Disposition | Decision date |
| -- | -- | -- | -- |
| A-001 | Decompose `health` removal into three sequenced changes per §5; land the `required` relaxation independently of emission cessation, which follows META-103's census | **Remove** — staged deprecation via META-103 | 2026-08-03 |
| A-002 | `generated.hygiene` disposition — decide whether it fails on charter grounds or on portability and reproducibility grounds; the framings differ in whether a documented algorithm could rescue it | **Remove** — deprecate and remove from neutral standard | 2026-08-03 |
| A-003 | `generated.topology` disposition — the emitter's contract is now observable; ratify as written, scope as a producer extension, reshape, or remove | **Keep** — normative-optional and producer-supported; not stable | 2026-08-03 |
| A-004 | `generated.fileIndex` profile packaging — separate the stable inventory contract from unresolved per-file value semantics per §7 | **Keep and specify** — stable inventory contract; inner values not stable | 2026-08-03 |
| A-005 | `manual.coChangePatterns` item contract — the weakest of the four; currently bare objects | **Keep and specify** — stable; specify canonical item profile with tolerant v0.4.x reading | 2026-08-03 |
| A-006 | Remove named consumers from normative field descriptions | **Remove** — consumer names removed from normative descriptions | 2026-08-03 |
| A-007 | `manual.fragileFiles` disposition — required by the §10 interlock and absent from the initial six. The v0.5 relocation to `generated` is a stable-surface move on a grandfathered path | **Keep** — remain in `manual`; do not relocate to `generated` | 2026-08-03 |
| A-008 | `generated.frameworkManifest` disposition — required by the §10 interlock and absent from the initial six | **Keep and specify** — stable; specify its contract | 2026-08-03 |

### Ratification record

Each amendment carries its disposition, rationale, authority, decision date,
and effective revision. The effective revision is the Git commit SHA of the
merge that ratifies this record.

**A-001 — `health`**

- Disposition: Remove
- Rationale: `health` is not one of the four demonstrated stable read paths.
  Its aggregate fields are fabricated constants. Removal follows the §5
  sequence (relax `required`, cease emission, remove from `properties`) via
  META-103's consumer census.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

**A-002 — `generated.hygiene`**

- Disposition: Remove
- Rationale: `computeHygieneScore([], 0)` returns A/100 over zero coverage. A
  prescriptive letter grade is a charter violation per GOVERNANCE.md. This is
  a §5 removal question about an exported function and schema property, not an
  admission test. Resolves C-2.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

**A-003 — `generated.topology`**

- Disposition: Keep normative-optional and producer-supported; not stable
- Rationale: The emitter's contract is now observable. The concept belongs in
  the specification but has not demonstrated behavioral consumer use sufficient
  for stable-surface promotion under §4.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

**A-004 — `generated.fileIndex`**

- Disposition: Keep and specify
- Rationale: The stable inventory contract is sound and demonstrated. Per-file
  value semantics are underdetermined and remain outside the stable surface.
  Specify is a disposition in its own right per §10.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

**A-005 — `manual.coChangePatterns`**

- Disposition: Keep and specify
- Rationale: The path is a demonstrated stable read path. Items are currently
  bare objects and need a canonical item profile. Tolerant v0.4.x reading
  applies during the specification transition. Specify is a disposition in its
  own right per §10.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

**A-006 — Named consumers in normative descriptions**

- Disposition: Remove
- Rationale: Normative field descriptions must not name specific consumers.
  The standard is consumer-neutral.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

**A-007 — `manual.fragileFiles`**

- Disposition: Keep in `manual`
- Rationale: The path is a demonstrated stable read path under `manual`.
  Relocating to `generated` would be a stable-surface move on a grandfathered
  path with no demonstrated benefit. The v0.5 relocation proposal is declined.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

**A-008 — `generated.frameworkManifest`**

- Disposition: Keep and specify
- Rationale: HAC-113 adjudicated the disposition. The path is demonstrated and
  its contract needs specification.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03
- Effective revision: *filled at merge*

A-002 and A-003 concern `hygiene` and `topology`, neither of which is a §10
grandfathered path. Of the four paths the interlock names, all four now carry
recorded dispositions: `fileIndex` (A-004), `coChangePatterns` (A-005),
`fragileFiles` (A-007), and `frameworkManifest` (A-008). The §10 interlock is
satisfied.
