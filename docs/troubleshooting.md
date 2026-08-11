# Troubleshooting

Failure modes that come up repeatedly, with the actual cause rather than a
workaround. Each entry states why the behavior exists, because most of these are
deliberate and "fixing" them locally will break something else.

## Working in this repository

### `pnpm -r typecheck` fails on a clean checkout

**Symptom.** Typechecking fails with unresolved types for `@workspacejson/spec`
when you have not built anything yet.

**Cause.** `@workspacejson/rules` typechecks against `@workspacejson/spec`'s
**emitted declarations**, which `tsc --noEmit` never produces. The dependency is
real, not an ordering quirk.

**Fix.** Build before typechecking:

```bash
pnpm -r build
pnpm -r typecheck
```

CI does this in the same order, deliberately. The root `typecheck` script also
builds the spec package first for this reason.

Historically this ordering was hidden by a hand-written ambient
`declare module '@workspacejson/spec'` that shadowed the real package types with
a stale contract. Removing that stub made the real dependency visible. Do not
reintroduce it — see the next entry.

### A type resolves to something that does not match the package

**Cause.** An ambient `declare module` in `types/ambient.d.ts` shadows a
package's real types across the **entire workspace**, silently and with no
warning. If a declaration for a standard-owned package exists there, it wins over
the published types.

**Fix.** Fix the import instead. The architecture guard fails the build if an
ambient `declare module` for `@workspacejson/spec` or `@workspacejson/rules`
appears in any `.d.ts` file.

Four ambient shims are retained deliberately, for `simple-git`, `remark`, `ajv`
and `ajv/dist/2020.js`. Those are real CJS/ESM interoperability mismatches in
third-party packages, tracked as their own work. They are not a pattern to copy.

### `pnpm run check:examples` says `dist/index.js` is missing

**Cause.** The gate validates examples using the package's own compiled
validator, not a re-implementation. It needs a build.

**Fix.**

```bash
pnpm --filter @workspacejson/spec build
pnpm run check:examples
```

### `pnpm run check:architecture` fails after I added a file

The guard prints the violation class, the file and the reason. The common ones:

| Class | Meaning |
| -- | -- |
| `clean-room` | The file references proprietary scope or a private sidecar |
| `dependency-direction` | Something here imports from `cli` or `integrations`; this repository depends on none of the other three |
| `copied-schema` | A second schema copy appeared; exactly one canonical copy may exist |
| `duplicate-contract` | An ambient `declare module` shadows a standard-owned package |
| `publish-authority` | A workflow gained a publish step or a credential reference |
| `prescriptive-policy` | The schema gained a field encoding what a team must do |
| `stable-read-path` | One of the four stable paths is missing from the schema |

Markdown is not scanned. Documentation must be able to *name* a prohibited thing
in order to prohibit it, so the guard applies to source and configuration only.
Comments are stripped before matching, so a comment explaining that there is
deliberately no publish step is not itself read as one.

### CI fails as soon as I add a release workflow

That is the intended behavior, not a bug.

This repository is deliberately incapable of publishing. Both packages are
published from the historical repository that holds the only credential. The
guard fails the build if any workflow contains `changeset publish`, `npm publish`
or `pnpm publish`, or references a publish credential.

Transferring authority is a coordinated change that must revoke the old authority
in the same act, and it updates the guards and their red tests deliberately
rather than deleting them. See
[`.github/RELEASE-AUTHORITY.md`](../.github/RELEASE-AUTHORITY.md).

### Why does `@workspacejson/rules` depend on `@workspacejson/spec` with `workspace:*`?

Both packages live in **this one** pnpm workspace, and `pnpm pack` rewrites the
protocol to an exact version before publication. It is an intra-repository link,
not a cross-repository dependency.

`scripts/verify-package-tarball.mjs` proves no `workspace:` protocol ever reaches
a packed manifest. Run it with `pnpm run release:verify-packs`.

