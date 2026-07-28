# Repository settings and security posture

This document records the repository configuration this project intends, what is
actually set, and — where the two differ — why. It exists so that a setting
nobody can see in the source tree is still reviewable.

Settings are not code. Anyone with admin access can change them silently, and a
drifted setting looks identical to an intended one. Writing the intent down is
what makes drift detectable.

## Current state

Measured 2026-07-28. Re-measure rather than trusting this table:

```bash
gh repo view workspacejson/standard \
  --json description,homepageUrl,repositoryTopics,visibility,deleteBranchOnMerge,\
hasIssuesEnabled,hasDiscussionsEnabled,hasWikiEnabled,\
squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,defaultBranchRef
```

| Setting | Value | Intended? |
| -- | -- | -- |
| Default branch | `main` | Yes |
| Description | set | Yes |
| Homepage | `https://workspacejson.dev` | Yes |
| Topics | 10, listed below | Yes |
| Visibility | public | Yes |
| Issues | enabled | Yes — the single intake channel |
| Discussions | disabled | Yes — see [`SUPPORT.md`](../SUPPORT.md) |
| Wiki | disabled | Yes — documentation is version-controlled in `docs/` |
| Squash merge | enabled | Yes — the only permitted method |
| Merge commit | disabled | Yes |
| Rebase merge | disabled | Yes |
| Delete branch on merge | enabled | Yes |
| Branch protection | enabled (PR + 1 review + CI + conversation resolution + codeowner) | Yes |

All settings above were applied through the GitHub API during the public-readiness
pass and the subsequent security hardening on 2026-07-28.

## Merge policy

**Squash merge only.** One pull request becomes one commit on `main`.

The reason is specific to this repository rather than general taste: the schema,
the four stable read paths and the package manifests are byte-significant, and
`git log` on `main` is how a consumer reconstructs when a contract changed.
Merge commits and rebased series both make that history harder to bisect for the
one question that matters here — *which commit changed the contract?*

Automatic head-branch deletion is enabled so stale branches do not accumulate
alongside a repository whose value is its clarity.

## Security posture

The repository is public on the GitHub free plan. The following controls are
now enabled:

| Control | Status | Notes |
| -- | -- | -- |
| Branch protection | **enabled** | PR + 1 approving review + CI on Node 20/22 + conversation resolution + codeowner review + block force-push/deletion. See below. |
| Secret scanning | **enabled** | Free for public repositories. |
| Secret scanning push protection | **enabled** | Blocks commits containing detected secrets. |
| Private vulnerability reporting | **enabled** | The advisory form at [`SECURITY.md`](../SECURITY.md) now resolves. |
| Dependabot version updates | **enabled** | See [`.github/dependabot.yml`](../.github/dependabot.yml). |
| CodeQL code scanning | **deferred** | Free for public repositories; not yet configured. |
| Dependency review action | **deferred** | Needs the dependency graph; not yet configured. |

## Branch protection

Branch protection is **enabled** on `main` as of 2026-07-28. The protection
requires:

- a pull request with at least one approving review;
- required status checks: `test (20)`, `test (22)`, and `Four-path producer
  conformance`;
- dismiss stale approvals on new commits;
- require conversation resolution;
- block force pushes and branch deletion;
- require review from code owners, so changes to the schema, the guards and the
  release documents reach a maintainer — see [`.github/CODEOWNERS`](../.github/CODEOWNERS).
- enforce on admins.

This was a hard gate before publication authority. The protection is now in
place, so the authority transfer in `.github/RELEASE-AUTHORITY.md` can proceed
without creating a supply-chain window.

## Repository metadata

| Field | Value |
| -- | -- |
| Description | Canonical specification, JSON Schema, types and deterministic reference behavior for workspace.json — the committed repository-intelligence artifact at .agents/workspace.json |
| Homepage | `https://workspacejson.dev` |
| Topics | `workspace-json`, `json-schema`, `open-standard`, `specification`, `ai-agents`, `agents-md`, `developer-tools`, `typescript`, `repository-metadata`, `codebase-intelligence` |

Topics are chosen for discovery by someone looking for this kind of artifact.
None of them asserts adoption, endorsement or standards-body status.

**No social preview image is set.** The repository has no approved neutral asset
of its own, and borrowing one from another repository would break the moment that
repository changes. It is left unset rather than filled with something that will
rot.

## Workflow permissions

`ci.yml` declares `permissions: contents: read` at the workflow level and repeats
it at the job level. It reads the repository and nothing else — it does not
comment, label, publish or write artifacts.

Any future job needing more must raise it at the job level, scoped to that job,
with a comment stating why. Raising the workflow-level default to satisfy one
step grants that permission to every step, including third-party actions.

Actions are pinned by major version tag. Dependabot's `github-actions` ecosystem
entry keeps them current; see [`.github/dependabot.yml`](../.github/dependabot.yml).
