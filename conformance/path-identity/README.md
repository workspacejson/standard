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
| `baseline-normalize.mjs` | A **frozen historical specimen**: the matcher as it existed at two pinned revisions. Not a reference implementation. |
| `run-baseline.mjs` | Runs the corpus against that specimen and writes the receipt. |
| `receipt-baseline.json` | **Watched-red evidence.** What that behavior did to the corpus, with structured provenance. |

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

Three kinds are decidable as pure string operations and are **executed here**.
Three are **delegated** to their ADR-006 §10 owners. Of 59 cases, 45 are
executed by this harness and 14 are delegated — 3 of the 6 kinds.

| Kind | Cases | Decidable by | Executed here? | Owner (ADR-006 §10) |
| -- | --: | -- | -- | -- |
| `storedKey` | 33 | pure string | yes | standard |
| `matching` | 8 | pure string | yes | standard semantics |
| `identity` | 4 | pure string | yes | standard |
| `hostQuery` | 8 | filesystem + repository | delegated | integration or host |
| `discovery` | 3 | repository layout | delegated | integration or host |
| `acquisition` | 3 | raw bytes | delegated | CLI producer |

**Delegated does not mean unrunnable.** Every delegated case carries a complete
machine-readable `fixture` — repository root, tracked entries, filesystem
entries and symlinks and an input path for `hostQuery`; repository boundaries,
artifact locations and a query origin for `discovery`; raw pathname or Git-output
bytes as hex and an acquisition mode for `acquisition` — plus an expected result
in the same machine-readable terms, drawn from a declared table of failure
classifications. An owning harness constructs the case from the corpus without
inventing semantics, which is what makes "one normative corpus" true rather than
aspirational. `check-corpus.mjs` fails if any of that is missing.

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

`receipt-baseline.json` records the behavior **observed at the pinned
revisions** when the corpus is run through the frozen specimen. It is evidence of
a defect, not a target.

**What it is pinned to**, carried as structured provenance in the receipt itself:

| Repository | Revision | Source paths reproduced |
| -- | -- | -- |
| `workspacejson/integrations` | `219d3322f4fe39d21ae8a8b15b5634764b90df2c` | `src/path-match.ts`, `extension/src/pathMatch.ts` |
| `workspace-json/codex-mcp` | `ddcd7b70ac231b1d8ec559bf69eea90ad8dd615d` | `src/path-match.ts`, `extension/src/pathMatch.ts` |

Byte-identity between the two was verified with `diff -q` on 2026-08-09. The
ordering defect — validation running *after* normalization — was observed at
`extension/src/parseSnapshot.ts:66,88,147` in both.

**What this evidence cannot do.** The specimen is a frozen copy and never
executes either consumer, so it **cannot detect a future regression** in
`integrations` or `codex-mcp`. It supports a claim about the pinned revisions and
nothing later. Those repositories detect their own regressions by running this
normative corpus against their actual implementations.

The baseline reproduces the **cause** — `node:path.normalize` applied to a
stored key — rather than importing the consumers, which the architecture guard
forbids and which would make this evidence unrunnable outside a full
multi-repository checkout. The consumers are cited by location in
`baseline-normalize.mjs`, verified byte-identical between `integrations` and
`codex-mcp`.

Findings at those revisions, reproduced on every run:

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

`check:corpus` fails if a fresh run stops reproducing the committed receipt,
fails if the provenance pins are missing or abbreviated, and fails if the receipt
ever records zero silent repairs. The specimen is *intentionally* defective and
must stay that way: a clean reading means the frozen copy drifted from the pinned
revisions or the evidence was edited, not that anything downstream was fixed.

When those matchers are replaced in their own repositories, this specimen stays
as the historical record of what was there before.
