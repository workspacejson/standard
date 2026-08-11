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
| **Revision index** | [`index.json`](./index.json) — generated; see [README](./README.md#the-revision-index) |
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

This record is amended, never forked. Reviewers fetch the revision this record
was published at, review against it, and submit numbered amendments. Each
amendment is recorded in the ratification issue with proposal, disposition,
rationale, authority, decision date, effective revision, and supersession. One
owner updates this file.

The revision itself is **not** recorded in this file. A record cannot carry the
identity of the commit that publishes it — the value would have to be written
before the commit it names exists, and any digest of the file would change the
moment it was written into the file. That bookkeeping lives in
[`index.json`](./index.json), which is generated from Git.

What an amendment pins to is the **blob SHA** of the text it was written
against: knowable before merge, immutable after, and required by
`pnpm run check:adr`. The publishing commit and PR are recorded there too, but
as optional metadata — verified when present, never demanded — because a record
that has just merged cannot yet name its own merge commit.

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
stewardship. §11's amendment mechanism assumes one owner who updates the file,
and that assumption does not survive shared authority. Replace it also if an
external standards process adopts the format and
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
| A-009 | `generated.coChange` item shape — admit raw perturbable counts (`support`, `occurrences`) and a `generated`-level `basisRevision`; retire the derived `rate` | **Amend** — counts admitted with a symmetric union denominator, as a staged widening under an unchanged v0.4 profile; `rate` deprecated and accepted until the next profile change; not promoted to the stable surface | 2026-08-09 |
| A-010 | `generated.coChange[].generated` — a required boolean with no reproducible classifier, which forces a producer to assert a classification it cannot derive | **Amend** — reader widening: optional in the observation form, absence meaning *unclassified* rather than `false`; still required in the deprecated legacy form | 2026-08-11 |

### Ratification record

Each amendment carries its disposition, rationale, authority, and decision date
below. Its **effective revision** is the revision recorded for this record in
[`index.json`](./index.json) — all eight took effect together at ratification, so
one pin serves all eight and none of them can drift apart from the file they
amend. Amendments ratified later carry their own dated entry.

**A-001 — `health`**

- Disposition: Remove
- Rationale: `health` is not one of the four demonstrated stable read paths.
  Its aggregate fields are fabricated constants. Removal follows the §5
  sequence (relax `required`, cease emission, remove from `properties`) via
  META-103's consumer census.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

**A-002 — `generated.hygiene`**

- Disposition: Remove
- Rationale: `computeHygieneScore([], 0)` returns A/100 over zero coverage. A
  prescriptive letter grade is a charter violation per GOVERNANCE.md. This is
  a §5 removal question about an exported function and schema property, not an
  admission test. Resolves C-2.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

**A-003 — `generated.topology`**

- Disposition: Keep normative-optional and producer-supported; not stable
- Rationale: The emitter's contract is now observable. The concept belongs in
  the specification but has not demonstrated behavioral consumer use sufficient
  for stable-surface promotion under §4.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

**A-004 — `generated.fileIndex`**

- Disposition: Keep and specify
- Rationale: The stable inventory contract is sound and demonstrated. Per-file
  value semantics are underdetermined and remain outside the stable surface.
  Specify is a disposition in its own right per §10.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

**A-005 — `manual.coChangePatterns`**

- Disposition: Keep and specify
- Rationale: The path is a demonstrated stable read path. Items are currently
  bare objects and need a canonical item profile. Tolerant v0.4.x reading
  applies during the specification transition. Specify is a disposition in its
  own right per §10.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

**A-006 — Named consumers in normative descriptions**

- Disposition: Remove
- Rationale: Normative field descriptions must not name specific consumers.
  The standard is consumer-neutral.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

**A-007 — `manual.fragileFiles`**

- Disposition: Keep in `manual`
- Rationale: The path is a demonstrated stable read path under `manual`.
  Relocating to `generated` would be a stable-surface move on a grandfathered
  path with no demonstrated benefit. The v0.5 relocation proposal is declined.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

**A-008 — `generated.frameworkManifest`**

- Disposition: Keep and specify
- Rationale: HAC-113 adjudicated the disposition. The path is demonstrated and
  its contract needs specification.
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-03

A-002 and A-003 concern `hygiene` and `topology`, neither of which is a §10
grandfathered path. Of the four paths the interlock names, all four now carry
recorded dispositions: `fileIndex` (A-004), `coChangePatterns` (A-005),
`fragileFiles` (A-007), and `frameworkManifest` (A-008). The §10 interlock is
satisfied.

## Amendments ratified after the initial eight

Per §11 an amendment ratified later carries its own dated entry rather than
riding the initial pin.

**A-009 — `generated.coChange` item shape**

- Disposition: Amend the item definition to carry raw observations
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-09
- Ratification ledger: **META-264** (internal tracker) — the ratification issue
  named in this record's metadata table, and the authoritative ledger for every
  amendment against it under §11. A-009's disposition, rationale, authority and
  decision date are recorded there alongside A-001 through A-008, so the
  amendment history stays in one place and is not split across the issues that
  happened to prompt each amendment.
- Implementation receipt: META-309 (internal tracker), which records the Option A
  lock, the union-denominator selection this amendment implements, and the
  landed change. It is the receipt for the work, not the ratification ledger; if
  the two ever disagree, META-264 governs.
- Effective revision: the revision recorded for this record in
  [`index.json`](./index.json), as for the initial eight
- Lifecycle state after this amendment: **normative optional**. This amendment
  does not promote `generated.coChange` toward the stable surface, and §10's
  interlock is untouched.

*Proposal.* `generated.coChange` items required a `rate` — a continuous value in
[0,1] — and forbade raw counts under `additionalProperties: false`. A producer
mining the commit graph therefore had nowhere to put what it actually measures,
and every new commit moved every rate, so a deterministic `generate --check`
could never settle. Admit `support` and `occurrences`; pin the basis once at
`generated` level; retire `rate`.

*Rationale.* A rate is a reader's question, not a producer's observation. Storing
it makes the artifact churn on every commit and forces one analytical
interpretation on every consumer. Raw counts perturb when the referent changes
(§3 criterion 3) without inviting recomputation of anything else, and readers who
want a rate, probability, lift, confidence or ranking can derive it. This follows
the same reasoning that removed the derived hygiene grade under A-002.

*The denominator is symmetric, and this is load-bearing.* `coChange[].files` is
an unordered pair with set semantics. An unordered pair has no subject file, so a
denominator defined as "commits in which the subject file changed" is not
well-defined: given A changing in 20 qualifying commits, B in 12, and both in 8,
two otherwise conforming producers could emit `occurrences: 20` or
`occurrences: 12` for the same observation and both be right. That defeats
independent reproducibility, which is the entire purpose of publishing counts
rather than a rate. The admitted definitions are therefore both symmetric:

- `support` — distinct qualifying commits in which **both** files changed;
- `occurrences` — distinct qualifying commits in which **at least one** of the
  two files changed.

Both count commits, not file events and not ordered relationships. Reversing the
two entries of `files` changes neither, so the same observation has exactly one
representation regardless of storage order.

*What this amendment deliberately does not decide.* A *qualifying commit* is one
inside the analysis boundary already declared by the producer — the same boundary
governing every other observation in `generated`. History window, merge handling,
rename following and path normalization are producer-profile concerns under §7
and are **not** settled here; this amendment requires only that one boundary is
applied identically to `support` and `occurrences` in every entry, and that the
commits counted are reachable from the declared basis. Path canonicalization is
untouched and remains the subject of its own draft record, which is not in this
amendment's dependency chain.

*The profile identifier does not move, so the two contracts must coexist.* A
document declares which contract it obeys through `generated.specVersion`, and
nothing else on disk carries that information. Amending the item shape while
holding the identifier at `"0.4"` would therefore have produced two mutually
incompatible contracts under one name: a validator could not tell which applied,
and a package version is invisible to an artifact. Rather than spend a new
profile identifier — which would collide with the deferred v0.5 program — this
amendment keeps `"0.4"` and makes the two forms **coexist explicitly**, so that
form is a property of the entry rather than a guess about the producer.

An entry takes exactly one of:

| Form | Carries | Status |
| -- | -- | -- |
| Legacy | `rate` + `occurrences` | Deprecated; accepted so published artifacts stay valid |
| Observation | `support` + `occurrences` | The contract new producers emit |

An entry carrying **both** is invalid: they are different contracts, the counts
need not agree, and a reader cannot know which was measured. An entry carrying
**neither** is invalid: an `occurrences` with no numerator is not an observation
in either form. This is a `oneOf` in the schema and a `?: never` union in the
types, so the exclusion holds at validation time and at compile time.

Each `oneOf` branch states both what it requires **and** what it forbids. The
exactly-one-match arithmetic is not sufficient on its own once one branch carries
a constraint the other does not: an entry with `rate` and `support` and
`occurrences: 0` matched the legacy branch, failed the observation branch on the
minimum below, and so satisfied `oneOf` with exactly one match — admitting the
both-form entry the rule exists to forbid, and making a mixed array containing it
read as homogeneously legacy. "Exactly one branch passed" was true for the wrong
reason. The explicit `not` clauses make each branch reject the other
representation on its own terms, and both adversarial cases ship as fixtures.

The array is additionally **homogeneous**: every entry is in the legacy form, or
every entry is in the observation form. Per-entry exclusivity is not sufficient,
because each entry of a mixed array is individually well-formed — one artifact
would then carry two meanings of `occurrences` with nothing at the collection
level saying so, and a reader aggregating across entries would silently combine
them. An empty array satisfies both branches vacuously.

*Zero denominators.* Observation-form `occurrences` has a **minimum of 1**. This
follows from the producer model rather than from taste: a pair enters the
observation set because at least one of its files appeared in at least one
qualifying commit, so a pair whose union of qualifying commits is empty was never
observed at all. Absence of an entry, not an entry with a zero denominator, is
how an unobserved pair is represented, and `occurrences: 0` describes not a
repository state but a producer that emitted a row it had no evidence for.

The consequence is that `support / occurrences` is **total** on a conforming
artifact: no reader can derive `0/0`, `NaN` or infinity from one, and no reader
needs a guard the standard failed to specify. The rejected alternative — defining
a zero denominator as "unavailable" — would have moved that guard into every
consumer, where one omission produces `NaN` in a report. Legacy `occurrences`
keeps its original minimum of 0; narrowing it would invalidate published
artifacts.

`occurrences` is present in both forms and **means different things in each** —
the union denominator in the observation form, and the unspecified pre-amendment
quantity in the legacy form. That is stated in the field's own description
because a reader who takes the union reading of a legacy value would be wrong
without any signal that they were. Values must not be compared across forms.

*Basis pinning.* `generated.basisRevision` is the full-length lowercase
hexadecimal Git object name of the commit at the tip of the analyzed history — 40
characters for SHA-1, 64 for SHA-256. Abbreviations, branch names, tags and other
symbolic references are rejected, because a pin that does not name exactly one
commit permanently cannot be recounted against. It is declared once for the
section and never per item: repeating it per item would admit a document whose
entries were counted at different revisions. This satisfies §3 criterion 6.

**The contract is scoped to the observation form, including the pattern.**
`basisRevision` is declared at `generated` level with a description and no
constraints. Both the requirement and the object-ID pattern live inside the
conditional `then` branch that fires only when an observation-form entry is
present. This is deliberate and load-bearing: `generated` is
`additionalProperties: true`, so a legacy artifact may already carry the key with
any value — `"HEAD"`, a branch name, an abbreviation — and a globally declared
pattern would have made such a document newly invalid, turning this amendment
into a narrowing by the back door. `cochange-legacy-head-basis-v0.4.json` is the
regression fixture; the same `"HEAD"` value is rejected the moment an
observation-form entry appears, so the scoping is enforcement rather than
permissiveness.

*Four states of `generated.coChange`, defined.* The states are distinguishable by
a reader, and each is defined here so that none can be read as another:

| State | Shape | Means |
| -- | -- | -- |
| Not analyzed | `coChange` absent | The producer did not look. Asserts nothing about the repository. |
| Legacy / unknown | `coChange: []`, no pin | **Not evidence of zero.** An empty array carries no discriminator, so nothing distinguishes a legacy producer that emits `[]` from an observation producer that found nothing. A reader must treat it as unknown. |
| Analyzed, no qualifying pairs | `coChange: []`, pinned | A positive finding: the analysis ran at that revision and produced no qualifying pairs. |
| Stale observation | pin ≠ the repository's current revision | The observations are real but describe an earlier revision. Determined by a reader comparing the pin to the current revision; it is a relation, not a document state, which is why it has no standalone fixture. |

Defining the unpinned empty array as *legacy/unknown* rather than as a
zero-evidence claim is what makes the set distinguishable. Requiring a pin there
was considered and rejected: it would invalidate legacy artifacts and defeat the
transition. So the obligation is asymmetric and stated as such — a producer
emitting the observation form declares `basisRevision` whenever
`generated.coChange` exists **including when the array is empty**, while a reader
encountering an unpinned empty array draws no conclusion from it. Each of the
first three states ships as an executable fixture
(`cochange-absent-v0.4.json`, `cochange-empty-unpinned-v0.4.json`,
`cochange-empty-pinned-v0.4.json`).

*One obligation lives outside the schema.* `support <= occurrences` holds by
construction, since the commits `support` counts are a subset of those
`occurrences` counts. JSON Schema draft 2020-12 cannot compare two instance
values, so this cannot be expressed in the artifact schema and is enforced by the
reference validator instead. Under §7 that makes it a producer-profile
obligation, and an implementer validating with a bare JSON Schema validator
receives a strictly weaker check than the reference implementation applies. That
asymmetry is disclosed in [`docs/conformance.md`](../conformance.md) rather than
left to be discovered, because §7 voids a conformance signal measured against
obligations absent from the bundle the implementer received.

*Compatibility (§3 criterion 7).* At the **document** level this is a pure
widening: every document that validated before this amendment validates after
it. The legacy form is still accepted, `rate` is still declared, no previously
optional field becomes unconditionally required, no previously accepted value
range is narrowed, and the `basisRevision` pattern is scoped so that a legacy
artifact carrying `"HEAD"` stays valid. The four stable read paths are untouched,
no v0.3 document is affected, and `generated.specVersion` does not move — the
profile is still v0.4, and no new profile identifier is minted.

At the **package API** level it is not free, and the cost is named rather than
elided. `CoChangeEntry` was a single interface with `rate: number`; it is now a
union whose members declare the other form's field as `?: never`. Reading
`entry.rate` off the union therefore yields `number | undefined` instead of
`number`, so a TypeScript consumer that assigns it without narrowing stops
compiling. That is a real source-level break for readers, it is why the release
is a package minor rather than a patch, and it is asserted in
`src/type-invariants.ts` rather than merely described. The runtime shape of every
existing artifact is unaffected; only the type of code reading it changes.

*Sequencing (§5).* §5 requires that relaxing a `required` constraint, ceasing to
emit a field, and removing it from `properties` be sequenced separately and
accounted for individually. `generated.coChange` is normative-optional rather
than stable-surface, so §5 does not compel that discipline here — it is applied
voluntarily, because the alternative was two incompatible contracts sharing one
profile identifier:

1. **Widen the reader.** This amendment. Both forms accepted, neither required;
   the observation form becomes expressible. No producer changes. Nothing that
   validated stops validating.
2. **Verify known consumer adoption.** Establish that readers which
   validate-before-read accept the observation form, on the ADR-004 §8 pattern.
   Widening what a reader accepts is not permission to emit, and the two steps
   must not be collapsed. The gate is specified below.
3. **Enable emission.** The commit-graph producer projects its counts into the
   observation form. Only then does an artifact in the wild carry `support`.

#### The step-2 gate

Stated as conditions rather than as intent, because a gate whose criteria are
written after the fact is not a gate.

**Authority is split, deliberately.** META-309 authorizes **reader widening
only** — this amendment, and nothing downstream of it. Enabling observation-form
emission is owned **exclusively by META-297**. Neither issue may take the other's
step: this record does not authorize a producer to emit `support`, and META-297
does not reopen the contract decided here. A producer that begins emitting on the
authority of this amendment alone has skipped the gate.

**Known consumers are inventoried at pinned revisions.** Every consumer is
recorded at a specific revision — a claim about a moving branch is not evidence —
and classified as exactly one of:

| Classification | Meaning |
| -- | -- |
| **Supports both forms** | Verified to validate and read both the legacy and observation forms without error at the pinned revision |
| **Does not consume this surface** | Verified not to read `generated.coChange` at all at the pinned revision, so the transition cannot affect it |
| **Blocked** | Reads the surface and is not verified to accept both forms, or could not be inspected |

The inventory covers the **locally available checkout universe**, defined by
enumeration rather than by recollection: every Git checkout reachable on the
steward's machine was listed with its `origin` remote, and every checkout whose
remote is in the `workspacejson`, `workspace-json` or `buildomator`
organizations was inspected. Two repositories that earlier drafts of this
inventory omitted — `workspace-json/agents-audit` and `workspace-json/codex-mcp`
— were found that way, which is the argument for enumerating rather than listing
from memory. The two GitHub namespaces were **not** enumerated remotely, so a
repository in either organization with no local checkout would not appear here;
that is a bound on this inventory, not a claim that none exists.

Each repository was searched for three things: a dependency on or import of
`@workspacejson/spec`; a call to `validate`, `validateV4` or `validateLegacy`;
and any read of `generated.coChange`.

| Consumer | Pinned revision | Classification | Basis |
| -- | -- | -- | -- |
| `workspacejson/cli` | `40f477ade8581345cb1925c288db0619a0f085ae` | Does not consume this surface | Producer role; its own conformance suite asserts `generated.coChange` is not emitted, and no read path consumes it |
| `workspacejson/integrations` | `219d3322f4fe39d21ae8a8b15b5634764b90df2c` | Does not consume this surface | `src/services/workspace.ts` reads the four stable paths and carries an explicit comment that `generated.coChange` is deliberately not read |
| `workspace-json/codex-mcp` | `ddcd7b70ac231b1d8ec559bf69eea90ad8dd615d` | Does not consume this surface | Same reader, byte-identical to the `integrations` copy; `integrations` is its successor |
| `workspacejson/workspacejson.dev` | `0ae63b9c494ace02eec8d06ad27a0977aacdf71d` | Does not consume this surface | Documentation and fixtures only; no fixture carries `generated.coChange`, and its published prose is stale rather than executable |
| `workspace-json/agents-audit` | `b6c092bdfc8447ce6c408d4e06e0f67b9578f2c7` | Does not consume this surface | No reader code touches `generated.coChange`; its only occurrences are inside its own vendored pre-extraction copy of `packages/spec` (that package's README, CHANGELOG and unit test). Caveats, neither of which affects this classification: it holds publication authority for `@workspacejson/spec`, its vendored schema copy still carries the pre-amendment `rate`-required item shape, and its working tree at this revision has uncommitted changes, so the pin names the commit rather than the tree that was read. Recorded as a release blocker below |
| Buildomator | `6091ff20f277b5222eed57d003e436200c7e35bc` | **Blocked (held by the steward)** | Source inspected at that revision: `bin/lib/workspace-json.cjs` reads `generated.frameworkManifest`, `generated.fileIndex`, `manual.fragileFiles` and `manual.coChangePatterns` and nothing else; zero references to `generated.coChange`; no dependency on `@workspacejson/spec`; no schema validation of the artifact. On the evidence this is *does not consume this surface*. It is held blocked pending maintainer confirmation — see below |

**Every actual consumer must pass both-form fixtures.** A consumer classified
*supports both forms* demonstrates it by validating and reading
`cochange-legacy-rate-v0.4.json`, `cochange-legacy-head-basis-v0.4.json` and
`cochange-observations-v0.4.json` at its pinned revision. Parsing without error
is not sufficient where the consumer derives a value from `occurrences`: the two
forms carry different denominators, so a consumer that reads them
interchangeably passes a parse test and still produces wrong output. **No
consumer currently carries this classification**, because none of the six reads
the surface; the obligation binds the first one that does.

**Buildomator: pinned source evidence obtained, classification held.** The gate
required pinned source evidence *or* maintainer confirmation, and the evidence
now exists — Buildomator reads the four stable paths and never touches
`generated.coChange`. It is nonetheless **held in the blocked class**, because
the evidence is a local checkout of `master` with an uncommitted modification and
a vendored `dist/` copy, which establishes what that working tree does and not
what the published plugin its users run does. §5's rule that absence of a known
consumer is not proof of no consumer applies to the gap between a working tree
and a release. Maintainer confirmation, or evidence pinned to a published
version, discharges it.

#### Release blocker surfaced by this inventory

Distinct from the step-2 gate, and recorded here because the inventory is what
surfaced it.

**`@workspacejson/spec@0.5.0` must not publish from `agents-audit` until that
repository's vendored schema and its publication authority are reconciled.**

`agents-audit` holds publication authority for `@workspacejson/spec` and
`@workspacejson/rules`, and its release workflow runs `changeset publish`. It
also vendors its own pre-extraction copy of `packages/spec`, whose schema still
requires `rate` and knows nothing of the observation form. Publishing from there
in that state would ship a package whose in-tree schema contradicts the amended
normative schema in this repository — reintroducing the two-sources-of-truth
failure the single-canonical-schema rule exists to prevent, and doing it under a
version number consumers would reasonably read as authoritative.

Scope, stated precisely so this is not read as broader than it is:

- It does **not** block this record, the A-009 amendment, or the schema change
  landing in `workspacejson/standard`.
- It does **not** block the step-2 consumer gate, which concerns readers.
- It **does** block publication of `@workspacejson/spec@0.5.0` to the registry.

Discharged by the release-authority cutover, or by reconciling the vendored copy
against the canonical schema before any publish — not by this amendment.

**Any consumer left in the blocked class keeps emission disabled.** One blocked
consumer is sufficient to hold step 3. The gate is not a majority and not a
best-effort survey; an unresolved classification is a failed gate, and the
correct outcome is that the producer keeps emitting nothing rather than that the
inventory be rounded up. As of this record Buildomator is held blocked, so
**step 3 is not open.**

Removal of `rate` is **step 4 and is not authorized by this amendment.** It
happens at the next document-profile change, where a `specVersion` move is
already occurring and the removal costs nothing additional. Until then the
legacy form stays valid, and the transition's cost is honest: while both forms
are accepted, the union-denominator guarantee holds only for entries that
actually use the observation form. A reader must check the form, not assume it.

*Fixtures (§6).* Valid, minimal-valid, missing-field, empty-value and invalid
fixtures ship in `packages/spec/examples/` and the new
`packages/spec/examples/invalid/`, executed by `pnpm run check:examples` in both
directions. The perturbation pair required by criterion 3 is the swap-invariance
case: the same referent stored in either pair order produces identical counts and
identical consumer joins, while a changed referent changes the counts.

The transition adds fixture obligations beyond the field itself.
`cochange-legacy-rate-v0.4.json` and `cochange-legacy-head-basis-v0.4.json` are
executable proofs that a pre-amendment artifact still validates — the second
specifically that a legacy `basisRevision: "HEAD"` survives, which is the
regression that would appear the moment the pattern leaked to global scope.
Without them, "this is a widening" would be prose.
`cochange-both-representations.json` and `cochange-neither-representation.json`
pin the item `oneOf`; `cochange-mixed-forms.json` pins collection homogeneity,
which per-entry fixtures cannot reach because each of its entries is
individually well-formed; and `cochange-zero-denominator.json` pins the
`occurrences >= 1` bound.

| §3 criterion | How it is met |
| -- | -- |
| 1 Referent precisely defined | Counting semantics written into both schema mirrors: distinct qualifying commits, both files versus at least one |
| 2 Descriptive, not evaluative | Raw counts only; no stored rate, score, grade or ranking |
| 3 Perturbs when the referent changes | Perturbation and swap-invariance fixtures in `packages/spec/src/index.test.ts` |
| 4 Missing, empty, unsupported and stale distinguishable | **Met.** Four states defined above and separated by shape: absent (not analyzed), unpinned empty (legacy/unknown, explicitly not evidence of zero), pinned empty (analyzed, no qualifying pairs), pin ≠ current revision (stale). The first three ship as executable fixtures; the fourth is a reader-side comparison the pin exists to enable |
| 5 Independently implementable from the pinned bundle | Schema, both descriptions, the out-of-schema invariant and the executable fixtures ship together; the undecided boundary questions are named as producer-profile concerns rather than left silent |
| 6 Identity and provenance rules defined | `generated.basisRevision`, defined above |
| 7 Forward and backward compatibility specified | Compatibility paragraph above |
| 8 Concrete consumer problem | A commit-graph producer had no conforming shape for the counts it measures, blocking every downstream diagnostic that reads the committed artifact |

**A-010 — `generated.coChange[].generated`**

- Disposition: Amend the item definition to make the classification flag
  optional in the observation form
- Authority: Qwynn Marcelle, sole steward
- Decision date: 2026-08-11
- Ratification ledger: **META-264** (internal tracker), as for A-001 through
  A-009 — the ledger named in this record's metadata table, and the authoritative
  history for every amendment against it under §11
- Implementation receipt: META-316 (internal tracker), which records the defect,
  the reader-widening decision, and the landed change. It is the receipt for the
  work, not the ratification ledger; if the two disagree, META-264 governs
- Effective revision: the revision recorded for this record in
  [`index.json`](./index.json), as for the amendments before it
- Lifecycle state after this amendment: **normative optional**, unchanged.
  `generated.coChange` is not promoted toward the stable surface and §10's
  interlock is untouched

*Proposal.* A-009 left `generated` in the item's `required` set, where it had sat
since before the observation form existed. It is a boolean, so a producer must
emit `true` or `false` for every pair. Make it optional, and define absence.

*The defect is unsupported certainty, not a missing feature.* `support` and
`occurrences` are observations: a producer counts commits and reports what it
counted, and a second producer counting the same commits gets the same numbers.
`generated` is a **classification**. Answering it requires a judgement about what
a file *is* — that `pnpm-lock.yaml` is a lockfile, that a file under `dist/` is
built rather than authored — and no portable deterministic classifier from public
repository inputs is specified anywhere in this standard. A required boolean does
not produce that judgement. It produces a *value*, and the value carries the
authority of the artifact regardless of whether anything backed it.

This was not hypothetical when the amendment was written. The Phase 3
commit-graph producer had no classifier and emitted a constant `false`. On its
pinned fixture the top-ranked pair was `package-lock.json ↔ package.json` —
carrying `generated: false`, which under the pre-amendment contract asserts *this
is a real source coupling, do not skip it*, about the single most textbook
tooling-coupled pair in the ecosystem. The field was not merely uninformative; it
was confidently wrong, and it was wrong because the schema required an answer.

*Why widening the reader rather than specifying a classifier.* The alternative
was to specify a portable classifier and require independent producers to agree
on it. That was rejected, and not on effort grounds. Such a classifier does not
exist today, and inventing one inside a producer would put a §7 producer-profile
heuristic — path patterns, filename lists, generated-file conventions that differ
per ecosystem and per repository — behind a field that reads as normative. Two
conforming producers would then classify the same pair differently while both
validating, which is the §3 criterion 1 failure (referent not precisely defined)
dressed as a boolean. Better to admit the standard has no classifier than to
publish one that cannot be reproduced. If a public, deterministic,
perturbation-tested classifier is later specified, this amendment does not stand
in its way: the property is retained, and specifying its derivation is a later
amendment rather than a reversal of this one.

*Absence is a third state, and this is the operative rule.* A reader must not
collapse an absent flag into `false`.

| Value | Means |
| -- | -- |
| `true` | Classified as tooling-coupled; a consumer surfacing real source couplings should skip the pair |
| `false` | Classified as **not** tooling-coupled |
| **absent** | **No classification was performed.** The producer asserts nothing either way |

Collapsing absent into `false` converts a producer's silence into a positive
claim that the pair is a real source coupling — the same error the constant
`false` above made, relocated from the producer into the reader. It is also the
easy error to make, because `if (!entry.generated)` is the idiomatic falsy test
and it is wrong here. The consumer guidance in
[`docs/troubleshooting.md`](../troubleshooting.md),
[`docs/glossary.md`](../glossary.md), [`docs/versioning.md`](../versioning.md)
and the package README is corrected accordingly, and
`cochange-unclassified-v0.4.json` ships as the executable case: an
observation-form document in which every entry omits the flag, carrying an
unflagged lockfile pair precisely so that a reader which resolves absence to
`false` produces a visibly wrong answer against it.

A producer omits the flag unless it implements a public, deterministic,
perturbation-tested classifier. Because two producers may classify the same pair
differently and both conform, **the flag is not a producer-comparison surface**:
Role A agreement is measured on `files`, `support` and `occurrences`, and a
disagreement on `generated` is not a conformance failure.

*The widening is asymmetric, deliberately.* The requirement did not disappear; it
moved into the legacy `oneOf` branch. The legacy form is deprecated and frozen
until the next document-profile change, every artifact published in it already
carries the flag, and widening it too would loosen a shape no producer should
still be emitting — buying nothing and weakening a fixture surface. The narrow
change is the one that resolves the defect.
`cochange-legacy-missing-generated.json` is the negative fixture that pins the
asymmetry: it is rejected before repair and valid after restoring the one field
its comment names.

*Compatibility (§3 criterion 7).* At the **document** level this is a pure
widening: every document valid before this amendment is valid after it. Nothing
that was optional becomes required, no value range narrows, no v0.3 document is
affected, the four stable read paths are untouched, and `generated.specVersion`
does not move. At the **package API** level `generated` moves off
`CoChangeEntryCommon`: it stays `boolean` on `LegacyCoChangeEntry` and becomes
`boolean | undefined` on `ObservationCoChangeEntry`. A TypeScript consumer that
assigns `entry.generated` to a bare `boolean` without narrowing stops compiling —
which is the intended outcome, since that consumer was the one at risk of reading
absence as `false`. Asserted in `src/type-invariants.ts` rather than described.

*Sequencing (§5).* §5's discipline concerns relaxing `required`, ceasing
emission, and removing a property. This amendment performs only the first, on a
normative-optional path, and it does not authorize anything downstream. It does
**not** authorize observation-form emission — that gate is A-009 step 2 and is
owned by META-297, and it remains closed on its own terms. It does not remove the
property, and it does not remove `rate`.

*Fixtures (§6).* `cochange-unclassified-v0.4.json` (positive: observation form,
nothing classified, unflagged lockfile pair) and
`cochange-legacy-missing-generated.json` (negative: the legacy form still
requires the flag), both executed by `pnpm run check:examples` in their
respective directions. The behavioral suite in `packages/spec/src/index.test.ts`
covers the three states, per-entry rather than per-array classification, type
rejection of a non-boolean, the form discriminator remaining `support` versus
`rate`, and agreement between the two schema mirrors. The watched-red receipt is
recorded on META-316: restoring the pre-amendment `required` set rejects
`cochange-unclassified-v0.4.json` and turns nine tests red.

| §3 criterion | How it is met |
| -- | -- |
| 1 Referent precisely defined | Three states defined above and in both schema mirrors; the standard states plainly that it specifies no classifier, rather than implying one exists |
| 2 Descriptive, not evaluative | Unchanged; the amendment removes an assertion the producer could not support |
| 3 Perturbs when the referent changes | Where a producer classifies, `true` and `false` remain distinguishable from each other and from absence; asserted at the document level, not merely in the types |
| 4 Missing, empty, unsupported and stale distinguishable | **This amendment is what makes *unsupported* expressible.** Before it, an unclassified pair was indistinguishable from one classified `false` |
| 5 Independently implementable from the pinned bundle | Schema, descriptions and both fixtures ship together; the absence of a classifier is stated rather than left for an implementer to discover |
| 6 Identity and provenance rules defined | Unchanged by this amendment |
| 7 Forward and backward compatibility specified | Compatibility paragraph above |
| 8 Concrete consumer problem | A producer with no classifier had to assert one, and did so wrongly on the highest-ranked pair of its own pinned fixture |
