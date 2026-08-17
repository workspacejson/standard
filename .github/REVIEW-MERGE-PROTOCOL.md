# Review and merge protocol

This document records the independent review layers, merge gate configuration,
and agent merge protocol for `workspacejson/standard`.

## Independent review layers

Two AI reviewers provide independent coverage. They are treated differently
during calibration.

### Greptile

- **Role**: none. Not a merge requirement of any kind. Retained as
  defense-in-depth for whenever it can run again.
- **Config**: `.greptile/config.json` with `statusCheck: true`, `strictness: 1`,
  `triggerOnDrafts: true`, `triggerOnUpdates: true`, and 12 structured rules.
  Kept deliberately — the rules are correct and cost nothing while dormant.
- **Current state**: **the trial account's 50-credit limit is exhausted.** The
  app *is* installed on the organization and does respond: it posts a
  credit-limit notice in place of a review and emits **no check run at all**.
  Observed on PR #37 (2026-08-13) and again on PR #42, where it posted the quota
  notice twice and produced zero check runs.

  An earlier revision of this document recorded the cause as "the Greptile
  GitHub app is likely not installed." That was wrong, and the distinction
  matters: an uninstalled app is a setup gap, while an exhausted quota is a
  reviewer that answers and says nothing. A quota notice is never recorded as a
  pass.
- **Promotion path**: closed until the plan is upgraded. `Greptile Review` was
  briefly a required status context and was **removed on 2026-08-13**, because a
  required context that nothing can produce blocks every merge. Re-admitting it
  requires paid credits *and* fresh calibration evidence on the same terms as
  before. See [`docs/repository-settings.md`](../docs/repository-settings.md),
  which is authoritative for the settings state.

### Sourcery

- **Role**: mandatory review-completion gate in the agent protocol. Not a
  GitHub required check yet.
- **Trigger**: auto-reviews PRs; can be explicitly retriggered with
  `@sourcery-ai review`.
- **Current state**: auto-posted a Reviewer's Guide as an issue comment on
  PR #28 (draft). No formal GitHub review, no inline threads, no check run.
- **Completion definition**: a Sourcery review has completed against the
  current PR head, evidenced by a response to an explicit `@sourcery-ai review`
  request or another review artifact that can be tied to that head. A
  Reviewer's Guide or summary alone does not satisfy the gate. Without
  head-association, Sourcery remains defense-in-depth rather than a merge
  authorization gate.
- **Finding disposition**: substantive findings must be fixed or given an
  explicit technical disposition. Advisory/cosmetic findings may be
  dispositioned without code changes. Zero Sourcery comments is not required.
- **Bulk resolution prohibited**: do not use `@sourcery-ai resolve` as part of
  normal agent merge procedure. Individual review threads must be handled
  individually. Bulk resolution is acceptable only after the agent has
  independently reconciled every thread.
- **Promotion path**: during calibration, determine whether Sourcery exposes a
  reliable current-head GitHub status suitable for branch protection, or
  whether a dedicated CI `--check` job is warranted. Only then decide if it
  becomes a required GitHub check.

## Required status checks

These are the exact check names that GitHub branch protection requires on `main`:

| Check name | Source | Status |
|------------|--------|--------|
| `test (20)` | `ci.yml` job `test` matrix Node 20 | Existing, preserved |
| `test (22)` | `ci.yml` job `test` matrix Node 22 | Existing, preserved |
| `Four-path producer conformance` | `ci.yml` job `producer-conformance` | Existing, preserved |
| `Greptile` | Greptile status check (`.greptile/config.json` `statusCheck: true`) | **Withdrawn 2026-08-13** — trial credits exhausted; emits no check run |
| `Sourcery` | Sourcery review completion | **Not required.** Promotion needs its own calibration evidence |

Verified against branch protection rather than assumed — `GET /repos/workspacejson/standard/branches/main/protection` returns exactly the three required contexts above.

## Branch protection settings

| Setting | Value | Notes |
|---------|-------|-------|
| Require pull request | yes | Existing |
| Required status checks | see table above | Greptile planned; Sourcery is protocol-only |
| Strict (require branches up to date) | yes | Existing, preserved |
| Dismiss stale approvals on new commits | yes | Existing, preserved |
| Require conversation resolution | yes | Existing, preserved |
| Block force pushes | yes | Existing, preserved |
| Block branch deletion | yes | Existing, preserved |
| Require code owner review | **disabled** (`require_code_owner_reviews: false`) | Was required; disabled after the Greptile gate was withdrawn. See below |
| Enforce for administrators | **no** during initial calibration | Retain admin bypass as exceptional recovery path |
| Squash merge only | yes | Existing, preserved |

## Sole-code-owner deadlock

This repository has a structural defect documented in
[`docs/repository-settings.md`](../docs/repository-settings.md):

1. `required_approving_review_count: 0` (no count-based approval)
2. Code-owner review is enabled and binds
3. Every path has exactly one code owner (`@qmarcelle`) who authors the changes
   (GitHub blocks self-approval)
