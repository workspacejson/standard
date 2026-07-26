# Repository settings and security posture

This document records the repository configuration this project intends, what is
actually set, and — where the two differ — why. It exists so that a setting
nobody can see in the source tree is still reviewable.

Settings are not code. Anyone with admin access can change them silently, and a
drifted setting looks identical to an intended one. Writing the intent down is
what makes drift detectable.

## Current state

Measured 2026-07-26. Re-measure rather than trusting this table:

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
| Visibility | private | **No — see below** |
| Issues | enabled | Yes — the single intake channel |
| Discussions | disabled | Yes — see [`SUPPORT.md`](../SUPPORT.md) |
| Wiki | disabled | Yes — documentation is version-controlled in `docs/` |
| Squash merge | enabled | Yes — the only permitted method |
| Merge commit | disabled | Yes |
| Rebase merge | disabled | Yes |
| Delete branch on merge | enabled | Yes |
| Branch protection | none | **No — see the constraint below** |

Everything above except visibility and branch protection was applied through the
GitHub API during the public-readiness pass. The two exceptions are not
oversights: one is an authority decision, the other is blocked by the plan.

## Merge policy

**Squash merge only.** One pull request becomes one commit on `main`.

The reason is specific to this repository rather than general taste: the schema,
the four stable read paths and the package manifests are byte-significant, and
`git log` on `main` is how a consumer reconstructs when a contract changed.
Merge commits and rebased series both make that history harder to bisect for the
one question that matters here — *which commit changed the contract?*

Automatic head-branch deletion is enabled so stale branches do not accumulate
alongside a repository whose value is its clarity.

## The visibility and plan constraint

Two facts constrain everything below, and neither is fixable by a documentation
pass:

1. **The repository is private.** The specification it contains is meant to be
   public, and the historical repository it was extracted from *is* public.
   Flipping visibility is an authority action outside the scope of polish work
   and is deliberately not done here.
2. **The organization is on the GitHub free plan**, and this repository has no
   Advanced Security (`security_and_analysis` is `null`).

Together those mean several controls that would otherwise be routine are simply
unavailable right now:

| Control | Status | Why |
| -- | -- | -- |
| Branch protection / rulesets | **unavailable** | Requires a paid plan for private repositories. Becomes free once public. |
| CodeQL code scanning | **unavailable** | Free for public repositories; needs Advanced Security while private. |
| Dependency review action | **unavailable** | Same constraint — it needs the dependency graph. |
| Secret scanning / push protection | **unavailable** | Free for public repositories; needs Advanced Security while private. |
| Private vulnerability reporting | **unavailable** | `PUT /repos/.../private-vulnerability-reporting` returns 404 on this plan while private. |
| Dependabot version updates | **enabled** | Works on the free plan. See [`.github/dependabot.yml`](../.github/dependabot.yml). |

The private-vulnerability-reporting gap is the one with a live consequence:
[`SECURITY.md`](../SECURITY.md), [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
and the issue-template configuration all direct reporters to the advisory form,
and that form does not resolve today. It is harmless only because nobody outside
the organization can read those files while the repository is private. **The
moment visibility changes, that stops being true.**

Adding a CodeQL or dependency-review workflow today would produce a workflow that
cannot succeed. A permanently red check is worse than a missing one: it trains
reviewers to ignore red, which is the precise failure that makes every other
check worthless. They are therefore evaluated and deferred, not silently
skipped.

## What to enable when the repository becomes public

In this order, because the later items depend on the earlier ones:

1. **Enable private vulnerability reporting.** Do this *before* announcing the
   repository, not after. Three committed files already point reporters at the
   advisory form; until it is enabled, the project's only disclosure channel is a
   dead link. Then remove the maintainer note at the top of
   [`SECURITY.md`](../SECURITY.md).

   ```bash
   gh api -X PUT /repos/workspacejson/standard/private-vulnerability-reporting
   ```

2. **Enable secret scanning and push protection.** Free for public repositories,
   and the cheapest control by a wide margin.
3. **Add CodeQL** on a `javascript-typescript` matrix, scheduled weekly plus on
   pull requests, with `security-events: write` scoped to that job only.
4. **Add the dependency review action** to pull requests, failing on high
   severity.
5. **Establish a ruleset on `main`** — see the next section.

## Required branch protection before publication authority

This is a hard gate, not a recommendation.

This repository does not currently hold publication authority for either package,
and the architecture guard fails the build if a publish step or credential
appears in any workflow. That arrangement is what currently makes unreviewed
pushes to `main` merely untidy rather than dangerous.

**The moment this repository can publish, an unprotected `main` becomes a supply
chain problem.** A push to `main` would become a path to the npm registry with no
review in between.

Therefore, before any npm credential is added:

- a ruleset on `main` requiring a pull request with at least one approving review;
- required status checks: the CI job on both Node 20 and 22;
- dismiss stale approvals on new commits;
- require conversation resolution;
- block force pushes and branch deletion;
- require review from code owners, so changes to the schema, the guards and the
  release documents reach a maintainer — see [`.github/CODEOWNERS`](../.github/CODEOWNERS).

The authority transfer and the protection ruleset belong in the same coordinated
change. Doing the first without the second creates exactly the window this
paragraph exists to prevent.

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
