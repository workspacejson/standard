# Review rules for workspacejson/standard

This repository is the canonical source of the `workspace.json` specification.
It owns the normative JSON Schema, validation semantics, deterministic rules,
conformance fixtures, and architecture decision records (ADRs).

The rules below are enforced as structured rules in `config.json` and elaborated
here in prose so the reasoning is reviewable alongside the code.

## Ecosystem-wide rules

These rules apply to all files in this repository and will apply to every
repository in the `workspacejson` ecosystem when rolled out.

### Evidence must be load-bearing

A verification check that cannot fail proves nothing. A metric that does not
perturb when its referent changes is a constant, not a measurement. If you add
a test, guard, or assertion, it must be capable of failing for the defect it
claims to catch. A test that passes regardless of input is documentation, not
verification.

Example violation: a conformance check that validates examples against the
schema but skips on any error, reporting "all passed" regardless of outcome.

### Absence is not success

Absence, skipped, unsupported, or unavailable is never success, false, safe,
empty, or green. A gate that goes green because it could not find the thing it
measures reports conformance it never measured. Missing evidence must be
reported as missing, not as a passing result.

Example violation: a check that looks for a fixture directory, finds it absent,
and reports "0 failures" instead of "fixtures not found."

### Measurements must perturb

Metrics and receipts must perturb when their referent changes. A number that
does not move when its input changes is decorative. If you add or update a
metric, verify it actually responds to changes in the underlying value.

Example violation: a coverage number that stays at 100% after removing a test
file, because the denominator was hardcoded rather than computed.

### No cross-organizational dependencies

No `@marcelle-labs/*`, private Vreko source, `workspace.vreko.json`, or
cross-org implementation dependency may appear in any file including config,
comments, or documentation. This repository is the public canonical standard
and must not reference private organizational internals.

### Checks cannot be vacuous

Every verification check must be considered in both directions: cannot-never-pass
and cannot-never-fail. A guard that rejected everything looks identical to a
working guard from a green build. If you add a check, consider what it would
look like if it were broken in each direction.

Example violation: a negative-fixture validator that rejects all fixtures for
"schema invalid" without identifying which constraint was violated. It looks
green when the fixtures are valid, but it also looks green when the validator
itself is broken.

## Standard-specific rules

These rules apply to the normative surface of this repository. They are scoped
via glob patterns in `config.json` so they fire only on relevant files.

### Descriptive, never prescriptive

`workspace.json` remains descriptive, never prescriptive. No enforcement,
approval-gate, or merge-blocking fields may be added to the schema or
documentation. The standard describes what is; it does not mandate what must
be done with it. A field that tells a consumer "you must block merges if this
is present" is prescriptive and does not belong here.

Scope: `packages/spec/**`, `docs/adr/**`, `docs/conformance.md`,
`docs/versioning.md`, `docs/glossary.md`, `docs/troubleshooting.md`

### Daemon-free

The committed artifact must remain daemon-free and independently useful with
nothing running. No field, example, or documentation may introduce a dependency
on a running service, daemon, or live process for the artifact to be meaningful.
A consumer who clones this repo and reads `workspace.json` must not need a
Vreko daemon, a DataHub instance, or any other live system to understand what
the artifact says.

Scope: `packages/spec/**`, `docs/**`

### Four stable read paths are breaking surfaces

The four stable read paths (`manual.fragileFiles`,
`manual.coChangePatterns`, `generated.fileIndex`,
`generated.frameworkManifest`) are breaking surfaces regardless of semver
optics. Changes to their structure, semantics, or field names require an ADR
and are not additive changes. A semver bump does not make a read-path change
non-breaking; the read paths are the compatibility surface.

Scope: `packages/spec/**`, `docs/conformance.md`

### Reader validity and producer obligations are distinct

Reader validity and producer obligations must remain distinct. Reader tolerance
does not relax producer obligations. A reader that accepts a missing field does
not mean a producer may omit it. Keep these two concerns in separate code paths
and documentation sections. A change that widens what a reader accepts must not
be interpreted as widening what a producer must emit.

Scope: `packages/spec/**`, `docs/conformance.md`

### Co-change ordering requires executable evidence

Canonical co-change producer ordering must be executable evidence before
documentation may claim it is enforced. Do not document an ordering as enforced
unless a test proves it. Do not add a producer ordering claim without a
corresponding test that fails when the ordering is violated.

Scope: `packages/spec/**`, `docs/**`

### No derived probability in observations

Observation-form co-change emission must not reintroduce derived probability
fields (such as `rate`) as a compatibility shortcut. Observations are raw
counts; derived metrics belong in the consumer, not in the standard's emitted
artifact. If a field carries a derived value, it belongs in the generated
surface, not in the observation surface.

Scope: `packages/spec/**`

### Negative fixtures must be single-defect

Negative fixtures must be single-defect. Each invalid example must violate
exactly one constraint. Repairs must mutate only the named field or path. A
fixture rejected for an unrelated defect proves nothing about the one it is
named for. Test machinery that validates negative fixtures must attribute the
rejection to the specific defect, not to a generic failure.

If you add a negative fixture that tests constraint X, the validator must
report that constraint X was violated. If it reports "schema invalid" without
naming X, the fixture is not proving what it claims to prove.

Scope: `packages/spec/examples/invalid/**`, `packages/spec/src/**/*test.ts`,
`scripts/validate-examples.mjs`, `scripts/check-producer-conformance.mjs`
