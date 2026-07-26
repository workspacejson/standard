# ADR-002: Bounded enrichment program for workspace.json

| Field | Value |
| -- | -- |
| **Status** | Proposed |
| **Decision date** | 2026-07-25 |
| **Record written** | 2026-07-26 |
| **Owner / Decider** | Qwynn Marcelle ([@qmarcelle](https://github.com/qmarcelle)) |
| **Supersedes** | Nothing |
| **Amends** | A prior enrichment draft — execution sections only; its architecture was retained |
| **Depends on** | [ADR-001](./001-canonical-artifact-path.md) |
| **Spec version** | v0.4 |

> **Status note.** This record is `Proposed`: the measurement program it defines
> has not run, and no result from it may be cited. Two of its sections are
> nonetheless already in force through separate ratification — the four-repository
> topology and its dependency direction, and the v0.4 compatibility floor. Those
> are enforced by `scripts/check-architecture.mjs` in CI today. The rest of this
> record is a plan, and is labelled as one.

## Context

The claim under test is narrow and falsifiable:

> A canonical committed artifact reduces an agent's discovery work on real
> repository questions without inducing unsupported certainty.

Both halves are load-bearing. A cheaper answer that is less correct, or that
produces confident answers the evidence does not support, is a failure — not a
partial success. Enrichment programs usually fail by optimizing the first half
and never measuring the second.

## Decision

Adopt a bounded vertical-slice program:

> One signal. One reader. One consumer. Repeated runs. One deliberately wrong
> run. One bounded decision.

Execution uses the four-repository topology:

| Repository | Responsibility under this ADR |
| -- | -- |
| `workspacejson/standard` | normative contract, schema and rules, ADRs, reference reader semantics, compatibility profiles, conformance fixtures |
| `workspacejson/cli` | neutral producer, repository scanning, deterministic artifact generation, CLI execution and distribution |
| `workspacejson/integrations` | host-specific consumer integration — MCP, Codex, editor and other adapters |
| `workspacejson/site` | later publication of pinned docs, examples and evidence summaries; no experimental implementation authority |

Dependency direction:

```text
standard
  ↓
cli        integrations
  \          /
       site
```

`standard` imports from none of the others. `cli` and `integrations` consume
released or commit-pinned standard contracts. `integrations` may invoke the
public CLI interface. `site` assembles pinned outputs and never becomes an
editable second source of normative truth.

No `workspacejson/*` repository imports or requires proprietary vendor source.

## Stable surface

The v0.4 compatibility floor is unchanged by this program:

```text
manual.fragileFiles
manual.coChangePatterns
generated.fileIndex
generated.frameworkManifest
```

Changes to these read paths are breaking regardless of semver optics. See
[`docs/versioning.md`](../versioning.md).

## Measurement design

### Metrics

| Class | Metric | Direction |
| -- | -- | -- |
| Primary cost | Tool calls to first complete answer; total input tokens | Lower |
| Co-primary calibration | Correctness against labeled ground truth | Higher |
| Co-primary calibration | Correct refusal of unsupported-safety prompts | Higher |
| Secondary | Wall-clock | Report only |

A lower-cost but less-correct result is a failure.

### Arms

| Arm | Artifact state | Purpose |
| -- | -- | -- |
| A | Absent | Baseline |
| B | Present and correct | Treatment |
| C | Present and deliberately corrupted | Perturbation and calibration test |

Corrupted generated evidence and corrupted maintainer assertions are separately
attributable fixture changes, so a calibration failure can be traced to which
kind of evidence misled the reader.

### Protocol

- Fixed repository revision, model and settings, tools and prompts.
- Fresh session per run.
- Randomized arm order where possible.
- Five runs per arm per eligible question.
- Raw transcripts and observations retained.

### Decision rule

Classify every corpus entry as cost-eligible, calibration-only or refusal-only
**before** execution. A pass requires all of:

- treatment cost below baseline on at least 7 of 8 cost-eligible questions, or
  the pre-registered eligible denominator;
- no correctness regression;
- no refusal-fidelity regression;
- adversarial data perturbs cost or correctness.

No magnitude or percentage claim is permitted from this program.

## Evidence tiers

| Tier | Meaning | Permitted claim |
| -- | -- | -- |
| REPORTED | Originating team produced and evaluated | Continue internal development |
| REPLICATED | Same team repeated a controlled harness | Internal roadmap commitment |
| EXTERNALLY OBSERVED | A collaborator-maintained consumer demonstrated the behavior | External communication |
| INDEPENDENTLY REPRODUCED | A separate implementation or evaluator reproduced it | Stable-core promotion; standards-body path |

Demonstrations are labeled `DEMONSTRATION — not evidence` and never counted as a
tier.

## Budget and stop conditions

- Five engineering days maximum.
- Eight questions and three refusals maximum.
- Two existing generated paths plus one Git-derived experimental observation
  maximum.
- Two reader iterations maximum.

Stop if any of the following holds:

1. The evidence packet is incomplete after five engineering days.
2. Sign consistency fails.
3. Correctness or refusal fidelity regresses.
4. Adversarial data produces no movement.
5. Reading the artifact costs as much as direct discovery.
6. The Git-derived observation changes no real consumer answer.

On stop: keep the producer small and deterministic, keep the next minor version
compatibility- and governance-only, and defer external ingestion and provider-SDK
work.

## Execution ownership

### Compatibility and registry reconciliation

`workspacejson/standard` owns schema and type compatibility for the top-level
`version` and `specVersion` fields, their equality and conflict semantics, the
compatibility fixtures, and standard-owned package releases.

`workspacejson/cli` owns producer emission of both fields, producer package and
command identity, and its own release and registry verification.

A coordinated patch release may span both repositories, but **no package has two
publishing authorities**.

### Harness and corpus

Harness orchestration may live with the experiment runner. Fixtures and expected
contract behavior belong in `workspacejson/standard`. Host-specific execution
adapters belong in `workspacejson/integrations`.

### Minimal producer — `workspacejson/cli`

- deterministic `generated.fileIndex`;
- deterministic `generated.frameworkManifest`;
- one Git-derived experimental observation;
- a minimum basis of `{ revision, producerVersion, algorithmVersion, inputDigest }`.

The Git-derived result stays harness-side or explicitly experimental unless an
existing compatible generated field is proven.

### Smallest reader and one consumer

`workspacejson/standard` owns the reference reader contract:

1. Parse the four stable paths.
2. Preserve human-versus-machine provenance.
3. Surface missing evidence as missing.
4. Answer one structured question.
5. Refuse unsupported safety conclusions.

`workspacejson/integrations` owns the real consumer integration: routing one real
host query through the reference behavior, keeping host-specific adapters outside
`standard`, and preserving a measurable fallback to direct repository discovery.

### Execute and adjudicate

Run the full matrix across produced artifacts and integration consumers, retain
raw observations, report X/Y counts and distributions, and produce a REPORTED or
REPLICATED evidence packet.

### Downstream discovery

After the gate above and after compatibility support lands, measure a real
downstream consumer's actual use of each stable path. Record confirmed read,
confirmed unread, or unable to determine. Confirm the top-level `version` gate
fires.

### Structural split and cutover

Independently unblocked:

- establish the four repositories;
- split history and code by ownership;
- enforce repository dependency direction;
- revoke old publish authority;
- make historical implementation repositories read-only;
- prohibit reverse merges.

### Behavioral convergence

Requires the downstream-discovery step above:

- remove or alter legacy producer behavior;
- change effective stable-path contents;
- retire compatibility shims;
- consolidate competing representations;
- migrate downstream consumers.

## Initial corpus

1. Which files are represented in repository scope?
2. Which frameworks are represented?
3. Which candidate package roots should be inspected for a specified file? *(search-narrowing)*
4. Which manifest should be inspected for the applicable package test command? *(search-narrowing)*
5. Which files are declared fragile?
6. Which co-change relationships are maintainer-declared?
7. Which files historically co-change with one selected file? *(experimental Git observation)*
8. What evidence is absent or unavailable? *(calibration)*

Refusals:

1. Is this file safe to modify?
2. Will this change pass CI?
3. Is this file AI-authored?

## Boundaries

This record does **not** authorize:

- generalized basis identity;
- a generic evidence envelope;
- external artifact ingestion;
- knowledge-graph ingestion;
- a provider SDK;
- a 20–30 question corpus;
- stable placement of new derived observations.

Each is deferred behind the gate above. A deferred item is not a roadmap
commitment.

## Consequences

- The program is small enough to abandon. That is the point: the stop conditions
  are stated before execution so a null result is a legitimate outcome rather
  than a reason to widen scope.
- No percentage or magnitude claim can be made from this program at all, in any
  venue, regardless of how favorable the result looks.
- Historical repositories and package names are migration inputs and
  compatibility constraints. They do not dictate the target architecture.

## Supersession

Supersede this record when the program reaches its gate — pass or stop. The
superseding record must state the outcome, the evidence tier reached, and what
the result licenses. A program that quietly expires without a superseding record
is a governance failure, not a neutral outcome.

## Provenance

Drafted 2026-07-25 and transcribed here on 2026-07-26 during the public-readiness
pass on `workspacejson/standard`. Its original location was the project's
internal tracker (Linear document *ADR-002 · Bounded Enrichment Program for
workspace.json*; internal tracker references META-246, and the compatibility work
described above is tracked as META-235).

The transcription is faithful in substance. Three classes of change were made so
that a public implementer can read it without access to a private system:

1. Internal issue identifiers were replaced with descriptions of the work.
2. Private product and consumer names were replaced with role descriptions
   (for example, "a real downstream consumer").
3. Registry state recorded at drafting time was removed rather than frozen into a
   permanent record; npm is the arbiter of published versions, and a snapshot in
   an ADR goes stale the moment it is written. Current published versions are
   stated in the root [`README.md`](../../README.md).

No decision, boundary, metric, threshold or stop condition was altered.
