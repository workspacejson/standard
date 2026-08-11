---
"@workspacejson/spec": minor
---

Make the `generated.coChange[].generated` tooling-coupling flag optional in the
observation form, and define its absence, per ADR-003 amendment A-010. This is a
**reader widening** on a non-stable-floor path; no producer changes and no
emission is enabled by it.

**The flag was a required boolean with no reproducible classifier.** `support`
and `occurrences` are observations — two producers counting the same commits get
the same numbers. `generated` is a *classification*: answering it requires a
judgement about what a file **is**, and this standard specifies no portable
deterministic classifier from public repository inputs. Requiring it did not
produce that judgement, it produced a value. The commit-graph producer, having no
classifier, emitted a constant `false` — which on its pinned fixture asserted
that `package-lock.json ↔ package.json` is a real source coupling that consumers
should **not** skip.

**Absence is a third state, and readers must not collapse it into `false`.**

| Value | Means |
| -- | -- |
| `true` | Classified as tooling-coupled — skip when surfacing real source couplings |
| `false` | Classified as **not** tooling-coupled |
| absent | **No classification performed.** The producer asserts nothing |

So `if (!entry.generated)` is now a bug: it reads an unclassified pair as a
confirmed source coupling. Branch on `undefined` explicitly. A producer omits the
flag unless it implements a public, deterministic, perturbation-tested
classifier, and because two producers may classify the same pair differently and
both conform, the flag is **not** a producer-comparison surface.

**The widening is asymmetric.** The requirement moved into the legacy `oneOf`
branch rather than disappearing: the legacy form is deprecated and frozen, every
artifact published in it already carries the flag, and widening it too would
loosen a shape no producer should still emit.

**At the document level this is a pure widening.** Every document valid before
this release is valid after it. Nothing optional becomes required, no value range
narrows, the four stable read paths are untouched, and `generated.specVersion`
stays at `0.4`. Two fixtures ship as executable proof rather than prose:
`cochange-unclassified-v0.4.json` (observation form, nothing classified, carrying
an unflagged lockfile pair on purpose) and
`cochange-legacy-missing-generated.json` (the legacy form still requires it).

**At the package API level it is a source-level break for TypeScript readers,
which is why this is a minor rather than a patch.** `generated` moves off
`CoChangeEntryCommon`: it remains `boolean` on `LegacyCoChangeEntry` and becomes
`boolean | undefined` on `ObservationCoChangeEntry`. Code assigning
`entry.generated` to a bare `boolean` without narrowing stops compiling — the
intended outcome, since that is exactly the code at risk of reading absence as
`false`. Asserted in `src/type-invariants.ts` rather than described. The runtime
shape of every existing artifact is unaffected.
