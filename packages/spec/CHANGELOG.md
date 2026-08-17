# Changelog

## 0.5.0

### Minor Changes

- bd14f39: Admit raw co-change commit counts alongside the existing rate, and pin the basis
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
  const r: number = entry.rate; // was fine, now a type error
  const r =
    entry.support !== undefined // narrow first
      ? entry.support / entry.occurrences
      : entry.rate;
  ```

  The runtime shape of every existing artifact is unaffected; only the type of the
  code reading it changes. Asserted in `src/type-invariants.ts`, which `tsc`
  compiles — test files are excluded from the build, so a type claim written only
  in a test would never be checked.

  A `generated.coChange` entry now takes **exactly one of two forms**:

  | Form        | Carries                   | Status                     |
  | ----------- | ------------------------- | -------------------------- |
  | Legacy      | `rate` + `occurrences`    | Deprecated; still accepted |
  | Observation | `support` + `occurrences` | What new producers emit    |

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

  | Shape                  | Means                                          |
  | ---------------------- | ---------------------------------------------- |
  | `coChange` absent      | Not analyzed                                   |
  | `coChange: []`, no pin | Legacy / unknown — **not** evidence of zero    |
  | `coChange: []`, pinned | Analyzed at that revision; no qualifying pairs |
  | pin ≠ current revision | Stale observation                              |

  A producer emitting the observation form declares the pin whenever `coChange`
  exists, **including when empty**. Schema validation cannot enforce that case — an
  empty array carries no discriminator — so it is a producer obligation, and the
  reader-side rule above is what keeps the states distinguishable regardless.

  A _qualifying commit_ is one inside the analysis boundary the producer already
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

- 27475a2: Add the standard-owned canonical path-identity surface, per ADR-006: stored keys
  are data, not commands.

  Seven new exports, in two halves.

  **The grammar — `validateStoredKey(rawKey)`.** Decides whether one stored key is
  canonical.

  ```ts
  validateStoredKey("src/a.ts"); // { valid: true,  key: 'src/a.ts' }
  validateStoredKey("src/../a.ts"); // { valid: false, reason: 'dotdot-segment' }
  ```

  Pure, total, filesystem-free, deterministic, and applied to the original string
  **before any path library sees it**. That ordering is the defect the record was
  written about: the shipped consumers at the pinned revisions normalized first and
  validated second, so `src/../a.ts` was already `a.ts` by the time anything asked
  whether it was well-formed.

  **There is deliberately no repaired-key field.** A valid result carries the input
  unchanged; a rejection carries a reason and nothing a caller could mistake for a
  usable key. A malformed key matches nothing — including the value normalization
  would have produced. Reason precedence is fixed and documented so that two
  implementations classify the same key identically: cannot-be-a-string, then
  cannot-be-POSIX, then merely non-canonical.

  Case and Unicode form are significant. `A.ts` and `a.ts` are two keys, and so are
  the NFC and NFD spellings of `café.ts`. A genuine U+FFFD is a valid pathname
  character; telling it from a substituted one needs the original bytes and belongs
  to acquisition.

  **The document walk — `inspectStoredKeys(document)`.** Reports every malformed
  key on every ratified path-bearing surface: `generated.fileIndex` keys,
  `generated.coChange[].files`, `generated.fragility[].file`, and
  `manual.fragileFiles[].path`.

  ```ts
  if (!validate(raw)) {
    // Existing invalid-document handling.
  } else {
    for (const finding of inspectStoredKeys(raw)) {
      console.warn(`${finding.pointer}: ${finding.rawKey} — ${finding.reason}`);
    }
  }
  ```

  This is ADR-006 §9 obligation 1, _report it_. Obligation 2, _decline to match
  it_, stays with the caller, because only the caller knows what a lookup is.

  **The input is a schema-validated document, not `unknown`.** That narrowing is
  what makes an empty result mean something: `[]` says every inspected value in an
  accepted document is well-formed, and an unvalidated value is outside the
  declared input domain rather than silently "clean". `inspectStoredKeys` does not
  call `validate()` internally and is not a second document validator — folding the
  two together would destroy exactly that distinction.

  Findings are location-bearing records: one per occurrence, never deduplicated,
  never normalized, never repaired. `rawKey` is the string the producer actually
  wrote. Pointers are RFC 6901 with `~` escaped before `/`, so a pointer decodes
  back to the exact stored key. Order is traversal order and is explicitly not part
  of the contract.

  `manual.coChangePatterns` is **not** inspected. ADR-003 amendment A-005 has not
  ratified its item shape — the schema constrains items to `{"type": "object"}` and
  nothing more, while `types.ts` assumes `files: string[]`. Walking that field
  would promote an authoring-time TypeScript assumption into a normative contract
  ahead of the record that decides it. The surface is added once A-005 settles it.

  `canonicalizeHostQuery` is deliberately absent and must not be added to this
  package: it needs a filesystem and a proven repository root, and ADR-006 §10
  assigns it to integrations and hosts.

  **Nothing narrows.** `validate()`, `validateV4()` and `validateLegacy()` are
  unchanged, and `validate()` does not consult the stored-key grammar. Artifacts
  carrying malformed keys on any path-bearing surface are still accepted, because
  ADR-006 §9 requires a v0.4.x reader to report a malformed key and decline to
  match it while continuing over the well-formed remainder. A dedicated suite fails
  if a future change wires the two together — that is the intended alarm. Rejecting
  such a document is a v0.5 document-profile change and is not authorized here.
  No schema bytes changed.

  **Why `minor`.** These are additive public exports: nothing is removed, nothing
  is renamed, no accepted type or value range narrows, and no existing signature
  changes. Under `docs/versioning.md` removing a public export is breaking and
  adding one is not, so this is a minor on its own terms.

  **On the version number this produces.** A `minor` takes both packages from
  `0.4.4` to **`0.5.0`**, with `@workspacejson/rules` coming along unchanged because
  the two are a fixed release group. This changeset does not move that number on its
  own — the pending ADR-003 A-009 changeset already declares a `minor`, so `0.5.0`
  is the next release with or without this one.

  That number is the **package** version and says nothing about the document
  profile. **The document profile is unchanged: this release still reads and writes
  `generated.specVersion: "0.4"`.** Package `0.5.0` is not spec v0.5, no artifact's
  `specVersion` moves, no new profile identifier is minted, and the deferred v0.5
  profile work — narrowing validation and the hard-failure boundary — is untouched.
  The two numbers are independent by policy; see `docs/versioning.md`.

- 8e08c8c: Make the `generated.coChange[].generated` tooling-coupling flag optional in the
  observation form, and define its absence, per ADR-003 amendment A-010. This is a
  **reader widening** on a non-stable-floor path; no producer changes and no
  emission is enabled by it.

  **The flag was a required boolean with no reproducible classifier.** `support`
  and `occurrences` are observations — two producers counting the same commits get
  the same numbers. `generated` is a _classification_: answering it requires a
  judgement about what a file **is**, and this standard specifies no portable
  deterministic classifier from public repository inputs. Requiring it did not
  produce that judgement, it produced a value. The commit-graph producer, having no
  classifier, emitted a constant `false` — which on its pinned fixture asserted
  that `package-lock.json ↔ package.json` is a real source coupling that consumers
  should **not** skip.

  **Absence is a third state, and readers must not collapse it into `false`.**

  | Value   | Means                                                                     |
  | ------- | ------------------------------------------------------------------------- |
  | `true`  | Classified as tooling-coupled — skip when surfacing real source couplings |
  | `false` | Classified as **not** tooling-coupled                                     |
  | absent  | **No classification performed.** The producer asserts nothing             |

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

### Patch Changes

- d0bb585: Remove runtime dependencies that were declared but never imported.

  `@workspacejson/rules` declared `dedent`, `ignore`, `unified` and `zod` in
  `dependencies`. None of them is imported anywhere in the package. `zod` and
  `unified` appeared only as string literals in the framework-detection tables —
  the parser looks for the _word_ "zod" in a manifest, it never loads the library.

  Because these were `dependencies` rather than `devDependencies`, every consumer
  installed all four to run code that does not exist. Removing them changes no
  behavior: the full suite passes unchanged.

  `@workspacejson/spec` drops the unused `json-schema-to-typescript`
  devDependency along with `scripts/generate-types.js`, which read the schema file
  and discarded it. `src/types.ts` is hand-written and committed; nothing was ever
  generated. The build script is now `tsc`.

  A new `unused-dependency` guard in `scripts/check-architecture.mjs` fails the
  build if a declared runtime dependency is never imported, so this cannot
  silently return.

- 7739260: Reconcile the schema `$id` host to the bare canonical domain, per ADR-005.

  The schema's `$id` was `https://www.workspacejson.dev/schema/v1.json` while every
  package manifest and documentation reference uses `https://workspacejson.dev`
  without the `www.` prefix. Both hosts serve the schema, so nothing was broken,
  but the two strings disagreed — and `versioning.md` instructs consumers to
  hash-check the materialized schema, which means the `$id` string is part of the
  contract surface.

  The `$id` is now `https://workspacejson.dev/schema/v1.json`, matching the bare
  canonical domain. The filename `v1.json` is unchanged. The `www.` host continues
  to serve the schema; the change is about which string is canonical, not which
  URL works.

  This change is folded into the same release as the ADR-004 root `version`
  widening so consumers experience one schema-byte transition covering both
  changes, rather than two consecutive pin invalidations.

  ADR-005 also settles two questions that were open alongside the host, so that
  this is the only identity change: the file is **not** renamed — `v1.json` stays,
  and the `v1` remains a legacy naming artifact rather than a version claim — and
  no sibling schema document will be introduced, with future profiles continuing to
  ride the `generated.specVersion` enum. Neither decision changes any bytes now;
  recording them is what keeps a later rename from costing a second pin.

