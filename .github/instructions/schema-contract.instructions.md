---
applyTo: "packages/spec/schema/**/*.json,packages/spec/src/**/*.ts,packages/spec/examples/**/*.json"
---

`packages/spec/schema/v1.json` is the single normative schema. Never create or maintain another editable schema copy.

Before changing schema bytes, a stable read path, or a public package export:

1. Confirm there is a governing issue.
2. Confirm the required ADR exists in `docs/adr/` and is `Accepted`.
3. Describe compatibility consequences for current and legacy readers.
4. Add positive and negative fixtures that exercise the changed contract.

Do not weaken the schema merely to make an example or existing artifact validate.

Keep the schema, TypeScript types, validation behavior, exports, examples, and documentation aligned. Preserve legacy validation intentionally rather than accidentally accepting malformed current documents.

For optional evidence, absence means "not provided" or "not observed." It never proves safety.

Run:

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run check:schema
pnpm run check:examples
pnpm run release:verify-packs
```
