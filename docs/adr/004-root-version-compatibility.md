# ADR-004: Root `version` compatibility profile for v0.4.x

| Field | Value |
| -- | -- |
| **Status** | Accepted |
| **Decision date** | 2026-07-28 — ratified; not yet implemented, emission sequenced behind §8 |
| **Record written** | 2026-07-27 |
| **Author** | Qwynn Marcelle ([@qmarcelle](https://github.com/qmarcelle)) |
| **Decider** | Qwynn Marcelle |
| **Ratifying authority** | Qwynn Marcelle, sole steward ([OWNERSHIP.md](../../OWNERSHIP.md)) |
| **Canonical repository** | `workspacejson/standard` |
| **Canonical path** | `docs/adr/004-root-version-compatibility.md` |
| **Evidence snapshot** | `origin/main` at `2ad168a`; `@workspacejson/spec@0.4.4`; external reader observed 2026-07-27 |
| **Supersedes** | Nothing |
| **Superseded by** | Nothing |
| **Depends on** | [ADR-001](./001-canonical-artifact-path.md) |
| **Spec version at decision** | v0.4 |

## Context

A document declares its format profile in `generated.specVersion`. At least one
external consumer instead gates on a **root** `version` key, which no producer
has ever emitted. That gate has therefore never executed. It is inert, not
merely untriggered, and the consumer discovered this in their own reader rather
than being told.

Repairing the mismatch looks additive. It is not, and two measurements decide
the shape of this record.

### The root object is closed

`packages/spec/schema/v1.json` declares `"additionalProperties": false` at the
root. Adding a root key does not extend a document — it invalidates it. Measured
against the shipped validator at `@workspacejson/spec@0.4.4`:

| Document | As shipped | With root `version` added |
| -- | -- | -- |
| `examples/minimal-v0.3.json` | `validate` → `true` | `validate` → `false` |
| `examples/populated-v0.4.json` | `validate`, `validateV4` → `true` | both → `false` |

So the change is additive to the schema as a document and breaking for every
already-deployed reader that validates. [`docs/conformance.md`](../conformance.md)
tells consumers to "validate before reading, rather than trusting shape" — which
means the standard's own guidance is what creates the exposure. Consumers who
followed it break; consumers who ignored it do not.

That is not an argument for softening the guidance. It is why §8 below is
ordered the way it is.

Note the asymmetry that produced this: `generated` is `additionalProperties:
true`, so `specVersion` can grow siblings freely. The root cannot. That is very
likely why the field was nested in the first place.

### The external gate compares majors only

The one known external consumer reads `.agents/workspace.json` at session start
and gates on the root key. As observed on 2026-07-27 in the public reader
(`buildomator/buildomator`, `bin/lib/workspace-json.cjs`), the supported set is
`['0.1']`, and the comparison splits on `.` and keeps the **major** component
only. On mismatch the reader returns `null` — it does not warn and degrade, it
drops the entire artifact silently.

| Emitted root `version` | Observed result |
| -- | -- |
| `0.1`, `0.3`, `0.4`, `0.4.4` | passes — major `0` is supported |
| `1.0` | **trips — reader returns `null`, total context loss** |

This inverts the assumed risk. Emitting `0.4` now is safe, and is the only way
to exercise a gate that has never run while the stakes are still zero. The
hazard is the 1.0 boundary, where a major-component comparison against a
hardcoded `['0.1']` stops matching.

## Decision

### 1. Shape and accepted values

A new **optional** root property:

```json
"version": { "enum": ["0.3", "0.4"] }
```

A string mirroring `generated.specVersion` exactly, not a semver object and not
a free string. Mirroring the existing enum is what makes §2 mechanically
checkable rather than advisory.

### 2. Equality invariant

When both keys are present they **must** be equal. A document whose root
`version` disagrees with its `generated.specVersion` is **invalid** — not
ambiguous, not resolved by precedence.

### 3. Absence

| Root `version` | `generated.specVersion` | Result |
| -- | -- | -- |
| absent | present | **Valid.** Every document written before this record. Read the profile from `generated.specVersion`. |
| present | present, equal | **Valid.** |
| present | absent | **Invalid** in v0.4.x. `specVersion` remains required — see §5. |
| absent | absent | **Invalid.** Not a v0.3 or v0.4 document; do not guess at its shape. |

Absence of the root key carries no meaning beyond "written by a producer that
predates this profile." It is not a signal, and a consumer must not treat it as
one.

### 4. Disagreement

A reader encountering two present-and-unequal values must **reject the
document**. It must not prefer one, warn and continue, or pick the higher.

Two disagreeing profile declarations are evidence that something upstream is
wrong. Choosing between them silently converts a detectable producer defect into
an undetectable consumer misread, which is precisely the class of failure this
project treats as most expensive.

### 5. `generated.specVersion` is unchanged in this release line

None of the three distinct operations happen to it in v0.4.x:

- its `required` constraint is **not** relaxed;
- producers do **not** stop emitting it;
- it is **not** removed from `properties`.

It remains the primary profile declaration. Root `version` is a mirror added for
readers that look for it, not a replacement. Any future change to `specVersion`
is a separate decision with its own record, and the three operations above must
be sequenced and accounted for individually.

### 6. Widen the existing validator; do not name a new profile

`validate()` and `validateV4()` accept the optional root key. No new profile
name is introduced, and `generated.specVersion` values do not change.

The document profile is still v0.4. What changes is the **validator's accepted
superset**. Introducing a profile name here would imply consumers must branch on
a shape difference, when the entire intent is that a reader which does not care
about the root key is unaffected by its presence.

This is recorded in [`docs/versioning.md`](../versioning.md) as a movement of the
compatibility floor for *validators*, distinct from the four stable read paths,
which this record does not touch.

### 7. Fixtures

Conformance fixtures required before this profile is published:

| Fixture | Asserts |
| -- | -- |
| Root key absent, `specVersion` present | The pre-existing shape stays valid |
| Both present and equal | The new shape validates |
| Both present, disagreeing | **Rejected** — §4 |
| Root present, `specVersion` absent | **Rejected** — §5 |
| Neither present | **Rejected** |
| Perturbation pair | Changing `specVersion` from `0.3` to `0.4` requires the root key to change with it; a fixture where only one moves is rejected |

The perturbation pair is what makes §2 a test rather than prose. Without it the
equality invariant is an assertion nobody checks.

### 8. Emission is sequenced behind adoption

Because the root object is closed, the order is forced. These are three changes,
not one, and they must not land together:

1. **Widen the validator.** Publish a release accepting the optional root key.
   This affects no consumer: no document in existence carries the key, so no
   validation outcome changes.
2. **Wait for adoption.** Consumers running the previous validator reject any
   document carrying the key. Emission before this step completes breaks them.
3. **Emit.** Only then may a producer write the root key.

Step 1 widens acceptance and is safe. Step 3 produces artifacts that fail older
validators. Collapsing them is the failure this sequence exists to prevent.

Step 2 is an evidence requirement, not a waiting period. Before step 3, a census
of known validate-before-read consumers must exist, recording for each: the
consumer, the validator version it runs, and whether that version accepts the
optional root key. Emission is permitted only when every entry accepts it, and
an entry whose validator version cannot be determined counts as not accepting.

A census cannot enumerate consumers nobody knows about, and this record does not
pretend otherwise. It bounds the claim to what is checkable: the standard may
not emit while a *known* consumer is known to break. Publishing the widened
validator and then waiting a fixed interval does not discharge this — an
interval measures elapsed time, not adoption, and the two are only related by
assumption.

### 9. The 1.0 constraint

The observed external gate matches on the **major** component against a
hardcoded supported set. Every `0.x` value passes; `1.0` does not, and failure
is silent and total.

Therefore: **the first release to emit a root `version` whose major component is
not `0` is a breaking change for that consumer**, regardless of what the version
number would otherwise suggest, and regardless of this profile being additive.
It requires notification, a migration path, and confirmation that the consumer's
supported set has been widened *before* the value ships — not concurrently.

Recording it here means the constraint survives independently of whoever
remembers the conversation.

## Boundaries

This record covers the root `version` key, its relationship to
`generated.specVersion`, and the order in which the change may ship. It does
**not** cover:

- **The v0.5 reshape.** Any relocation of a stable read path between `manual`
  and `generated` is a separate decision. This record must not be used to
  justify landing one alongside it — the whole point of separating them is that
  two breaks arriving together are indistinguishable to the consumer debugging
  them.
- **Removing or deprecating `generated.specVersion`.** See §5.
- **The value `1.0` will eventually carry.** §9 records the constraint on
  crossing that boundary, not when to cross it or what the format will be.
- **Producer implementation.** Which producer emits the key, and when, belongs
  to `workspacejson/cli` under the sequence in §8.
- **The schema's `$id` host.** Unchanged and out of scope, as in ADR-001.

## Consequences

The repair is smaller than the v0.5 reshape and can ship independently of it,
which is the main reason to do it now: it decouples a live reader mismatch from
a deferred design question.

An inert gate in the one known external consumer becomes live. Per §9's
measurement it becomes live and harmless, which is the best available outcome —
a gate that first executes at a `1.0` boundary, under a breaking change, having
never run before, is a considerably worse position than one that has been
exercised.

The cost accepted: a document carries its profile in two places, and they can
disagree. §2 and §4 make disagreement invalid rather than ambiguous, and §7
makes it tested, but the redundancy is real and is the price of repairing a
mismatch without breaking the readers that got it right.

Steps 1 and 3 of §8 are separated by an adoption wait of indeterminate length.
That is not a scheduling defect. It is the only ordering that does not break
validating consumers, and shortening it would mean choosing to break them.

## Supersession

Supersede this record when root `version` becomes the primary profile
declaration and `generated.specVersion` is retired, or when a major-version
boundary makes the enum in §1 obsolete.

Any replacement must state what happens to documents carrying both keys, and
must not discharge §9's constraint without evidence that every known consumer's
supported set has been widened. A superseding record that quietly drops the 1.0
constraint would reintroduce exactly the silent, total failure this one exists
to prevent.

## Provenance

Written 2026-07-27 in `workspacejson/standard`, prompted by a reader mismatch
reported by the one known external consumer, who found the inert gate in their
own code.

The two measurements in the context section were taken on 2026-07-27 against
`origin/main` at `2ad168a`: the validator behavior by running the shipped
`validate()` and `validateV4()` against the repository's own examples with and
without a root key, and the external gate behavior by reading the consumer's
public reader source and evaluating its comparison across candidate values. Both
are reproducible from public materials.

The finding that reordered this record is that the change is not additive for
deployed validators. The originating internal issue framed it as additive, which
is correct about the schema and incorrect about the readers — and the difference
is the entire content of §8.
