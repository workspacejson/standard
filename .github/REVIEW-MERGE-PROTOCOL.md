# Review and merge protocol

This document records the independent review layers, merge gate configuration,
and agent merge protocol for `workspacejson/standard`.

## Independent review layers

Two AI reviewers provide independent coverage. They are treated differently
during calibration.

### Greptile

- **Role**: hard automated status gate (once proven).
- **Config**: `.greptile/config.json` with `statusCheck: true`, `strictness: 1`,
  `triggerOnDrafts: true`, `triggerOnUpdates: true`, and 12 structured rules.
- **Current state**: did not run on PR #28. The Greptile GitHub app is likely
  not installed on this repository. This is **absence**, not a failed review.
- **Promotion path**: once the app is installed and the status check is observed
  firing and blocking, add `Greptile` as a required GitHub status check.

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
| `Greptile` | Greptile status check (`.greptile/config.json` `statusCheck: true`) | **Planned** (not yet required) |
| `Sourcery` | Sourcery review completion | **Review-protocol gate** (not a GitHub check yet) |

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
| Require code owner review | **currently required**; to be disabled after Greptile gate is demonstrated | See sole-code-owner deadlock below |
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

### Remediation

Adding Greptile as a required status check creates an **enforceable independent
gate** that does not depend on a second human reviewer. The remediation
sequence is:

1. **Add Greptile as a required status check** and demonstrate it fires and
   blocks a merge before proceeding.
2. **Then disable required code-owner approval**, since it cannot be satisfied
   by the sole code owner who authors all changes.
3. **Do not enable `enforce_admins` during initial calibration.** Retain admin
   bypass as an exceptional, recorded recovery path until Greptile reliability
   has been observed. Revisit after calibration.

### Interim governance model

For a sole-steward repository, the honest interim model is:

```
CODEOWNERS
    -> ownership/routing signal (not a merge gate)

Required Greptile review
+ Sourcery review-completion gate
+ current-head CI
+ conversation resolution
+ normative governance tests
    -> merge authorization
```

When a genuine second standard maintainer exists, restore required code-owner
approval.

### Acceptance cases

> Branch protection must not require an approval that the repository's
> legitimate maintainer cannot produce. Until a second independent code owner
> exists, CODEOWNERS remains authoritative for ownership/routing but required
> code-owner approval is disabled; automated review (Greptile), current-head
> required checks, and conversation resolution provide the enforced merge
> gate. Admin bypass is exceptional and recorded.

> **Independent reviewer completion:** Greptile and Sourcery reviews must both
> complete against the current PR head before merge. Greptile is the required
> automated status gate. Sourcery begins as a mandatory review-protocol gate:
> substantive findings must be resolved or explicitly dispositioned;
> advisory/cosmetic findings may be dispositioned without code changes. During
> calibration, determine whether Sourcery exposes a reliable current-head
> GitHub status suitable for branch protection or whether a dedicated CI
> `--check` job is warranted.

## Agent merge protocol

Before any merge to `main`, an agent must:

1. **Required CI is green on the current head.** Verify all required status
   checks are passing on the current head commit, not just the commit the PR
   was opened with.
2. **Greptile has completed review of the current head.** Do not merge while
   the Greptile review is pending. A green test suite is not merge
   authorization.
3. **Sourcery has completed an explicitly requested review of the current
   head; a guide or summary alone does not count.**
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

- Greptile organization/repository connection (Greptile dashboard)
- Greptile API token and webhook configuration (Greptile dashboard)
- Sourcery organization/repository connection (Sourcery dashboard)
- GitHub branch protection ruleset (GitHub repository settings or API)

The `.greptile/` files in this repository define all project-specific Greptile
review semantics. No dashboard-only setting is required for the rules to
function. Sourcery currently operates with default behavior and no repo-owned
config.
