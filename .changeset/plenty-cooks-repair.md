---
"@workspacejson/rules": patch
"@workspacejson/spec": patch
---

Correct the published package metadata to name this repository, and record the
README and changelog corrections that ship inside the tarball.

Both manifests still described the packages as they were published from the
frozen historical workspace. None of it was reachable: `repository.url` and
`bugs.url` pointed at a repository that no longer exists under that name, so
every "open an issue" and "view source" link on both npm pages led nowhere.

`repository` now names this repository and carries a `directory` pointer, so npm
resolves each package to its own subtree rather than the monorepo root. `bugs`
follows it. `homepage` is the bare canonical host on both packages, per ADR-005 —
`@workspacejson/rules` additionally pointed at a `/audit/` subpath that predates
the neutral naming and no longer describes what the package is.

`author` reads `workspacejson contributors` on both, matching the org that now
holds them.

Two keywords were removed. `agents-audit` named the historical package rather
than these; `aaif` implied a standards-body status this project does not hold.

`@workspacejson/rules` has a new `description`. The old one described a narrower
package — AGENTS.md hygiene auditing — than the one that actually ships, which
carries the parser, repository scanner, validator and rule engine.

**Why a metadata-only change gets a changeset at all.** `README.md` and
`CHANGELOG.md` are both listed in `files`, so they are published bytes, not
repository furniture. Both package READMEs claimed to be published from the
historical workspace and loaded their brand assets from a frozen repository;
both changelogs recorded 0.4.4 as unreleased while the registry had already
served it. Those corrections reached consumers with no release note explaining
why the page changed. The manifest fields above are in the same position: they
are part of the published artifact even though no runtime behavior moves.

Nothing in either package's runtime, types, schema or exports changes. `patch`
is correct on its own terms; the fixed group is taking a `minor` this release
for reasons recorded in the accompanying changesets, and this rides along.
