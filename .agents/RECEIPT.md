# Artifact receipt — first commit-history evidence

This records how `.agents/workspace.json` in this repository was produced, and
what may and may not be concluded from it.

## What this is

The first `workspace.json` artifact anywhere carrying **commit-history
co-change evidence** from the neutral producer. Every prior artifact in this
lineage was a working-tree scan; `generated.coChange` was specified and emitted
by nothing.

## What this is NOT

**This is candidate interoperability, not published-package interoperability.**

The producer and the schema it was validated against are both *candidate builds
from pinned source revisions*, not registry releases. The published
`@workspacejson/spec@0.4.4` and `@workspacejson/rules@0.4.4` **reject** this
artifact: their schema predates ADR-003 amendment A-009 and still requires
`rate` while forbidding `support`. Publication remains frozen, so nobody can
reproduce this from the registry today. They can reproduce it from the source
revisions named below.

## Producer

| | |
| -- | -- |
| Producer | `workspacejson/cli` @ `031c3504a0977b8d90ac518c82a39a2f4ec741a9` — **merged to `main`** (PR #20) |
| Evidence basis | `workspacejson/standard` @ `8e08c8c5cd110e7f95bbd52246ea295c22b072e3` |

Both were packed from **clean detached worktrees at those revisions**, not from
working trees, so the build inputs are exactly the committed source.

**The producer identity was refreshed; the evidence basis was not.** An earlier
build of this artifact used producer `44d374b`, which carried a known defect: an
explicitly requested history refresh that could not complete fell back to the
previously recorded block *silently*, so a caller could not tell a refused
refresh from a completed one. That is fixed in `031c350`, and the artifact was
regenerated with the corrected producer **against the same `8e08c8c` evidence
basis**.

Refreshing the evidence to a newer `standard` revision was deliberately NOT
done. `basisRevision` means "these observations were computed from this
revision"; advancing it because `main` moved would claim a measurement that was
never taken. A pin that lags `main` reads as *stale*, which is accurate and is
the pin doing its job.

This doubles as a perturbation test, and it is recorded because a negative
result would have been a finding. The fix changes only refusal *signalling* on
the unsuccessful mining path, so the successful path must produce identical
output. It does:

| | Before (`44d374b`) | After (`031c350`) |
| -- | -- | -- |
| `basisRevision` | `8e08c8c…` | **unchanged** |
| History-block `sha256` | `7012352617df…` | **unchanged** |
| `coChange` entries | 50 | 50, **byte-identical** |
| Fields that moved | — | `generatedAt` and `hygiene.scannedAt` only, both wall-clock |

Had the history block moved, that would have meant the refusal fix altered the
successful mining path, and this receipt would not have been written.

## Packed candidate identities

| Package | `sha256` of tarball |
| -- | -- |
| `workspacejson-spec-0.4.4.tgz` | `2e0c326e7d8b50d3e3fa801944659803cd95d13dc253e65e1ace8dfccf949111` |
| `workspacejson-rules-0.4.4.tgz` | `548dd788725899ccaded6568121a271eeb593f143c581ec7e4714b50d9e5dbb7` |
| `workspacejson-cli-0.5.2.tgz` | `aa0ab7526a8f8fc6316f8b809d2ee5cdd04c80c5483a29d39e8dfbcc2e15ad18` |

**These digests are pack-specific, not content identities.** `npm pack` produces
a gzip stream carrying file mtimes, so repacking the same source yields a
different digest. They pin *these* artifacts; the durable identity is the pair
of source revisions above. Recorded this way rather than presented as a
reproducible hash, because a digest that silently changes on every pack would be
a false anchor.

The install graph was verified to contain **no registry substitution**: every
`@workspacejson/*` entry in the lockfile resolves `file:`, there are zero
registry URLs for them, and exactly one `@workspacejson/spec` copy exists in the
tree. Version strings could not have distinguished candidate from registry —
all three carry the same numbers as the published packages — so the candidate
suite additionally asserts the *shape* of the installed schema, including that
the validator the producer actually calls accepts the observation form.

## History completeness

| | |
| -- | -- |
| Repository | `workspacejson/standard` |
| Shallow | **no** (`git rev-parse --is-shallow-repository` = `false`) |
| First-parent transitions available | 90 |
| Analysis window | 500 transitions |
| Window bound the result | **no** — 90 < 500, so the full first-parent history was analyzed |

This is complete history, not a truncated view. No artifact produced from a
shallow clone or otherwise incomplete history may be used as evidence.

## The artifact

| | |
| -- | -- |
| Path | `.agents/workspace.json` |
| Bytes | 20,417 |
| `sha256` | `9fff32e0c015a7ffc3411342afa4374e5fc63db3cd1c53c8618233b8cf92c81b` |
| `generated.specVersion` | `0.4` |
| `generated.basisRevision` | `8e08c8c5cd110e7f95bbd52246ea295c22b072e3` |
| `coChange` entries | 50 |
| Selection | threshold `support >= 3`, ranked, capped at 50; minimum emitted support 4 |
| Validation | **valid, 0 errors**, through `WorkspaceJsonValidator` from the candidate `rules` build |

**History-block `sha256`: `7012352617df37f442a627b8dfc334ed17d63dd2a69bb2d875f759bfddcc7b4f`**

That digest covers `basisRevision` + `coChange` under canonical key ordering, and
it is the receipt that actually matters. The whole-file digest includes
`generatedAt`, which records the generation run rather than the evidence.
**`basisRevision` is the authoritative freshness and provenance pin for the
co-change observations** — comparing `generatedAt` to the repository's current
revision says nothing about whether this block is stale.

Two consecutive runs produced byte-identical output, including `generatedAt`,
because the producer detected no material change and did not rewrite the file.

## Shape audit — all 50 entries

- keys are exactly `files`, `occurrences`, `support`;
- **no `rate`** — no derived probability, lift, confidence or ranking is stored;
- **no `generated` flag** — this producer implements no deterministic
  tooling-coupling classifier, and under A-010 absence means *unclassified*
  rather than `false`;
- every pair ordered by ascending UTF-8 bytes;
- `support <= occurrences` throughout.

## Highest-ranked observations

| Pair | support | occurrences |
| -- | -- | -- |
| `packages/rules/package.json` ↔ `packages/spec/package.json` | 12 | 24 |
| `packages/spec/schema/v1.json` ↔ `packages/spec/src/schema.ts` | 10 | 11 |
| `packages/spec/src/index.test.ts` ↔ `packages/spec/src/schema.ts` | 10 | 15 |

The second pair is the two schema mirrors. **There is no import edge between
them** — neither file imports the other, and no static analysis of this
repository relates them. The measured claim is what the counts say: of the 11
qualifying commits that touched either file, 10 touched both. Whether that
generalises beyond this repository is not established here.

## Verification at these revisions

| Suite | Result |
| -- | -- |
| Candidate-contract suite, packed environment | **22/22** |
| Producer repo-native (`mining-core` / `cli` / `agents-audit-compat`) | 97 / 72 / 44 = **213/213** |
| Standard (`spec` / `rules`) | 264 / 173 |
| Standard examples | 11/11 positive, 12/12 negative |
| Producer conformance | 28 passed, 0 failed, **1 not measured** |
| Candidate-contract suite, rerun from the merged producer `031c350` | **22/22** |

**Watched-red** — each stated guarantee was deliberately broken in the producer
source to confirm the suite detects it, then restored. A test that passes is
weak evidence; a test that fails when the behaviour it names is removed is
strong evidence. Each mutation below was rebuilt, repacked and clean-installed
before measurement:

| Mutation | Result |
| -- | -- |
| Remove carry-forward — destroys existing evidence | 7 failed / 12 passed |
| Advance `basisRevision` without recomputing | 6 failed / 13 passed |
| Recompute history during ordinary generation | 1 failed / 18 passed |
| Drop the refresh-outcome field (silent fallback) | 2 failed / 20 passed |
| Report `mined: true` unconditionally | 1 failed / 21 passed |
| Restored | **22/22** |

The conformance suite reports **1 not measured**: canonical pair ordering was
not exercised, because its fixture carries no git history and `generate` does
not mine by default. That is recorded as absence rather than counted as a pass.

## Standing limits

- No package publication is authorized by this artifact.
- No outreach or external target ranking may cite it beyond what is measured
  here.
- Regenerating it requires the two source revisions above; the registry cannot
  reproduce it while the freeze holds.