### `import('@workspacejson/rules/testing')` throws about internal state

**Symptom.** Something like *failed to access its internal state* when importing
the `./testing` entry point outside a test run.

**Cause.** That entry point re-exports vitest helpers. Vitest throws when
evaluated outside a vitest process.

**Fix.** Import it only from inside a vitest run. CI verifies this export by
**resolution** rather than evaluation for exactly this reason; its runtime
behavior is covered by the package's own vitest suite.

## Using the packages

### `npx workspacejson-spec --help` exits non-zero

There is no `--help` flag. The binary has exactly one command:

```bash
npx workspacejson-spec validate path/to/workspace.json
```

Any other invocation prints usage and exits non-zero. CI asserts both paths
explicitly rather than assuming a conventional `--help` exists.

### `npx @workspacejson/spec validate <file>` — why does that resolve?

npm selects the package's sole `workspacejson-spec` binary when the package has
exactly one. The generic `spec` bin alias is deliberately **not** reserved. If a
second binary is ever added, that fallback stops working and must be
re-evaluated as part of the change.

### Validation fails and I do not know which rule

`validate()` returns a boolean. To see why a document was rejected, check which
profile you actually have:

```ts
import { validate, validateV4, validateLegacy } from '@workspacejson/spec';

validate(doc);        // v0.3 or v0.4
validateV4(doc);      // v0.4 only
validateLegacy(doc);  // legacy v0.1/v0.2
```

If `validateLegacy(doc)` is the only one that passes, the document predates the
four-section shape. See [`docs/versioning.md`](./versioning.md).

### My v0.4 fields are missing after reading a valid document

`validate()` accepts both v0.3 and v0.4, because v0.4 is a strict superset. A
v0.3 document has no `generated.coChange` or `generated.fragility`.

Check `validateV4(doc)` or `generated.specVersion === "0.4"` before reading
v0.4-only fields.

### `coChange` is full of lockfile pairs

Filter on `generated === true` to skip tooling-coupled pairs and surface real
source couplings. Where the flag is present, do not apply path heuristics at read
time — the flag exists so you do not have to.

**The flag may be absent, and absent is not `false`.** It is a classification
rather than an observation, and a producer that implements no deterministic
classifier omits it instead of guessing. So there are three states — `true`,
`false`, and absent-meaning-unclassified — and

```js
if (!entry.generated) { /* treat as a real source coupling */ }
```

is wrong: it reads an unclassified entry as a confirmed source coupling. Branch
on the third state explicitly:

```js
for (const entry of doc.generated.coChange ?? []) {
  if (entry.generated === true) continue;            // classified tooling-coupled
  if (entry.generated === undefined) { /* unclassified — say so, do not assume */ }
  // …otherwise classified as a real source coupling
}
```

If every entry in an artifact omits the flag, its producer classified nothing.
That is a gap in what you can report, not a finding that the pairs are all real
source couplings.

Similarly, filter `generated.fragility` on `excluded: false` before ranking;
excluded entries are generated or lock files carrying `fragilityScore: 0`.

### The document reports nothing for a section — does that mean the answer is no?

No. **Absent evidence is not evidence of absence.** A missing or empty section
means the producer did not observe it. A consumer reporting "no fragile files"
from an absent `manual.fragileFiles` is reporting a producer gap as a repository
fact.

### The artifact does not exist at all

This repository defines the format; it does not generate the file. Producing
`.agents/workspace.json` belongs to `workspacejson/cli`. See
[`SUPPORT.md`](../SUPPORT.md) for which repository handles what.

### Node version errors

Both packages declare `node >=20`. CI tests Node 20 and 22. Older runtimes are
not supported.

## Still stuck

[`SUPPORT.md`](../SUPPORT.md) lists where to ask, what to include, and what
response to expect. For a security issue, use [`SECURITY.md`](../SECURITY.md)
instead of a public issue.
