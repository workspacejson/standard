---
applyTo: "packages/rules/src/**/*.ts,packages/rules/src/**/*.json,packages/rules/src/**/*.md"
---

This package owns deterministic reference behavior, parsing, scanning, validation integration, and the rule engine. It does not own workspace.json generation orchestration.

Keep behavior deterministic for identical repository evidence. Do not introduce wall-clock, network, random, daemon, host-session, or user-machine dependence into material results.

When adding or changing a rule:

- Name the repository evidence the rule observes.
- Add a positive fixture and an absence or negative fixture.
- Perturb the referent and prove the result changes.
- Distinguish "not observed" from "observed and absent."
- Avoid composite judgments whose inputs, formula, or coverage cannot be explained.
- Preserve stable ordering for arrays and object keys where output is compared.

Do not add ambient declarations for standard-owned packages. Fix imports or package types instead.

Run the affected package tests, followed by:

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run check:architecture
```
