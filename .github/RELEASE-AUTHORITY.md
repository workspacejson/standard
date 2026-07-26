# Release authority — deliberately absent

**This repository has no release workflow, and that is intentional.**

`@workspacejson/spec` and `@workspacejson/rules` are still published from
`workspace-json/agents-audit`, which holds the `NPM_TOKEN` secret. Transferring
that authority is **META-243**, and it has not happened.

## Why absence rather than a disabled workflow

An earlier revision of this migration shipped `.github/workflows/release.yml`
with `on: {}` and no publish step. GitHub cannot parse that as a runnable
workflow, so every push produced a *startup failure* run — zero jobs, zero
billable time, nothing executed, but a permanent red X on the repository.

A workflow that does not exist is both mechanically stronger and honest about
the current state. There is nothing to accidentally enable.

## What currently makes publication impossible

1. **No release workflow.** No file in `.github/workflows/` contains a publish
   step or a publish trigger.
2. **No credential.** This repository has an empty secret list and an empty
   variable list. `NPM_TOKEN` does not exist here.
3. **Enforced in CI.** `scripts/check-architecture.mjs` fails the build if any
   workflow gains `changeset publish`, `npm publish` or `pnpm publish`, or
   references a package this repository does not own. Red tests in
   `scripts/check-architecture.test.mjs` prove those guards reject deliberate
   violations.

## What META-243 must do

When publication authority transfers, in a single coordinated change:

1. Create `.github/workflows/release.yml` publishing **only**
   `@workspacejson/spec` and `@workspacejson/rules` via the Changesets fixed
   group already configured in `.changeset/config.json`.
2. Add an `NPM_TOKEN` secret scoped to those two packages only.
3. **Revoke the old repository's authority in the same change.** Two
   repositories publishing the same package is the specific failure this
   arrangement exists to prevent.
4. Adopt package-scoped tags (`standard-v0.4.5`), never monorepo-wide tags.
5. Relax the corresponding guards in `scripts/check-architecture.mjs`
   deliberately, with the red tests updated to match the new rule — not deleted.

Release order for a coordinated train is recorded in the four-repository
migration ledger: standard packs and verifies → cli tests against packed
standard candidates → integrations tests → standard publishes → cli → integrations
→ site.
