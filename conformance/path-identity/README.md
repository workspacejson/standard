# Path-identity conformance corpus

The normative semantic corpus for
[ADR-006](../../docs/adr/006-canonical-path-identity.md) — canonical path
identity, stored keys are data not commands.

One corpus, owned by the standard. Producers, readers and integrations are
measured against **this** file rather than against each other, which is the
only way two independent implementations can be said to agree.

| File | What it is |
| -- | -- |
| `corpus.json` | The corpus. Hand-authored, reviewed, normative. |
| `baseline-normalize.mjs` | A reproduction of the matcher shipping **today**, kept so the defect is measurable here. Not a reference implementation. |
| `run-baseline.mjs` | Runs the corpus against that baseline and writes the receipt. |
| `receipt-baseline.json` | **Watched-red evidence.** What the current consumers do to the corpus. |

Gate: `pnpm run check:corpus`.

## What the corpus is not

**It is not a reference implementation, and there is no reference
implementation yet.** The standard-owned `validateStoredKey` is a later step in
the same programme of work. The corpus exists first on purpose: fixtures written
after an implementation are written against its behavior, which is the
difference between ratification and rubber-stamping.

**It is not a schema change.** Nothing here alters `packages/spec/schema/v1.json`
or what `validate()` accepts. Under ADR-006 §9 a v0.4.x reader **reports** a
malformed key and **declines to match** it while continuing over well-formed
data; making validation *reject* such artifacts is a v0.5 document-profile
transition and belongs to neither this directory nor the v0.4.x line.

**It is not published in a package.** The corpus lives in the repository, not in
the `@workspacejson/spec` tarball. Shipping it as a package export is a
distribution decision entangled with the release train, and it is deliberately
not made here. A consumer reproduces or vendors this directory at a pinned
commit; it must not be imported through a sibling-checkout path.

## Case kinds

Only three of the six are decidable as pure string operations. The corpus
carries all six because the contract spans all six, and the runner counts the
others as **not runnable here** rather than skipping them silently — a harness
that quietly drops two thirds of a corpus reports coverage it does not have.

| Kind | Decidable by | Owner (ADR-006 §10) |
| -- | -- | -- |
| `storedKey` | pure string | standard |
| `identity` | pure string | standard |
| `matching` | pure string | standard semantics |
| `hostQuery` | filesystem + repository | integration or host |
| `discovery` | repository layout | integration or host |
| `acquisition` | raw bytes | CLI producer |

## Two distinctions the corpus is careful about

**Case and NFC/NFD spellings are distinct VALID identities — not noise, not
invalid input.** `A.ts` and `a.ts` are both valid keys and are different keys;
so are the NFC and NFD spellings of `café.ts`. Both were measured as separate
tracked entries on Linux/ext4. A corpus that marked either spelling invalid, or
collapsed the pair, would encode the defect it exists to prevent — so
`check-corpus.mjs` asserts that each spelling in a distinctness pair also
appears as a valid `storedKey` case.

**A genuine U+FFFD is valid; a substituted one is not — and only one of those is
detectable from a string.** `bad�.ts` may be the real pathname, and
`validateStoredKey` accepts it. What ADR-006 §5 rejects is U+FFFD arriving as the
*result* of a failed decode, and the only test for that is whether re-encoding
reproduces the original bytes. A pure validator has no bytes. That case is
therefore an `acquisition` case, not a `storedKey` one.

## The watched-red receipt

`receipt-baseline.json` records what today's shipped matcher does when the
corpus is run through it. It is evidence of a defect, not a target.

The baseline reproduces the **cause** — `node:path.normalize` applied to a
stored key — rather than importing the consumers, which the architecture guard
forbids and which would make this evidence unrunnable outside a full
multi-repository checkout. The consumers are cited by location in
`baseline-normalize.mjs`, verified byte-identical between `integrations` and
`codex-mcp`.

Current findings, reproduced on every run:

- **5 malformed keys are silently repaired into valid-looking keys** —
  `src/../x` → `x`, `a/b/../b/c.ts` → `a/b/c.ts`, `./leading.ts` →
  `leading.ts`, `double//sep.ts` → `double/sep.ts`, `trailing/` → `trailing`.
  These are the cases that make reject-don't-resolve necessary rather than
  merely tidy: after normalization there is nothing left to report.
- **A malformed stored key matches the value it would have become.**
  `src/../a.ts` matches a query for `a.ts` — the assertion lands on a different
  file than the one it names.
- **An absolute query suffix-matches an unrelated repository.** A stored
  `src/a.ts` matches `/elsewhere/unrelated-repo/src/a.ts`. The multi-segment
  guard in the shipped code does not bound this; it only excludes single-segment
  stored keys.

`check:corpus` fails if a fresh run stops reproducing the committed receipt, and
fails if the receipt ever records zero silent repairs — either would mean the
baseline no longer reflects what ships, or that the evidence was edited to look
clean.

When Phase 4 replaces those matchers in their own repositories, this baseline
stays as the regression witness.
