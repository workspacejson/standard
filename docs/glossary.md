# Glossary

Terms used across this repository, the specification and its documentation.
Where a term is commonly misread, the entry says what it does **not** mean.

### `.agents/workspace.json`

The canonical on-disk path of the artifact, relative to the repository root. See
[ADR-001](./adr/001-canonical-artifact-path.md). The legacy path
`.agents/agents.workspace.json` remains a valid read fallback but must not be
written by a producer.

### AGENTS.md

A human-authored, prescriptive document describing what contributors and agents
*should do* in a repository. It is a separate convention from this one.
`workspace.json` is its descriptive counterpart: `AGENTS.md` states intent,
`workspace.json` reports observation. `@workspacejson/rules` parses `AGENTS.md`
in order to audit its hygiene against observed repository state.

### Artifact

The committed `workspace.json` document itself. "Artifact" is used rather than
"file" when the point is that it is a reviewable, diffable unit of evidence —
not merely a location on disk.

### Basis

The identity of the inputs a generated observation was derived from —
conventionally `{ revision, producerVersion, algorithmVersion, inputDigest }`.
Basis is what makes a generated value reproducible rather than merely asserted.
Generalized basis identity is deferred; see
[ADR-002](./adr/002-bounded-enrichment-program.md).

### Clean room

The rule that no repository in this organization may import, copy from, require
or assume proprietary source. Direction matters: proprietary code may consume
released Apache-2.0 packages from here; the reverse is prohibited. Enforced by
`scripts/check-architecture.mjs`, not by convention. See
[`OWNERSHIP.md`](../OWNERSHIP.md).

### Co-change

A pair of files that historically change together. Reported as
`generated.coChange` entries carrying an unordered two-file set, a rate and an
occurrence count. The `generated: boolean` flag distinguishes tooling-coupled
pairs — a lockfile and its manifest — from real source couplings. Consumers
should filter on that flag rather than applying path heuristics at read time.

Maintainer-declared couplings are a different thing and live at
`manual.coChangePatterns`.

### Compatibility floor

The four stable read paths, treated as a hard compatibility surface. Removing or
renaming any of them is breaking regardless of version arithmetic. See
[`docs/versioning.md`](./versioning.md).

### Conformance

Whether an implementation meets its obligations as a producer or a consumer. See
[`docs/conformance.md`](./conformance.md), including its list of known gaps.

### Consumer

Anything that reads the artifact — an agent, an editor integration, an MCP
server, a validator, a human reviewer. Consumers are bound by the read contract,
not by how the file was produced.

### Descriptive, not prescriptive

The load-bearing property of this standard. `workspace.json` reports what a
repository *is*. It never encodes what a team *must do* — no approval gates, no
merge blocking, no enforcement policy. Enforced in CI: the architecture guard
rejects prescriptive field names in the schema.

This is the boundary against `AGENTS.md`, which is prescriptive by design.

### Daemon-free

The second load-bearing property. The committed artifact must remain useful with
nothing running. A consumer may read, diff and review it with no background
process present. Nothing in the standard may assume otherwise.

### Fragility

A per-file measure derived from change and revert history, reported as
`generated.fragility` entries. Entries carrying `excluded: true` are generated or
lock files with `fragilityScore: 0`; filter them out before ranking.

Maintainer-declared fragility is a different thing and lives at
`manual.fragileFiles`.

### `generated`

The producer-owned section of the document. Replaced wholesale on each
regeneration. Contains machine-derived observations, including
`generated.fileIndex` and `generated.frameworkManifest`.

### `manual`

The human-owned section. **Preserved verbatim across regeneration** — a producer
that overwrites it is not conformant. Contains maintainer assertions, including
`manual.fragileFiles` and `manual.coChangePatterns`.

The `manual` / `generated` split is the provenance boundary of the whole format.
A consumer that merges the two loses the ability to say whether a claim came from
a person or a script.

### Materialize

To copy the schema out of a pinned package version and hash-check it, rather than
maintaining an editable second copy. Downstream repositories materialize; they do
not fork. Copies drift; pinned materializations cannot.

### Normative surface

The parts of this repository that constitute the contract: the bytes of
`packages/spec/schema/v1.json`, the four stable read paths, the public exports of
either package, and the descriptive and daemon-free properties. Changes here
require an architecture decision record. See [`GOVERNANCE.md`](../GOVERNANCE.md).

### Producer

Anything that writes the artifact. Producers are owned by `workspacejson/cli`,
not by this repository. This repository defines what a conformant producer must
do; it does not implement one.

### Publication authority

Which repository holds the credential to publish a given package. There is
exactly one per package, by design — two repositories publishing the same package
is the specific failure the arrangement prevents. This repository currently holds
none. See [`.github/RELEASE-AUTHORITY.md`](../.github/RELEASE-AUTHORITY.md).

### Reference behavior

The deterministic implementation this repository ships so that "what the
specification means" has an executable answer: the parser, scanner, validator and
rule engine in `@workspacejson/rules`. It is a reference, not a product.

### `specVersion`

`generated.specVersion` — the profile a *document* conforms to, such as `"0.3"`
or `"0.4"`. Distinct from the package version, which identifies a release of the
tooling. Neither can be inferred from the other. See
[`docs/versioning.md`](./versioning.md).

### Stable read paths

The four externally consumed paths that form the compatibility floor:

```text
manual.fragileFiles
manual.coChangePatterns
generated.fileIndex
generated.frameworkManifest
```

### Standard

Used in two senses, and the difference matters. **The standard** is the
`workspace.json` specification. **`workspacejson/standard`** is the repository
that owns it. The repository name is not part of the format's name.
