---
applyTo: "scripts/**/*.mjs,types/**/*.d.ts,tsconfig*.json,packages/*/tsconfig*.json"
---

These files are the repository's enforcement surface. A defect here does not fail loudly; it makes a broken invariant look enforced.

## Guards

`check-architecture`, `check-docs`, `check-schema`, `check-examples` and the conformance gates encode properties that are otherwise only asserted in prose. They run before build and tests in CI.

- A guard must be able to fail. Before trusting a new or widened check, introduce the violation it targets and observe it go red, then remove the violation. A green guard with no evidence it can go red converts an unchecked property into a false assurance.
- Assert that the mutation changed the intended bytes. An unrelated failure is not evidence the guard works.
- Report exact counts and the file, line and reason for each failure. "Verified" without a count is not a result.
- Do not weaken a guard, widen an exemption list, or add a skip to make an unrelated change pass. Fix the violation or record why the exemption is correct.
- A guard that silently passes when its input is missing is worse than no guard. Fail instead.
- `check-architecture.mjs` and its test are self-exempt by design. Keep it that way — the file names forbidden patterns in order to forbid them.

## Ambient declarations

`types/ambient.d.ts` shadows real package types for the entire workspace. A declaration added here wins over the package's own types, silently, everywhere.

- Do not add a declaration for a standard-owned package. `check-architecture.mjs` rejects reintroducing `@workspacejson/spec`.
- Do not add a declaration to silence an import error. Fix the import style or the package's type dependency.
- Each existing shim records the concrete compile errors that justify it. Any addition must do the same, or it cannot be reviewed.

## TypeScript configuration

`@workspacejson/rules` consumes emitted declarations from `@workspacejson/spec`, so a recursive typecheck requires a prior build. Preserve that ordering in scripts and CI.

Run:

```bash
pnpm run check:architecture
pnpm run check:architecture:test
pnpm run check:docs
pnpm -r build && pnpm -r typecheck && pnpm -r test
```
