# Greptile merge protocol

This document records the merge gate configuration for `workspacejson/standard`,
the agent merge protocol, and the exact required check names
so future agents do not infer them from UI labels.

## Required status checks

These are the exact check names that GitHub branch protection requires on `main`:

| Check name | Source | Status |
|------------|--------|--------|
| `test (20)` | `ci.yml` job `test` matrix Node 20 | Existing, preserved |
| `test (22)` | `ci.yml` job `test` matrix Node 22 | Existing, preserved |
| `Four-path producer conformance` | `ci.yml` job `producer-conformance` | Existing, preserved |
| `Greptile` | Greptile status check (`.greptile/config.json` `statusCheck: true`) | **Planned** (not yet required) |

## Branch protection settings

| Setting | Value | Notes |
|---------|-------|-------|
| Require pull request | yes | Existing |
| Required status checks | see table above | Greptile planned (not yet required) |
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
+ current-head CI
+ conversation resolution
+ normative governance tests
    -> merge authorization
```

When a genuine second standard maintainer exists, restore required code-owner
approval.

### Acceptance case

> Branch protection must not require an approval that the repository's
> legitimate maintainer cannot produce. Until a second independent code owner
> exists, CODEOWNERS remains authoritative for ownership/routing but required
> code-owner approval is disabled; automated review (Greptile), current-head
> required checks, and conversation resolution provide the enforced merge
> gate. Admin bypass is exceptional and recorded.

## Agent merge protocol

Before any merge to `main`, an agent must:

1. **Fetch current unresolved review threads** from the PR (both Greptile
   review comments and any human review comments).
2. **Verify all required status checks are passing** on the current head
   commit, not just the commit the PR was opened with.
3. **Do not merge while the Greptile review is pending.** A green test suite
   is not merge authorization. The asynchronous reviewer must complete.
4. **Resolve all conversation threads** before merging. An unresolved
   actionable thread blocks the merge.
5. **Report watched-main after merge** rather than treating PR-head CI as
   integration evidence. The post-merge state of `main` is what matters.
6. **If the sole-code-owner deadlock requires an admin bypass**, record the
   rationale in the merge commit message and the associated Linear ticket.
   Admin bypass is exceptional, not normal workflow.

## Dashboard-only settings

The following settings are not controllable from `.greptile/config.json` and
must be configured in the Greptile dashboard or GitHub repository settings:

- Greptile organization/repository connection (dashboard)
- GitHub branch protection ruleset (GitHub repository settings or API)
- Greptile API token and webhook configuration (dashboard)

The `.greptile/` files in this repository define all project-specific review
semantics. No dashboard-only setting is required for the rules to function.
