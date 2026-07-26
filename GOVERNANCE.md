# Governance

This repository holds the normative definition of `workspace.json`. Its
governance exists to make one thing predictable: **what a consumer can rely on,
and what may change underneath them.**

## Scope of authority

This repository decides:

- the normative JSON Schema and the types generated from it
- validation semantics, including legacy validation behavior
- deterministic reference behavior — parser, scanner, rule engine
- compatibility profiles and the stable read-path contract
- conformance fixtures and executable examples
- the architecture decision records in [`docs/adr/`](./docs/adr/)

It does not decide how artifacts are produced, how hosts integrate, or how the
website presents any of it. Those live in `workspacejson/cli`,
`workspacejson/integrations` and `workspacejson/site` respectively.
[`OWNERSHIP.md`](./OWNERSHIP.md) states the full boundary; it is enforced by
`scripts/check-architecture.mjs` in CI rather than by convention.

## Roles

**Maintainers** review and merge changes, cut releases when this repository holds
publication authority, and are accountable for the compatibility guarantees
below. The current list is [`MAINTAINERS.md`](./MAINTAINERS.md).

**Contributors** open issues and pull requests. No agreement or assignment is
required beyond the Apache-2.0 license the repository is under.

There is no separate committer tier and no voting body. Pretending otherwise
would describe a process that does not exist.

## How decisions are made

Ordinary changes — bug fixes, documentation, tests, non-breaking additions — need
one maintainer approval and green CI.

Changes to the **normative surface** need an architecture decision record before
implementation. The normative surface is:

- the bytes of `packages/spec/schema/v1.json`
- the four stable read paths
- the public export surface of either package
- the descriptive-not-prescriptive and daemon-free properties

An ADR is a file in [`docs/adr/`](./docs/adr/) recording context, the decision,
its boundaries, consequences and supersession rules. It is reviewed as a pull
request like any other change. [`docs/adr/README.md`](./docs/adr/README.md)
describes the format and status vocabulary.

When maintainers disagree, the decision escalates to the ADR owner named in the
record. That is a real tiebreak with a real name on it, not a consensus ritual.

## What is deliberately hard to change

Two properties are load-bearing and are enforced in CI, not merely documented:

**The standard is descriptive, never prescriptive.** `workspace.json` reports
what a repository *is*. Fields that encode what a team *must do* — approval
gates, merge blocking, enforcement policy — are rejected by the architecture
guard. Changing this requires an ADR that supersedes the property explicitly.

**The committed file must remain useful without a daemon.** Nothing in the
standard may assume a background process is running.

The four stable read paths — `manual.fragileFiles`, `manual.coChangePatterns`,
`generated.fileIndex`, `generated.frameworkManifest` — are treated as a breaking
change if removed or renamed, regardless of what the version number would
otherwise suggest. See [`docs/versioning.md`](./docs/versioning.md).

## Publication authority

**This repository currently cannot publish, by design.** Both packages are
published from the historical repository that this one was extracted from, which
holds the only credential. This repository has no npm secret and no release
workflow at all, and the architecture guard fails the build if a publish step or
credential reference appears in any workflow.

Transferring authority is a separate, coordinated change that must revoke the old
authority in the same act — two repositories publishing the same package is the
specific failure this arrangement prevents. The full rationale and the checklist
for that transfer are in [`.github/RELEASE-AUTHORITY.md`](./.github/RELEASE-AUTHORITY.md).

Do not add a credential, a publish step, or a release workflow to this repository
as a convenience. It will fail CI, and that is the intended behavior.

## Changing this document

Governance changes are pull requests against this file and require the same
maintainer approval as any other change. Changes that alter the normative surface
or the escalation path additionally require an ADR.
