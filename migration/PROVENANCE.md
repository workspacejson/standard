# Migration provenance — `workspacejson/standard`

Executed under **META-239**, child of program **META-237**, against the frozen
source manifest in **META-238**.

## Source

| Field | Value |
| -- | -- |
| Source repository | `workspace-json/agents-audit` (public) |
| Frozen source SHA | `e47eb1b8556c4f361db9a78190a2f36b400756e8` |
| Source branch | `main` |
| Commits on source `main` | 124 |
| Migration date | 2026-07-26 |
| Target repository | `workspacejson/standard` |
| Target branch | `migration/meta-239-standard-extraction` |
| **Rollback ref** | `workspace-json/agents-audit@e47eb1b8556c4f361db9a78190a2f36b400756e8` |

The frozen SHA was **re-measured** on a clean clone (`git rev-parse HEAD`)
rather than inherited from the issue, and matches both META-237/META-238 and the
independently-frozen CLI slice (META-240). Both migration legs therefore derive
from the same immutable source input.

## Extraction command

```bash
git clone --no-single-branch https://github.com/workspace-json/agents-audit.git
cd agents-audit && git checkout main   # e47eb1b8556c4f361db9a78190a2f36b400756e8

git filter-repo --force \
  --path packages/spec \
  --path packages/rules \
  --path types \
  --path scripts \
  --path tsconfig.base.json \
  --path pnpm-workspace.yaml \
  --path package.json \
  --path .changeset \
  --path .github \
  --path .npmrc \
  --path .gitignore \
  --path CONTRIBUTING.md \
  --path SECURITY.md \
  --path CODE_OF_CONDUCT.md \
  --refs refs/heads/main

# Monorepo-wide tags are NOT replicated: per META-243's tag policy a tag in one
# repository must never claim another repository's package. All tags and remote
# refs were deleted, then the object store was pruned.
git for-each-ref --format='%(refname)' | grep -v '^refs/heads/main$' \
  | while read r; do git update-ref -d "$r"; done
git remote remove origin
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

## Result

```text
124 commits  ->  98 commits
commit-map: 124 entries (98 preserved, 26 dropped as containing no standard-owned change)
```

The full old→new mapping is committed at [`commit-map.txt`](./commit-map.txt).

### Head mapping

The frozen source SHA `e47eb1b8` is the merge of PR #23, which touched **only**
`packages/agents-audit/**`. It contains no standard-owned change, so
`git filter-repo` correctly pruned it. The extracted tip therefore derives from
the newest commit that *does* touch standard-owned paths:

```text
3a77e1ba156ee83d77a44c5255273345b80a3d34  "docs(spec): record npx bin fallback"
    -> 7500ff40204465be15a9d0325407e53ceba04cdd   (extracted tip, pre-reconstruction)
```

This loses no standard content: the extracted trees are byte-identical to the
frozen source (below).

## Included paths

```text
packages/spec/**          18 files   @workspacejson/spec@0.4.4
packages/rules/**         68 files   @workspacejson/rules@0.4.4
types/**                             shared ambient declarations (reduced — see below)
scripts/**                           pack / publish / registry verification
tsconfig.base.json                   shared TypeScript configuration
pnpm-workspace.yaml                  workspace definition
package.json                         root manifest
.changeset/**                        release configuration
.github/**                           CI and templates (the release workflow is REMOVED — see below)
.npmrc  .gitignore
CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md
```

## Excluded paths

```text
packages/agents-audit/**    CLI-owned -> workspacejson/cli (META-240, already landed)
packages/cli/**             CLI-owned private DataHub/dbt shim -> workspacejson/cli
docs/audits/**              historical monorepo reconciliation records
assets/**                   site-owned branding
.planning/**                local planning artifacts
.agents/workspace.json      this repository's own generated output, not source
pnpm-lock.yaml              encodes the 4-package monorepo graph; regenerated
README.md                   monorepo framing; rebuilt for this repository
CHANGELOG.md                mixed authority; rebuilt for standard-owned packages
AGENTS.md                   referenced CLI entry points; rebuilt
```

## Fidelity — verified BEFORE any repository-root reconstruction

Extracted trees compared against the frozen source by git tree hash:

```text
packages/spec    9fa4bd0bead4621f5a6147aa826b5b55f918f03f   IDENTICAL
packages/rules   a0927eb904a931cf4a5988f65a0f5f16d90ff77a   IDENTICAL
types            80ee90072829feade3d84742502f215f8ce2893c   IDENTICAL
scripts          b586562eb76e0e3dd85bc6c728e302c5a0e1b757   IDENTICAL
```

Shared root blobs also verified identical at extraction time:
`tsconfig.base.json`, `pnpm-workspace.yaml`, `package.json`,
`.changeset/config.json`, `.npmrc`, `.gitignore`, `CONTRIBUTING.md`,
`SECURITY.md`, `CODE_OF_CONDUCT.md`.

## Excluded-path leak check

Commits touching each excluded path, across **all** refs of the filtered
repository after ref cleanup:

```text
packages/agents-audit    0
packages/cli             0
docs                     0
assets                   0
.planning                0
.agents                  0
pnpm-lock.yaml           0
README.md                0
CHANGELOG.md             0
AGENTS.md                0
```

Object-level check: `git rev-list --objects --all` yields **0** objects
referencing CLI package paths.

Contamination gate (META-138) re-run on the filtered history:
`@marcelle-labs` **0**, `workspace.vreko.json` / `.vreko-swarm` /
`agents-workspace-cannon-repo` **0**.

## Intentional differences from the source

Each is recorded because the migration must not hide changes.

| Change | Reason |
| -- | -- |
| `repository.url` / `repository.directory` / `bugs.url` → `workspacejson/standard` | ownership correction; META-201 R-1 |
| `homepage` `www.workspacejson.dev` → `workspacejson.dev` | canonical bare domain; META-201 R-3 |
| `agents-audit` removed from both packages' `keywords` | stale after the split; META-201 R-4 |
| `@types/node@22.19.17` added as a devDependency of both packages | declared type environment; previously `spec` had **no** real Node types and `rules` obtained them accidentally via vitest |
| `types/ambient.d.ts` reduced 23 → 4 declarations | removed a stale `declare module '@workspacejson/spec'` that was winning over the real types, all hand-written `node:*` stubs, and all CLI-only stubs. Generated declaration bytes verified **identical** before and after |
| `tsconfig.base.json` `paths` alias removed | pointed at `packages/rules/src`; nothing in this repository imports `@workspacejson/rules` |
| Changesets fixed group drops `agents-audit` | published by `workspacejson/cli` |
| `scripts/verify-published.mjs` drops `agents-audit`, adds `./testing` | no repository verifies a package it does not publish |
| `scripts/verify-package-tarball.mjs` drops the `agents-audit` sibling-packing smoke test | that helper packed `../rules` and `../spec` from disk, a monorepo-only assumption |
| `scripts/verify-package-tarball.mjs` now `JSON.parse`s the packed manifest | **defect fix** — the source returned raw text, so `assertNoWorkspaceProtocol`, `assertFixedGroupDependencies` and the bin check were silently no-ops |
| Root `LICENSE` added | the source had none; copied byte-identically from `packages/spec/LICENSE` |
| `README.md`, `CHANGELOG.md`, `AGENTS.md`, `OWNERSHIP.md` rebuilt | repository-specific ownership text per the migration ledger |
| Release workflow **removed entirely**; `.github/RELEASE-AUTHORITY.md` added | authority has not transferred; META-243. `on: {}` produced a GitHub startup-failure run (0 jobs, 0 billable time) on every push, so absence was chosen over a disabled file |

**Not changed:** package names, versions (`0.4.4`), `bin`, `main`/`module`/`types`,
`exports`, `files`, Node engine range, runtime dependencies, schema bytes, and the
four stable read paths.

## Dependency decision

`@workspacejson/rules` retains `"@workspacejson/spec": "workspace:*"` in
committed source. Both packages live in **this one** pnpm workspace, so this is
an intra-repository link, not a cross-repository one.

Measured: `pnpm pack` rewrites it to the exact version, and the resulting packed
dependency block is **byte-identical to the published `@workspacejson/rules@0.4.4`
tarball**:

```json
"@workspacejson/spec": "0.4.4"
```

Zero occurrences of `workspace:` survive into either packed manifest.
`scripts/verify-package-tarball.mjs` asserts both properties on every pack.

## Rollback

The historical repository is **unmodified** and remains the publication
authority. No reverse-merge machinery exists.

```bash
# Inspect the exact source this repository was built from
git clone https://github.com/workspace-json/agents-audit.git
cd agents-audit
git checkout e47eb1b8556c4f361db9a78190a2f36b400756e8

# Standard-owned trees at that ref:
git rev-parse HEAD:packages/spec    # 9fa4bd0bead4621f5a6147aa826b5b55f918f03f
git rev-parse HEAD:packages/rules   # a0927eb904a931cf4a5988f65a0f5f16d90ff77a
```

To abandon this migration: delete `workspacejson/standard` or reset its default
branch. `@workspacejson/spec` and `@workspacejson/rules` continue to publish from
`workspace-json/agents-audit` exactly as before, because publish authority was
never moved.
