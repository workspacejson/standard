# M2A Causal-Review Experiment Receipt

**Date:** 2026-08-21 (UTC). **Experiment:** META-362 / M2A Causal Review Proof.
**Preregistration:** [META-367](https://linear.app/marcelle-labs/issue/META-367).
**Disposition:** [META-372](https://linear.app/marcelle-labs/issue/META-372) — NARROW.

> This directory is an experiment receipt and evidence packet. It is not
> normative workspace.json specification semantics, conformance requirements,
> an adoption claim, or a claim that the observed effect generalizes beyond
> the registered scenarios.

## What was tested

Whether descriptive workspace.json co-change evidence, injected into an
existing AI review workflow's input, causally changes the reviewer's
investigation behavior.

## Review instrument

| | |
| -- | -- |
| Repository | `workspacejson/integrations` |
| Package | `@workspacejson/codex-mcp@0.1.9` |
| Git SHA | `3aa4531286ba8ebf8fa65bda3ac065fd66a86dab` |
| Function | `reviewDiff` (embeds evidence into diff text input) |
| Filesystem access | **None.** The reviewer can only reason about what is in the input. |

## Model and provider

| | |
| -- | -- |
| Provider | OpenRouter |
| Model | `openai/gpt-5.6-terra` |
| Endpoint | `https://openrouter.ai/api/v1/responses` |
| Reasoning effort | `high` |

## Scenarios

Three scenarios were preregistered in META-367 before any treatment output
was inspected:

| Scenario | Repository | Basis SHA | Changed file | Co-change partner | Support |
| -- | -- | -- | -- | -- | -- |
| A | `workspace-json/billfold` | `0ff147b0` | `src/routes/checkout.ts` | `src/webhooks/stripe.ts` | 6 |
| B | `workspacejson/integrations` | `3aa45312` | `src/services/workspace.ts` | `src/tools/workspace.ts` | 4 |
| C | `JamieMason/syncpack` | `958d3068` | `src/instance.rs` | `src/version_group.rs` | 17 |

Each scenario ran 3 arms (baseline, treatment, perturbation) x 3 runs = 9
runs per scenario, 27 accepted runs total.

## Results

### Causal scenarios: 1/3 PASS, 2/3 FAIL

| Scenario | Classification | Treatment partner mentions | Baseline partner mentions | Perturbation partner mentions |
| -- | -- | -- | -- | -- |
| A | **PASS** | 3/3 | 0/3 | 0/3 |
| B | **FAIL** | 0/3 | 0/3 | 0/3 |
| C | **FAIL** | 0/3 | 0/3 | 0/3 |

### Scenario A (PASS)

Treatment runs investigated `src/webhooks/stripe.ts` and identified the
idempotency-key separator compatibility risk in 3/3 runs. Baseline runs
(0/3) did not mention `stripe.ts`. Perturbation runs (evidence removed,
0/3) did not mention `stripe.ts`.

The underlying consequence was independently verified against repository
source: `src/webhooks/stripe.ts:7-8` parses the idempotency key by
splitting on `:` (`String.fromCharCode(58)`). Changing the separator to
`|` without updating `stripe.ts` would break the webhook parser.

**Important limitation:** The reviewer did not open `stripe.ts`. It has no
filesystem access (per META-366). One run explicitly reported the partner
file as a gap because it was not included in the diff. The causal chain
demonstrated is:

```
workspace.json evidence
        ↓
changes reviewer investigation target (surfaces specific file/risk)
        ↓
independent repository source inspection confirms consequence
```

Not:

```
workspace.json evidence
        ↓
reviewer autonomously inspects external file
        ↓
reviewer verifies material defect
```

### Scenario B (FAIL)

Treatment runs did not investigate `src/tools/workspace.ts` in 0/3 runs.
The reviewer focused on the diff's truncation behavior. The diff modified
a function that returns co-change partners, and the evidence provided
co-change partner data. This self-referential topic overlap is a
**hypothesis** for why the evidence was not acted upon. It was not
experimentally established as a boundary condition.

### Scenario C (FAIL)

Treatment runs did not investigate `src/version_group.rs` in 0/3 runs.
The reviewer focused on JSON Pointer escaping issues in the diff itself.
The diff contained a salient intrinsic issue that may have captured
reviewer attention. This attentional crowd-out is a **hypothesis** for
why the evidence was not acted upon. It was not experimentally
established as a boundary condition.

### Degraded-evidence controls: 4/4 PASS

| Condition | False-safe? | Uncertainty visible? |
| -- | -- | -- |
| Missing | No | Yes (3/3 runs) |
| Stale | No | Yes (2/3 runs) |
| Malformed | No | Yes (3/3 runs) |
| Refused | No | Yes (2/3 runs) |

Zero degraded cases converted missing/stale/malformed/refused evidence
into an affirmative safety conclusion. 12 runs total.

## What was demonstrated

1. In one controlled fixture (Scenario A), descriptive co-change evidence
   causally changed an AI reviewer's investigation set: 3/3 treatment runs
   investigated a historically related file versus 0/3 baseline and 0/3
   perturbation.
2. The effect did not replicate in the selected first-party (Scenario B)
   or unrelated external (Scenario C) scenarios.
3. Degraded-evidence semantics are sound: missing, stale, malformed, and
   refused evidence produced uncertainty rather than false-safe
   conclusions across all 12 runs.

## What was not demonstrated

1. The effect does not generalize across the three selected scenarios.
   No claim is made that co-change evidence reliably improves reviews.
2. The explanations for why Scenarios B and C failed (self-referential
   topic overlap, attentional crowd-out) are hypotheses arising from the
   observed failures, not experimentally established boundary conditions.
3. The reviewer did not independently inspect partner files. It has no
   filesystem access. The evidence changed what the reviewer surfaced
   for investigation; verification was done separately against repository
   source.
4. No general review-quality, safety, adoption, or conformance claim
   follows from this experiment.

## Preflight/rejected run

An earlier run (`preflight-rejected/`) was executed before the evidence
injection bug was discovered. In that run, the `reviewDiff` function did
not deliver the workspace intelligence text to the model. These artifacts
are preserved as a labeled rejected/preflight result and are not counted
in the accepted experiment.

## File inventory

See `MANIFEST.json` for a mechanical enumeration of every file in this
directory with SHA-256, size, and role. See `REDACTIONS.md` for the
redaction log.

## Related work

META-323 (file-centric co-change retrieval) found that the global top-N
leaderboard was hiding potentially consumer-relevant source relationships:
14-43 additional relationships in syncpack examples and 50 additional
relationships for the Polylith target. File-centric retrieval exposed
these without changing the mining evidence itself. This is a separate
result from the causal-review experiment but is strategically related.