- 05ea429: Widen the validator to accept an optional root `version`, per ADR-004.

  `generated.specVersion` has always been the profile declaration, but at least one
  external reader gates on a **root** `version` key instead. No producer has ever
  emitted it, so that gate has never executed.

  The root object is `additionalProperties: false`, which means repairing the
  mismatch is not the additive change it appears to be: adding a root key is
  additive to the schema as a document and breaking for every already-deployed
  validator. Acceptance therefore has to ship before emission, and this release is
  the acceptance half.

  `validate()` and `validateV4()` now accept an optional root `version` of `"0.3"`
  or `"0.4"`. When present it must equal `generated.specVersion` — a document whose
  two declarations disagree is invalid, not resolved by precedence. No new profile
  name is introduced and `generated.specVersion` is unchanged: still required,
  still primary, still emitted. A reader that ignores the root key sees no
  difference.

  `validateLegacy()` is corrected as a consequence. It previously identified the
  pre-v0.3 shape as "has a root `version` string and fails `validate()`", which
  stops being sufficient once v0.3/v0.4 documents may carry that key: a disagreeing
  document would have been reported as legacy v0.1/v0.2 rather than rejected. It
  now keys on the absence of `generated.specVersion`, so a disagreement is rejected
  by both functions.

  **This release does not emit the field.** No producer writes a root `version`,
  and ADR-004 §8 requires evidence that known validate-before-read consumers accept
  it before any producer begins. Widening what a reader accepts is deliberately not
  permission to start writing.

