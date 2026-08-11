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
| Branch protection | **enabled; no independent-review path** | PR + CI on Node 20/22 + conversation resolution + codeowner review + block force-push/deletion. **General approving-review count is `0`, the sole code owner authors the changes, and admin enforcement is off.** See below. |
| Secret scanning | **enabled** | Free for public repositories. |
| Secret scanning push protection | **enabled** | Blocks commits containing detected secrets. |
| Private vulnerability reporting | **enabled** | The advisory form at [`SECURITY.md`](../SECURITY.md) now resolves. |
| Dependabot version updates | **enabled** | See [`.github/dependabot.yml`](../.github/dependabot.yml). |
| CodeQL code scanning | **deferred** | Free for public repositories; not yet configured. |
| Dependency review action | **deferred** | Needs the dependency graph; not yet configured. |

## Branch protection

Branch protection is **enabled** on `main` as of 2026-07-28. Measured against the
GitHub API on 2026-08-04, it requires:

- a pull request;
- required status checks, strict: `test (20)`, `test (22)`, and `Four-path
  producer conformance`;
- dismiss stale approvals on new commits;
- require conversation resolution;
- block force pushes and branch deletion;
- require review from code owners — see [`.github/CODEOWNERS`](../.github/CODEOWNERS).
  A post-calibration transition to independent AI review layers (Greptile as
  hard status gate, Sourcery as mandatory review-completion gate) is planned;
  see [`.github/REVIEW-MERGE-PROTOCOL.md`](../.github/REVIEW-MERGE-PROTOCOL.md).

Two controls this document previously claimed are **not** in place:

| Claimed | Measured |
| -- | -- |
| a pull request with at least one approving review | `required_approving_review_count: 0` |
| enforce on admins | `enforce_admins: false` |

No ruleset supplies these separately; `GET /repos/workspacejson/standard/rulesets`
returns `[]`.

### The actual defect: no enforceable independent-review path

These are four separate facts, and the defect is what they produce together —
not any one of them alone.

1. **The general approving-review count is `0`.** No count-based approval is
   required, so paths a code-owner rule does not reach are unprotected by review.
2. **Code-owner review is enabled and does bind.** `require_code_owner_reviews`
   is an independent control: it blocks an affected pull request until a code
   owner approves it, regardless of the general count. Nothing here should be
   read as saying that control is inert — it is not.
3. **Every path has exactly one code owner, and that owner authors the changes.**
   [`.github/CODEOWNERS`](../.github/CODEOWNERS) assigns `*` and every specific
   path to `@qmarcelle`. GitHub does not permit a pull-request author to approve
   their own pull request, so a self-authored change cannot satisfy the
   code-owner requirement from within.
4. **Administrator enforcement is off.** `enforce_admins: false` means the
   administrator — the same account — can bypass the protection entirely.

The controls are configured. What is missing is a *second person*: no combination
of the above currently results in a change being reviewed by someone other than
its author. A post-calibration transition is planned: Greptile would serve as an
enforceable independent review gate and Sourcery as a mandatory
review-completion gate, after which required code-owner approval would be
disabled until a second human maintainer exists. See
[`.github/REVIEW-MERGE-PROTOCOL.md`](../.github/REVIEW-MERGE-PROTOCOL.md).

**This is not currently a credentialed package-publication risk**, because this
repository holds no npm credential and ships no release workflow. It is not
harmless in general — `main` here is the public canonical source of the standard,
and unreviewed changes to the schema, the guards, or the governance documents
land the same way.

### Remediation

Raising the approval count alone does not fix this. The remediation has two
phases:

**Phase 1 (current): Greptile as independent review gate.**

Adding Greptile as a required status check creates an enforceable independent
gate that does not depend on a second human reviewer. The `.greptile/`
configuration (see [`.greptile/config.json`](../.greptile/config.json)) defines
project-specific review rules. `triggerOnDrafts: true` ensures the review starts
before the PR leaves draft, and `triggerOnUpdates: true` ensures new commits
retrigger review.

**Phase 2 (after Greptile gate is demonstrated): Disable required
code-owner approval.**

Once the Greptile gate is proven to fire and block, required code-owner approval
is disabled (it cannot be satisfied by the sole code owner who authors all
changes). CODEOWNERS remains authoritative for ownership/routing but is no longer
a merge gate.

The interim governance model for this sole-steward repository:

```
CODEOWNERS
    -> ownership/routing signal (not a merge gate)

Required Greptile review
+ current-head CI
+ conversation resolution
+ normative governance tests
    -> merge authorization
```

`enforce_admins` remains **off** during initial calibration. Admin bypass is
retained as an exceptional, recorded recovery path until Greptile reliability
has been observed. When a genuine second standard maintainer exists, restore
required code-owner approval and enable administrator enforcement.

The following must still be closed *before* publication authority transfers:

1. **At least one independent maintainer or code owner** able to review
   `@qmarcelle`-authored changes.
2. **At least one required approval** (`required_approving_review_count >= 1`),
   so review is required on paths no code-owner rule reaches.
3. **Administrator enforcement**, or a no-bypass ruleset carrying a deliberately
   bounded and documented release exception.
4. **Continued protection of `.github/CODEOWNERS` itself**, so the ownership map
   cannot be edited to route around the requirement. This is already in place at
   `.github/CODEOWNERS:29` and must survive any change made for points 1–3.

`.github/RELEASE-AUTHORITY.md` and the migration plan both treat protected,
reviewed release paths as a precondition for holding a credential. The Greptile
gate is an interim measure, not a substitute for independent human review before
publication.

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
