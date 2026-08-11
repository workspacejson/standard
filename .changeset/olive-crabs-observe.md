---
"@workspacejson/spec": minor
---

Admit raw co-change commit counts alongside the existing rate, and pin the basis
revision, per ADR-003 amendment A-009. This is the **reader-widening** step of a
staged transition; no producer changes.

**At the document level this is a pure widening.** Every document that validated
before this release validates after it — there is no narrowing anywhere in the
artifact contract. `cochange-legacy-rate-v0.4.json` and
`cochange-legacy-head-basis-v0.4.json` ship as executable proof rather than the
claim being left as prose.

**At the package API level it is a source-level break, and that is why this is a
minor.** `CoChangeEntry` was one interface with `rate: number`; it is now a union
whose members declare the other form's field as `?: never`. Reading `entry.rate`
off the union yields `number | undefined`, so a TypeScript consumer that assigns
it without narrowing **stops compiling**:

```ts
const r: number = entry.rate;          // was fine, now a type error
const r = entry.support !== undefined  // narrow first
  ? entry.support / entry.occurrences
  : entry.rate;
```

The runtime shape of every existing artifact is unaffected; only the type of the
code reading it changes. Asserted in `src/type-invariants.ts`, which `tsc`
compiles — test files are excluded from the build, so a type claim written only
in a test would never be checked.

A `generated.coChange` entry now takes **exactly one of two forms**:

| Form | Carries | Status |
| -- | -- | -- |
| Legacy | `rate` + `occurrences` | Deprecated; still accepted |
| Observation | `support` + `occurrences` | What new producers emit |

```diff
  { files: [a, b], rate: 0.87, occurrences: 9,  generated: false }   // still valid
+ { files: [a, b], support: 8, occurrences: 24, generated: false }   // now valid
```

Those two numbers are the worked invariant, not an illustration. Over the
analyzed history `a` changed in **20** qualifying commits and `b` in **12**, and
**8** commits changed both. `support` is that intersection; `occurrences` is the
symmetric union, `20 + 12 − 8 = 24`. The marginals are deliberately unequal,
because that is what makes the denominator observable: a producer using one
endpoint's marginal would emit 20 or 12 here, and an unordered pair gives it no
principled way to choose between them. 24 is neither.

An entry carrying **both** is invalid — they are different contracts, the counts
need not agree, and a reader cannot know which was measured. An entry carrying
**neither** is invalid. This is a `oneOf` in the schema and a `?: never` union in
the types, so it fails at validation time and at compile time.

The array is also **homogeneous**: every entry legacy, or every entry
observation. Per-entry exclusivity is not enough — each entry of a mixed array is
individually well-formed, so one artifact would carry two meanings of
`occurrences` with nothing saying so. An empty array satisfies both branches.

Observation-form `occurrences` has a **minimum of 1**. A pair enters the
observation set because at least one of its files appeared in at least one
qualifying commit, so a pair whose union is empty was never observed and gets no
entry — absence, not a zero denominator. This makes `support / occurrences` total
on conforming artifacts: no reader can derive `0/0`, `NaN` or infinity, and no
consumer needs a guard the standard failed to specify. Legacy `occurrences` keeps
its original minimum of 0.

- `support` — distinct qualifying commits in which **both** files changed.
- `occurrences` — **in the observation form**, distinct qualifying commits in
  which **at least one** of the two changed.

**`occurrences` means different things in the two forms.** In the observation
form it is the symmetric union denominator. In the legacy form it carries the
pre-amendment meaning, which was never normatively specified and must not be
assumed symmetric. Establish the form before reading it — `entry.support !== undefined` —
and never compare the value across forms.

A rate is a reader's question, not a producer's observation. Storing it churned
the artifact on every commit and forced one analytical reading on every consumer.
Readers derive `support / occurrences`, or probability, lift, confidence or a
ranking, wherever `occurrences > 0`. Nothing derived is stored.

