---
"@workspacejson/rules": patch
"@workspacejson/spec": patch
---

Remove runtime dependencies that were declared but never imported.

`@workspacejson/rules` declared `dedent`, `ignore`, `unified` and `zod` in
`dependencies`. None of them is imported anywhere in the package. `zod` and
`unified` appeared only as string literals in the framework-detection tables —
the parser looks for the *word* "zod" in a manifest, it never loads the library.

Because these were `dependencies` rather than `devDependencies`, every consumer
installed all four to run code that does not exist. Removing them changes no
behavior: the full suite passes unchanged.

`@workspacejson/spec` drops the unused `json-schema-to-typescript`
devDependency along with `scripts/generate-types.js`, which read the schema file
and discarded it. `src/types.ts` is hand-written and committed; nothing was ever
generated. The build script is now `tsc`.

A new `unused-dependency` guard in `scripts/check-architecture.mjs` fails the
build if a declared runtime dependency is never imported, so this cannot
silently return.
