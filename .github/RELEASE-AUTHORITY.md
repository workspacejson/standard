# Release authority

This repository publishes exactly two packages — `@workspacejson/spec` and
`@workspacejson/rules` — as one fixed Changesets group, from one workflow:
[`workflows/release.yml`](workflows/release.yml).

It publishes nothing else. `agents-audit` and `@workspacejson/cli` belong to
`workspacejson/cli`; `@workspacejson/codex-mcp` belongs to
`workspacejson/integrations`. One package, one publishing repository — a package
with two live authorities cannot answer "which repository produced this
version?", and answering it after the fact is harder than preventing it.

## Why there is a workflow here at all

An earlier revision of this repository shipped **no** release workflow, on
purpose: authority sat elsewhere, and a workflow that does not exist is
mechanically stronger than a disabled one. (An even earlier revision shipped
`release.yml` with `on: {}`, which GitHub cannot parse as runnable — every push
produced a startup-failure run: zero jobs, zero billable time, permanent red X.)

Absence stopped being the right tool once authority had to move. Absence cannot
be reviewed, cannot be dry run in advance, and gives the eventual cutover nothing
to inspect. What replaces it is not "a workflow exists now" but a **designated**
workflow, with the one-authority constraint moved from *nothing can publish* to
*exactly one auditable file can, and only under these conditions*.

`scripts/check-architecture.mjs` enforces that, and its red tests in
`scripts/check-architecture.test.mjs` prove each clause rejects a deliberate
violation:

| Rule | Enforced against |
| -- | -- |
| Only `workflows/release.yml` may contain a publish step | every other workflow, under any filename |
| Only `workflows/release.yml` may reference a publish credential | every other workflow |
| The release workflow publishes through `changeset publish` | a raw `npm publish`, which can ship any directory under any name |
| The release workflow is unreachable from `pull_request` | a fork or unmerged branch reaching the credential |
| The release workflow declares `id-token: write` | provenance configured but not permitted, and therefore silently absent |
| No workflow references a package this repository does not own | claiming another repository's artifacts |

## What still makes publication impossible today

The workflow exists and is reviewable. It cannot publish, for reasons that are
mechanical rather than procedural:

1. **No credential.** This repository has no `NPM_TOKEN` secret. GitHub expands a
   missing secret to an empty string, so `check:release-credential` checks
   arrival explicitly and stops the run, rather than letting npm fail later with
   a message that reads like a permissions problem.
2. **No approval gate — and its absence is not the barrier.** The publish job
   declares the `npm-publish` environment, which does not exist on this
   repository today. That declaration is a *placeholder for* the human
   checkpoint, not a mechanism that currently provides one: GitHub creates a
   referenced environment on first use, with no protection rules. An
   unconfigured environment gates nothing. It becomes a checkpoint only once
   required reviewers are configured on it, which is part of the cutover.
3. **The boundary defaults to refusing.** `scripts/release-boundary.mjs` treats
   anything other than an explicit non-dry run as a dry run, and refuses any ref
   that is not a package-scoped `standard-v*` tag. A dispatch that sets nothing
   verifies; it does not publish.

## The order the workflow runs in

Everything provable without a registry runs first, on any ref, with no
credential:

1. **release identity** — the tag is checked against the version Changesets
   computed. The version is never typed into the workflow. A tag naming a version
   nobody derived, a fixed group out of lockstep, or a changeset still pending
   all stop the release here.
2. **clean install at the release commit** — `--frozen-lockfile`, so a lockfile
   that does not satisfy the manifests stops the release instead of publishing
   against dependencies nothing ever tested.
3. **the full gate suite** — architecture, documentation, ADR index, build,
   typecheck, tests, schema provenance, examples, path-identity corpus.
4. **pack and inspect** — both tarballs, their packed manifests, their file
   lists, their ownership metadata, and any dependency a consumer could not
   resolve from the registry.
5. **disposable consumer** — the tarballs are installed into an empty directory
   and used by package name only, outside the workspace that has been quietly
   supplying anything the packages forgot to ship.

Only then does the boundary decide. On the far side: credential arrival,
`changeset publish` with provenance, and a registry install of the real published
artifacts with propagation-aware retry.

## Before a publish tag is pushed

A `standard-v*` tag is the release trigger, so pushing one is the decision to
publish. It must not be pushed until the outstanding changesets have been
reconciled and the release candidate pinned — the accumulated changesets
determine the version, and reviewing them after the tag exists is reviewing a
decision already made.

The identity gate enforces the mechanical half: a tag cut while changesets are
still pending is refused, because that ref is not the output of
`changeset version` and publishing it would drop those changesets from the
release notes.

## What the authority cutover must do, in one step

1. Create the `npm-publish` environment **and configure required reviewers on
   it**. Creating it is not enough and neither is letting the workflow create it:
   an environment with no protection rules is not a checkpoint, and it will exist
   either way the first time the publish job runs.
2. Provision `NPM_TOKEN` as an **environment** secret on `npm-publish`, scoped to
   `@workspacejson/spec` and `@workspacejson/rules` only. A repository secret
   would be reachable by any job in any workflow; an environment secret is
   reachable only by a job that declares that environment and clears its
   protection rules.
3. **Revoke the historical authority in the same change.** Two repositories
   publishing one package is the specific failure this arrangement prevents, and
   a window where both can publish is that failure happening.
4. Confirm that the old authority is incapable by attempting and observing, not
   by inferring from settings — archiving a repository does not revoke its
   Actions secrets.
5. Record the receipts the release produces: package, version, commit, tarball
   integrity, provenance attestation, and the rollback ref.

Secret presence cannot be enumerated by every tool that might look for it.
Failure to observe a secret is not evidence that it is absent, so this step is
measured at the settings level by a human immediately before the mutation.

## Tags

Package-scoped only: `standard-v0.5.0`. Never a bare `v0.5.0` — this repository
shares an ecosystem with three others, and a repository-wide version tag claims
releases it does not own. The identity gate refuses a bare version tag by name.

## Recovery

An npm version cannot be replaced once published, so recovery is forward-only:
publish a corrected version and move `latest`. Deprecating the bad version is
possible; unpublishing it is not, beyond npm's narrow initial window.

That is why every gate above runs *before* the boundary rather than after it, and
why the post-publish registry check exists — its job is to detect a release that
went wrong quickly enough to publish a corrected one, not to undo anything.

## Release train order

Standard packs and verifies → cli tests against packed standard candidates →
integrations tests → standard publishes → cli → integrations → site. Recorded in
the four-repository migration ledger.
