# Evidence receipt — canonical co-change artifacts for three external repositories

This records how the three artifacts in this directory were produced, what may
be concluded from them, and what may not.

They are **third-party evidence**: none of these repositories is ours, none was
modified, and nothing here was contributed upstream. Each artifact is the output
of running the neutral producer over a public commit graph at a pinned revision.

Tracker: META-310 (internal). Producer work: META-297 (internal).

## What this is NOT

**This is candidate interoperability, not published-package interoperability.**

The producer and the schema these artifacts were validated against are candidate
builds from pinned source revisions, not registry releases. Published
`@workspacejson/spec@0.4.4` and `@workspacejson/rules@0.4.4` **reject** these
artifacts: their schema predates ADR-003 amendment A-009 and still requires
`rate` while forbidding `support`. Publication remains frozen. Nobody can
reproduce this from the registry today; they can reproduce it from the source
revisions named below.

**No maintainer has been contacted, and no maintainer has agreed to anything.**
These are observations of public history, not endorsements, adoption, or
collaboration.

## Producer and basis

| | |
| -- | -- |
| Producer | `workspacejson/cli` @ `031c3504a0977b8d90ac518c82a39a2f4ec741a9` (PR #20) |
| Standard source | `workspacejson/standard` @ `f95c42f89c8fe39995c10918bea880729cf17bbd` (PR #29) |

Both packed from **clean detached worktrees at those revisions**, `git status
--porcelain` verified empty, not from working trees.

| Tarball | `sha256` |
| -- | -- |
| `workspacejson-spec-0.4.4.tgz` | `2e0c326e7d8b50d3e3fa801944659803cd95d13dc253e65e1ace8dfccf949111` |
| `workspacejson-rules-0.4.4.tgz` | `548dd788725899ccaded6568121a271eeb593f143c581ec7e4714b50d9e5dbb7` |
| `workspacejson-cli-0.5.2.tgz` | `aa0ab7526a8f8fc6316f8b809d2ee5cdd04c80c5483a29d39e8dfbcc2e15ad18` |
| `workspacejson-mining-core-0.0.0.tgz` | `4f2a632d874dc862fc6425c81324378598c6183215aa80fe88465c3e0847577e` |

The first three reproduce, bit for bit, the digests recorded in
`.agents/RECEIPT.md` for the first commit-history artifact. That receipt expected
them not to (mtime in the gzip stream), so the match is stronger evidence than
planned: this is the same environment, not merely a same-version rebuild.

**Cache defense.** The runner directory was removed and rebuilt from scratch — no
reused `node_modules`, no carried-over lockfile, nothing through which stale
same-version tarball contents could survive. `@workspacejson/cli` declares `spec`
and `rules` by **version**, and candidate and published packages carry identical
version numbers, so version strings cannot distinguish them. `overrides` forced
`file:` resolution; the install was audited and showed **0** registry URLs for
`@workspacejson/*`, all four resolving `file:`, and exactly **1** copy of
`@workspacejson/spec` in the tree.

## Frozen analysis contract

Every value is the pinned source default. `meta310-mine.mjs` passes **no options**
to `mine`/`score`/`select`: the contract is what the pinned revision froze, not
what the driver adds. The same contract was applied to all three repositories
with no per-repository tuning.

```text
weighting version:   META-289 v2.2.1
                       size weight numerator     10
                       position decay half-life  250

history traversal:   git rev-list --first-parent --reverse <basisRevision>
                     git -c diff.renamelimit=5000 diff-tree -r --name-status -z \
                         --no-commit-id -M50% <parent> <commit>
rename handling:     -M50% similarity, renamelimit 5000
analysis window:     500 first-parent transitions
basis:               HEAD at the pinned revision

bulk exclusion:      fileCount > 50, applied to whole EVENTS not to paths;
                     excluded commits named, not merely counted
path/file-role
  exclusions:        EMPTY SET   <-- see "The empty exclusion set" below

completeness
  boundary:          qualifyingMinCooccurrence = 1  (state 2/3, pre-scoring)
threshold:           support >= 3
ranking:             support DESC, occurrences ASC,
                     files[0] ASC by UTF-8 bytes, files[1] ASC by UTF-8 bytes
cap:                 50
shallow history:     invalid / NOT_MINED — refusal returns absence, never an
                     empty array
stored values:       no rate, no derived probability/lift/confidence;
                     no tooling-coupling flag (A-010: absence = unclassified)
```

### The empty exclusion set

META-289 §1.5 was to record the operative file-role exclusion policy. It has not
landed. The implemented exclusion set is therefore **empty** — no path is
excluded for being documentation, a lockfile or generated output — and the
event-size rule is the only exclusion applied.

This is recorded as empty rather than as "a recorded set" because the difference
is load-bearing: **lockfiles, generated files, changelogs and documentation are
all in play**, and on JavaScript repositories they dominate the ranking. Such
pairs are valid observations with low outreach novelty. That is a ranking
consideration, not grounds to erase evidence, and it is stated here in advance so
it cannot later be presented as a discovery.

## Harness calibration against a known answer

Before any target repository was mined, the driver was run against
`workspacejson/standard` @ `8e08c8c` — the evidence basis of the first
commit-history artifact, whose result is already recorded in `.agents/RECEIPT.md`.

| | Recorded in `.agents/RECEIPT.md` | This harness |
| -- | -- | -- |
| History-block `sha256` | `7012352617df37f442a627b8dfc334ed17d63dd2a69bb2d875f759bfddcc7b4f` | **exact match** |
| `coChange` entries | 50 | 50 |
| Artifact bytes | 20,417 | 20,417 |
| `availableTransitions` | 90 | 90 |
| `windowTruncated` | no | no |
| Validation | valid, 0 errors | valid, 0 errors |

`calibration.receipt.json` holds the full run. Newly recorded here and absent
from the original receipt: `pairsBeforeCap` **128**, `capBound` **true** — the
committed artifact of 50 is the top of 128.

The history-block digest definition was **recovered and verified**, not invented:
`sha256(stableStringify({basisRevision, coChange}))`, object keys sorted by UTF-16
code unit, no trailing newline. Four plausible alternatives were tried and
rejected because they did not reproduce the recorded value.

## Cross-check in every run

The producer path uses the copy of `mining-core` **bundled** into the cli
tarball. The receipt path uses the **separately installed** `mining-core`
tarball, which exposes `basisWindow`, `exclusions` and the selection receipt that
the artifact itself does not carry. Both are built from the same pinned revision
and are compared pair for pair on every run.

A disagreement aborts the run rather than being reconciled — reconciling it would
conceal exactly the defect the cross-check exists to catch. All three runs, and
the calibration: **identical**.

## Results

| | FormatJS | syncpack | Polylith |
| -- | -- | -- | -- |
| Repository | `formatjs/formatjs` | `JamieMason/syncpack` | `polyfy/polylith` |
| Pinned revision | `27c29bf9a40a50dac232a159b8790dbd14732c57` | `958d30689ac24b60623258630242330bd6d0264b` | `68dab9868274c8044817983c2424fbdbd616a456` |
| Shallow | no | no | no |
| `availableTransitions` | 6,545 | 919 | 394 |
| `extractedTransitions` | 500 | 500 | 394 |
| `windowTruncated` | **yes** | **yes** | no |
| Events excluded (`fileCount > 50`) | 17 | 16 | 37 |
| `pairsBeforeCap` | 713 | 729 | 1,658 |
| `pairsEmitted` | 50 | 50 | 50 |
| `capBound` | **yes** | **yes** | **yes** |
| Min / max support emitted | 8 / 87 | 8 / 99 | 13 / 95 |
| Artifact bytes | 117,140 | 53,861 | 102,632 |
| Artifact `sha256` | `3ed91cffb26498e4cf930e8388e8e25da369ba5e623718f68d709309f6d6643a` | `3d3d435ad0e3e00eff7abdb2f90fa4ed88d764e7cd38930fc966104a7e911222` | `848540525a7b20842105eea5b62024604580fb63ad615b5d962c49d6e5e82c8a` |
| **History-block `sha256`** | `cc4b87e4d63f964f213ef6e5889d0a5944aaa9dc2bbf865d6cda8a5d1ccad4ff` | `ce5ecabea30e44578d24cd85038a92a3ed3ec8c5af773a514d80d3fee008de5a` | `a77451d9727da87d4312fdd6da7a2a59ea5f402b7b08e04ee0d4fe7b66fc15d0` |
| Validation | valid, 0 errors | valid, 0 errors | valid, 0 errors |
| Determinism (2nd run) | history block stable, whole file identical | stable, identical | stable, identical |
| Cross-check | 50 vs 50, identical | 50 vs 50, identical | 50 vs 50, identical |
| Wall clock | 44.9 s | 54.4 s | 34.0 s |

**All three are cap-bound.** Each artifact is the top 50 of a larger qualifying
population — 713, 729 and 1,658. None is "all qualifying pairs". No sparse,
empty or refused result occurred; that is what happened, not what was sought.

Shape audit across all 150 emitted entries: keys are exactly `files`,
`occurrences`, `support`; **no stored `rate`**; **no tooling-coupling flag**;
every pair ordered by ascending UTF-8 bytes; `support <= occurrences` throughout.

**Runtime**, which META-297 left open as unmeasured: 34–54 s for a 500-transition
window including the working-tree scan.

## What the artifacts show

Classifying all 150 emitted pairs by whether **both** endpoints are source files:

| | source ↔ source | mixed | tooling ↔ tooling |
| -- | -- | -- | -- |
| FormatJS | **0** | 0 | **50** |
| syncpack | **32** | 0 | 18 |
| Polylith | 5 | 20 | 25 |

### FormatJS — no source-coupling evidence

All 50 emitted pairs are release and dependency plumbing: `package.json` ↔
`pnpm-lock.yaml` (support 87), `MODULE.bazel.lock` ↔ `package.json`, `Cargo.lock`
↔ `crates/formatjs_cli/Cargo.toml`, `.release-please-manifest.json`,
`.github/workflows/release.yml`, and `examples/*/package.json` churn.

These remain valid observations — lockfile-to-manifest coupling is real coupling
— but none of the 50 has a source file at either endpoint, so this artifact
carries no evidence that a commit graph reveals structure an import graph cannot.
FormatJS was **demoted on this output**, not on taste.

### syncpack — the no-import-edge case

32 of 50 pairs are source-to-source Rust modules. Within them, the six sibling
command modules `src/commands/{fix,format,json,lint,list,update}.rs` contribute
**11 emitted pairs**. Verified directly: **none of the six references any other**.
Each is registered independently via `mod commands;` from `main.rs`. An
import-graph or AST analyzer relates none of these files to one another.

| Pair | support | occurrences |
| -- | -- | -- |
| `src/commands/lint.rs` ↔ `src/commands/list.rs` | **10** | **10** |

Of the 10 qualifying commits in the window that touched *either* file, all 10
touched both. That is the measurement; nothing further is claimed.

Recorded so the cluster is not overclaimed: `src/instance.rs` ↔
`src/version_group.rs` (support 17) **fails** the no-import-edge test —
`version_group.rs` imports `instance`. It is import-visible and is not thesis
evidence. `src/rcfile.rs` ↔ `src/rcfile_test.rs` (support 11) is a test-to-source
pair, preserved as a valid observation; whether it predicts regressions or only
update burden is META-289's open question and is not answered here.

### Polylith — real but thinner and partly hub-driven

5 source-to-source pairs, of which 3 involve
`components/version/src/polylith/clj/core/version/interface.clj` — a version
constant touched on every release, which couples to nearly everything (it is an
endpoint of the top-ranked pair, support 95, against `readme.adoc`). High
support, low information: a release hub rather than a design coupling.

Two genuine cross-component pairs, both verified to have **no `:require` edge** in
either direction:

| Pair | support | occurrences |
| -- | -- | -- |
| `command/core.clj` ↔ `user_input/core.clj` | 14 | 35 |
| `help/summary.clj` ↔ `user_input/core.clj` | 13 | 35 |

Sound as measurements. Discounted as a *demonstration* only because Polylith
deliberately decouples components behind interfaces, so cross-component
co-change without an import edge is closer to expected than surprising.

## Reproduction

```text
driver:      workspacejson/cli @ evidence/meta-310/meta310-mine.mjs
               sha256 5be5c814caed895b30a26d6fee697e1b65bc01c95789235dc49ad2a3f805e83c
runner env:  workspacejson/cli @ evidence/meta-310/runner-package.json
               sha256 fed868de3cce3c5e75010fa7062221fb53f155a20ca90c850c5ed47be5a59795
call:        generateWorkspaceJson(repoRoot, {}, { mineHistory: true })
command:     node meta310-mine.mjs <label> <repoRoot> <outDir>
environment: Node v22.19.0, pnpm 9.0.0, darwin
```

`mineHistory` is a programmatic option with no CLI flag. A public mining flag is
a later increment and did not block this run.

### Where the driver lives, and why it is not in this directory

`meta310-mine.mjs` is committed to **`workspacejson/cli` at `evidence/meta-310/`**,
not here, as the exact bytes that produced these results — which is what makes
the digest above a reproduction claim rather than a decoration.

It is not in this repository because it imports `@workspacejson/cli`, and
`standard` sits at the top of the dependency graph. `scripts/check-architecture.mjs`
refused the file on exactly that rule:

```text
[dependency-direction] docs/evidence/meta-310/meta310-mine.mjs
    imports from workspacejson/cli; standard must depend on none of the
    other three repositories
```

The gate was right and was not weakened to accommodate a convenience. Nothing is
lost: reproduction already requires both repositories pinned, so a driver living
beside the producer it drives costs a reader nothing.

Two properties of the file worth knowing before opening it:

- it contains three **NUL bytes**, used as field separators in the cross-check
  comparison key. That is sound — a NUL cannot occur in a path, so the key is
  unambiguous where a space-joined key would not be — and both sides of every
  comparison used the same function, so the reported `identical: true` results
  are unaffected;
- Git therefore infers "binary" for it, and it was **not** edited after the run.
  Correcting the separator cosmetically would have changed the digest and made
  the committed driver something other than the one that produced these
  artifacts.

To reproduce: clone each repository **full, not shallow**, check out the pinned
revision above, install the candidate packages from the two source revisions
under the cache defense described here, and run the driver. The history-block
digests are the comparison surface; whole-file digests include `generatedAt`,
which records the generation run rather than the evidence.

## Standing limits

- Relationships are stated **descriptively**: counts of qualifying commits within
  a 500-transition window. No usefulness, adoption, quality or predictive claim
  is inferred, and none may be added downstream.
- syncpack and FormatJS windows are **truncated**; those observations cover
  recent history, not all history.
- No package publication is authorized by these artifacts.
- No outreach is authorized by these artifacts.
- No screening-derived number appears anywhere in this receipt. Every figure
  comes from the three runs recorded here.
