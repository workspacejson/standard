---
applyTo: "scripts/check-producer-conformance*.mjs,packages/spec/examples/**/*.json,packages/rules/src/testing/fixtures/**/*,docs/conformance.md,.github/workflows/ci.yml"
---

Conformance must measure behavior rather than infer it from process completion.

- Never skip or pass because a candidate, fixture, or dependency is missing.
- Include a baseline proving a valid candidate is accepted.
- For every red test, assert that the mutation changed the intended bytes.
- Require the failure to identify the targeted invariant. An unrelated failure is not evidence.
- Keep producer and consumer obligations separate.
- Preserve manual evidence verbatim and leave absent evidence absent.
- Compare material projections only. Timestamps such as `generatedAt` are not cross-producer agreement fields.
- Record exact observed counts and failures rather than only "pass" or "verified."

The producer candidate belongs to `workspacejson/cli`; do not copy producer source into this repository.

When changing the executable producer contract, run both:

```bash
WORKSPACEJSON_CLI_CANDIDATE=/path/to/built/cli/packages/cli pnpm run check:conformance
WORKSPACEJSON_CLI_CANDIDATE=/path/to/built/cli/packages/cli pnpm run check:conformance:test
```