- 8e5bf70: Correct the published package metadata to name this repository, and record the
  README and changelog corrections that ship inside the tarball.

  Both manifests still described the packages as they were published from the
  frozen historical workspace. None of it was reachable: `repository.url` and
  `bugs.url` pointed at a repository that no longer exists under that name, so
  every "open an issue" and "view source" link on both npm pages led nowhere.

  `repository` now names this repository and carries a `directory` pointer, so npm
  resolves each package to its own subtree rather than the monorepo root. `bugs`
  follows it. `homepage` is the bare canonical host on both packages, per ADR-005 —
  `@workspacejson/rules` additionally pointed at a `/audit/` subpath that predates
  the neutral naming and no longer describes what the package is.

  `author` reads `workspacejson contributors` on both, matching the org that now
  holds them.

  Two keywords were removed. `agents-audit` named the historical package rather
  than these; `aaif` implied a standards-body status this project does not hold.

  `@workspacejson/rules` has a new `description`. The old one described a narrower
  package — AGENTS.md hygiene auditing — than the one that actually ships, which
  carries the parser, repository scanner, validator and rule engine.

  **Why a metadata-only change gets a changeset at all.** `README.md` and
  `CHANGELOG.md` are both listed in `files`, so they are published bytes, not
  repository furniture. Both package READMEs claimed to be published from the
  historical workspace and loaded their brand assets from a frozen repository;
  both changelogs recorded 0.4.4 as unreleased while the registry had already
  served it. Those corrections reached consumers with no release note explaining
  why the page changed. The manifest fields above are in the same position: they
  are part of the published artifact even though no runtime behavior moves.

  Nothing in either package's runtime, types, schema or exports changes. `patch`
  is correct on its own terms; the fixed group is taking a `minor` this release
  for reasons recorded in the accompanying changesets, and this rides along.