**The denominator is the union, and that is load-bearing.** `files` is an
unordered pair with set semantics, so it has no subject file. A denominator
meaning "commits in which the subject changed" is not well-defined: given A
changing in 20 qualifying commits, B in 12, and both in 8, two conforming
producers could emit `occurrences: 20` or `occurrences: 12` for the same
observation and neither would be wrong. Counting the union makes both fields
symmetric — reversing the stored pair changes nothing — so independent producers
have a comparable surface. Both count **distinct commits**, never file events or
ordered relationships.

`generated.basisRevision` names the revision the counts were taken over: a
full-length lowercase Git object name, 40 hex characters for SHA-1 or 64 for
SHA-256. It sits once at `generated` level, never per item.

**Both the requirement and the pattern are scoped to the observation form.** The
key is declared globally with no constraints, because `generated` is
`additionalProperties: true` and a legacy artifact may already carry it with any
value. A global pattern would have made `basisRevision: "HEAD"` newly invalid —
a narrowing by the back door. `cochange-legacy-head-basis-v0.4.json` is the
regression guard; the same value is still rejected once an observation-form entry
appears.

Four reader-visible states, defined normatively in A-009:

| Shape | Means |
| -- | -- |
| `coChange` absent | Not analyzed |
| `coChange: []`, no pin | Legacy / unknown — **not** evidence of zero |
| `coChange: []`, pinned | Analyzed at that revision; no qualifying pairs |
| pin ≠ current revision | Stale observation |

A producer emitting the observation form declares the pin whenever `coChange`
exists, **including when empty**. Schema validation cannot enforce that case — an
empty array carries no discriminator — so it is a producer obligation, and the
reader-side rule above is what keeps the states distinguishable regardless.

A *qualifying commit* is one inside the analysis boundary the producer already
declares for every other observation in the section. This release defines **no**
new history-window, merge, rename or path-normalization policy.

`support <= occurrences` is enforced by `validate()` and **not** by the schema:
JSON Schema draft 2020-12 cannot compare two instance values, so the invariant is
a producer obligation carried by the profile. A bare JSON Schema validator
accepts a document that violates it. Both directions are pinned by test and
`docs/conformance.md` states the disagreement explicitly. It applies to
observation-form entries only; a legacy entry has no `support`.

`packages/spec/examples/invalid/` is new: eleven negative fixtures, each naming
the single defect it exhibits, checked in CI by `pnpm run check:examples`. The
gate previously ran positives only, which cannot show that anything is rejected.
Rejection by `validate()` is the substantive assertion; the gate also requires
rejection by `validateLegacy()`, which is structural coverage — it keys on the
absence of `generated.specVersion` and never inspects the defect, so it confirms
only that a rejected v0.4 document cannot re-enter through the legacy path.

`version` is now derived from the packaged manifest instead of being a hardcoded
literal with a test asserting the literal. That pair only held while someone
remembered to hand-edit both during a release, and Changesets never rewrites a
constant in source — the first release to move the number would have shipped a
package reporting the old version. The test asserts parity with `package.json`.

**Release sequence.** This is step 1 of three, on the ADR-004 §8 pattern:
**widen the reader → verify known consumer adoption → enable producer emission.**
Widening what a reader accepts is not permission to emit, and the steps must not
be collapsed. Removing `rate` is a separate fourth step at the next
document-profile change, and this release does not authorize it.

**On the version number this produces.** A `minor` bump takes both packages from
`0.4.4` to **`0.5.0`** — `@workspacejson/rules` comes along unchanged because the
two are a fixed release group. That number is the **package** version and says
nothing about the document profile. **The document profile is unchanged: this
release still reads and writes `generated.specVersion: "0.4"`.** Package `0.5.0`
is not spec v0.5, no artifact's `specVersion` moves, no new profile identifier is
minted, and the deferred v0.5 profile work is untouched. The two numbers are
independent by policy — see `docs/versioning.md` — and this is exactly the
release where confusing them would be easiest.

`minor` is the correct bump on its own terms: the artifact contract only widens,
but the exported TypeScript union is a source-level break for readers that access
`entry.rate` without narrowing. The package version moves for that reason, and
the document profile does not move at all.