4. `enforce_admins: false` (admin can bypass)

No combination of these controls results in a change being reviewed by someone
other than its author. The admin bypass is the only merge path, which makes the
protection advisory in practice.

### Remediation — attempted, and the outcome is worse than intended

This section previously proposed a three-step sequence premised on Greptile
becoming the enforceable independent gate. **Both of its first two steps have
already executed, and the result is that no reviewer requirement remains.**
Recorded as history rather than restated as a plan.

1. *Greptile as a required status check* — added, then **removed on
   2026-08-13** when the trial credits ran out. It satisfied the mechanical
   half of a gate (a matchable current-head context) only while credits lasted.
2. *Disabling required code-owner approval* — done.
   `require_code_owner_reviews` is `false`.
3. *`enforce_admins`* — remains **off**. It was left off as a recorded recovery
   path during Greptile calibration; with no required reviewer left, it is now a
   second way an unreviewed change reaches `main` rather than a backstop behind
   one.

[`docs/repository-settings.md`](../docs/repository-settings.md) is authoritative
for this and states the re-admission bar: a review gate requires **both** a
substantive review of the current pull-request head **and** a mechanically
enforceable current-head signal that branch protection can match. Neither
reviewer currently supplies both.

### Actual governance model

For a sole-steward repository with no funded automated reviewer, the honest
statement is:

```
CODEOWNERS
    -> ownership/routing signal (not a merge gate)

current-head required CI
+ conversation resolution
+ normative governance tests
+ the release-boundary gates in release.yml
    -> merge authorization

(no reviewer requirement of any kind since 2026-08-13)
```

Sourcery and Greptile are defense-in-depth, not authorization. Sourcery does
emit a `Sourcery review` check run associated with the current head, which is
the mechanical half the re-admission bar asks for — but promoting it is a
separate decision requiring its own calibration evidence, on the same terms
Greptile was held to, and is deliberately not taken here.

When a genuine second maintainer exists, restore required code-owner approval
and enable administrator enforcement.

### Acceptance cases

> Branch protection must not require an approval that the repository's
> legitimate maintainer cannot produce — and must not require a check that no
> installed app can emit. Until a second independent code owner exists,
> CODEOWNERS remains authoritative for ownership/routing but required
> code-owner approval is disabled; current-head required checks and
> conversation resolution provide the enforced merge gate. Admin bypass is
> exceptional and recorded.

> **Reviewer findings, when a reviewer does run:** substantive findings must be
> resolved or explicitly dispositioned; advisory or cosmetic findings may be
> dispositioned without code changes. This applies to whichever reviewer
> actually produced output, and is a discipline about handling findings rather
> than a merge gate — neither reviewer is required. A quota notice, a
> Reviewer's Guide, or a summary is not a review and is never dispositioned as
> one.

## Agent merge protocol

Before any merge to `main`, an agent must:

1. **Required CI is green on the current head.** Verify all required status
   checks are passing on the current head commit, not just the commit the PR
   was opened with.
2. **Do not wait on Greptile.** It cannot complete: the trial credits are
   exhausted, so it posts a quota notice and emits no check run. Waiting on it
   is an indefinite block, and treating its notice as a pass is worse.
3. **Read whatever reviewer output does exist** on the current head — Sourcery,
   Copilot, Socket, SonarCloud — and reconcile it per step 4. None of them
   authorizes the merge; a green test suite does not either. On this repository
   merge authorization is the steward's, exercised against the gates below.
4. **Every actionable reviewer finding has been individually reconciled:**
   - substantive -> fixed or explicit technical disposition;
   - cosmetic/advisory -> explicit disposition is sufficient.
   Do not use `@sourcery-ai resolve` as a substitute for individual
   reconciliation. Bulk resolution is acceptable only after the agent has
   independently reconciled every thread.
5. **Required GitHub conversations are resolved.**
6. **Perform a fresh thread-aware read** after all reviewer activity has
   completed. Fetch current unresolved review threads from the PR.
7. **Merge only if the current head still satisfies every gate.**
8. **Record watched-main after merge** rather than treating PR-head CI as
   integration evidence. The post-merge state of `main` is what matters.
9. **If the sole-code-owner deadlock requires an admin bypass**, record the
   rationale in the merge commit message and the associated Linear ticket.
   Admin bypass is exceptional, not normal workflow.

## Dashboard-only settings

The following settings are not controllable from repository files and must be
configured in the respective dashboard or GitHub repository settings:

- Greptile organization/repository connection (Greptile dashboard) — connected,
  but the account's trial credits are exhausted, so no review is produced
- Greptile plan/credits (Greptile dashboard) — the only thing that would make
  the `.greptile/` rules run again
- Sourcery organization/repository connection (Sourcery dashboard)
- GitHub branch protection ruleset (GitHub repository settings or API)

The `.greptile/` files in this repository define all project-specific Greptile
review semantics. No dashboard-only setting is required for the rules to
function. Sourcery currently operates with default behavior and no repo-owned
config.