## [0.4.4] - 2026-07-23

### Fixed

- Reconciled the strict packaged-schema validator with the `coChange.files` and
  `fileIndex` key-format contract fixes that had diverged across earlier release
  branches.
- Documented `generated.fileIndex` keys as repository-root-relative POSIX paths.
- Typed and documented `generated.coChange[].files` as an unordered two-file set,
  rather than a positional tuple.
- Corrected the exported runtime `version` to match the package manifest.

### Compatibility note

- `npx @workspacejson/spec validate <file>` resolves because npm selects this
  package's sole `workspacejson-spec` bin. This release deliberately does not
  reserve the generic `spec` bin alias. If a second bin is added in the future,
  re-evaluate that npm single-bin fallback dependency as part of that change.

## [0.4.3] - 2026-07-17

### Patch Changes

- Fix the `agents-audit` CLI entry-point guard so it fires when invoked through npm's `.bin` symlink (`npx agents-audit`, `npm exec agents-audit`). The guard previously compared `resolve(process.argv[1])` against the resolved module URL, which never matched through a symlink — every subcommand (`generate`, `scan`) silently no-op'd and exited 0 instead of running. It now compares real paths via `realpathSync`.

  Also hardens `scripts/verify-package-tarball.mjs` for `agents-audit`: after packing and installing the tarball fresh, it now runs `npx agents-audit generate` and asserts `.agents/workspace.json` actually exists and parses, rather than trusting a clean exit code.

## [0.4.2] - 2026-07-16

### Added

- `workspacejson-spec validate <file>`, exposed through `npx @workspacejson/spec`.

### Changed

- `validate()` now enforces the packaged JSON Schema; schema-invalid documents now return `false`.
- `validateV4()` follows the schema's optional v0.4 `coChange` and `fragility` fields.
- Packaged schema annotations use the current Buildomator implementation name.
- Package tarball verification now requires the runtime schema and concrete fixed-group
  dependency versions before publish.

## [0.4.1] - 2026-06-02

### Changed

- Canonical file renamed from `agents.workspace.json` to `workspace.json`, stored at
  `.agents/workspace.json`. The previous name was redundant once the directory provided
  the namespace context. Generators should write to `.agents/workspace.json`; the legacy
  path `.agents/agents.workspace.json` remains a valid read fallback.
- Schema `title` updated from `"agents.workspace.json"` to `"workspace.json"`.

### Fixed

- `coChange` entries now always include `occurrences`. The reference emitter
  (Vreko daemon v3) was stripping this field in the initial v0.4.0 cut.
- `fragility` entries now always include `changeCount` and `revertCount`. Same
  emitter gap — both fields are defined by the spec and present in the underlying
  git scan data but were dropped before serialization.

## [0.4.0] - 2026-06-01

### Added

- `generated.coChange` — machine-derived co-change pairs array. Each entry carries
  `files: [string, string]`, `rate: number`, `occurrences: number`, and
  `generated: boolean`. The `generated` flag distinguishes tooling-coupled pairs
  (e.g. lockfile + package.json) from real source couplings; consumers should filter
  on this flag rather than applying path heuristics at read time.
- `generated.fragility` — per-file fragility array derived from git history. Each entry
  carries `file`, `changeCount`, `revertCount`, `revertRate`, `fragilityScore` (0-1),
  and `excluded`. Entries with `excluded: true` are generated/lock files skipped in
  analysis.
- `health.workflowFragility`, `health.codebaseHealth`, `health.changeVolatility` — three
  aggregate health scores (0-1) formally typed in v0.4. These have been emitted by
  the Vreko daemon since the v0.3 bootstrap path; v0.4 promotes them from the
  `additionalProperties: true` escape hatch to first-class typed fields.
- `validateV4()` export — type guard for v0.4 documents (requires `specVersion === "0.4"`,
  `coChange` array, `fragility` array).
- `examples/populated-v0.4.json` — complete example showing all new v0.4 fields.

### Changed

- `specVersion` JSON Schema constraint widened from `{ const: "0.3" }` to
  `{ enum: ["0.3", "0.4"] }` — v0.3 documents remain valid.
- `validate()` now accepts both `"0.3"` and `"0.4"` documents (additive, not breaking).
- Package version bumped to `0.4.0`.

### Compatibility

v0.3 consumers are unaffected. The new fields fall outside the v0.3 required set and
`generated.additionalProperties: true` was already present. Upgrade path:
check `generated.specVersion === "0.4"` or use `validateV4()` before accessing
`coChange`, `fragility`, or the new health fields.

## Unreleased

## [0.3.0] - 2026-05-12

### Breaking changes

- Schema shape changed to four-property structure: `manual`, `generated`, `agents`, `health`.
- Canonical write path corrected to `.agents/agents.workspace.json` (v0.2.0 incorrectly stated repo root).
- Top-level `version` field removed; schema version now lives at `generated.specVersion = "0.3"`.
- Per-file fragility data lives at `generated.fileIndex.{path}` (not `files.{path}`).
- Framework detection lives at `generated.frameworkManifest`.

### Ecosystem alignment

- Field names match `jnuyens/gsd-plugin v2.42.3` SessionStart read paths (first shipped consumer of `.agents/agents.workspace.json`).

### Added

- `examples/` directory with minimal, populated, and with-manual-block example files.
- `validate()` and `validateLegacy()` exports in `src/index.ts`.

### Migration

Check `generated.specVersion === "0.3"` to detect v0.3 documents. Fall back to v0.1 shape if `specVersion` is absent.

## 0.2.0 - 2026-05-08

### Added

- `generate` subcommand support: the spec now describes the `agents.workspace.json` file
  written by `agents-audit generate`, including the `generatedAt` timestamp field.
- `agentFiles.workspaceJson` field documents the canonical workspace file path as reported
  in the generated snapshot.

### Changed

- Canonical workspace file location is now the repository root (`agents.workspace.json`).
  The legacy path (`.agents/agents.workspace.json`) remains a valid read fallback but
  `generate` no longer creates `.agents/`.
- `version` field accepts any string value; the reference implementation writes `"1"`.

## 0.1.1 - 2026-05-06

### Changed

- Added npm discoverability keywords.

## 0.1.0 - 2026-05-06

### Added

- Initial release: JSON Schema (`schema/v1.json`) and TypeScript types for `agents.workspace.json`.
- Validates `version`, `generatedAt`, `repository`, `topology`, `ciProvider`, `agentFiles`,
  `frameworks`, `conventions`, `packages`, `gitSummary`, and `hygiene` fields.
