# ADR-006: Canonical path identity — stored keys are data, not commands

| Field | Value |
| -- | -- |
| **Status** | Proposed |
| **Decision date** | *not yet decided — this record is under review* |
| **Record written** | 2026-08-03 |
| **Author** | Qwynn Marcelle ([@qmarcelle](https://github.com/qmarcelle)) |
| **Decider** | Qwynn Marcelle |
| **Ratifying authority** | Qwynn Marcelle, sole steward ([OWNERSHIP.md](../../OWNERSHIP.md)) |
| **Canonical repository** | `workspacejson/standard` |
| **Canonical path** | `docs/adr/006-canonical-path-identity.md` |
| **Revision index** | [`index.json`](./index.json) — generated; see [README](./README.md#the-revision-index) |
| **Ratification issue** | META-278 (internal tracker) |
| **Evidence** | [`experiments/006-path-identity/`](./experiments/006-path-identity/) — harness, receipts, platform limitations |
| **Supersedes** | Nothing |
| **Superseded by** | Nothing |
| **Depends on** | [ADR-001](./001-canonical-artifact-path.md), [ADR-003](./003-field-lifecycle-and-admission.md) (Accepted) |
| **Spec version at decision** | v0.4 |

## Context

The schema calls path-bearing values "repo-root-relative POSIX paths" and stops
there. It does not say whether comparison is case-sensitive, what encoding a key
is in, whether `./a.ts` and `a.ts` are the same key, whether a symlink is
resolved before or after comparison, or what "repo-root-relative" means inside a
submodule or a linked worktree. The four-path conformance suite assumes these are
settled. They are not written down anywhere, so an independent implementer has to
guess, and two implementers guessing differently both conform.

They already have. Two consumers of this standard route both stored keys and host
queries through `node:path.normalize`, which collapses `..` lexically. Measured
against the shipped code:

| Stored key | Query | Result |
| -- | -- | -- |
| `a.ts` | `src/../a.ts` | **matches** |
| `a.ts` | `a/b/../../a.ts` | **matches** |

`src/../a.ts` does not name `a.ts` — not when `src` is a symlink, and not as a
statement about the repository. The reader answers a question it was not asked.
The same call is applied to *stored* keys, so an artifact containing the key
`src/../a.ts` is read as though it contained `a.ts`: the defect is repaired into
meaning and becomes unobservable downstream.

This record fixes the semantics for every path-bearing location in the artifact,
not for one field. Filing it against `generated.fileIndex` alone would produce a
rule half the artifact does not follow.

| Location | Shape |
| -- | -- |
| `generated.fileIndex` | object keys |
| `generated.coChange[].files` | 2-element array, set semantics |
| `generated.fragility[]` | per-entry path |
| `manual.fragileFiles[].path` | string |
| `manual.coChangePatterns[]` | item shape undefined; inherits these rules once ADR-003 A-005 defines it |

Any path-bearing field admitted later inherits these rules by default. A future
field does not silently opt out.

## Decision

### 1. Stored artifact paths are data, not commands

**A stored key is either canonical or invalid.** Readers never normalize, repair,
collapse, or reinterpret a malformed stored key. This was settled before this
record was drafted and is not reopened here; what follows is its specification.

The consequence that matters: `src/../a.ts` is an invalid stored key. It must
never become `a.ts`. An artifact carrying it is artifact-invalid, and the reader's
obligation is to say so, not to guess what was meant.

### 2. Two operations, deliberately separated

The single most damaging conflation in the current implementations is treating
"is this stored key well-formed?" and "what key does this host path correspond
to?" as one function. They have different inputs, different failure modes, and
different owners.

```
validateStoredKey(rawKey) -> valid | invalid(reason)
```

Total function of the key alone. No filesystem access. No repository access. No
repair. Its answer does not depend on any host.

```
canonicalizeHostQuery(root, inputPath) -> key | unsupported(reason)
```

Takes a proven repository root and a host path. May touch the filesystem. May
fail. Never invents a key that is not the tracked entry.

A validator that normalizes cannot report an invalid artifact, because after
normalization there is nothing left to report. A host-query canonicalizer that
refuses to touch the filesystem cannot prove containment. Both properties are
required; one function cannot have both.

### 3. Canonical stored-key grammar

A canonical key is a non-empty sequence of segments joined by a single `/`:

- segments are separated by exactly one `/`; no repeated separators
- no leading `/`, no leading `./`, no trailing `/`
- no segment is `.` or `..`
- no drive letter (`C:`), no UNC prefix (`\\`), no backslash anywhere
- no NUL (U+0000)
- the key is a sequence of Unicode scalar values (see §5)

**Control characters other than NUL are permitted.** An earlier draft of this
grammar forbade all of them; that was broader than the settled NUL rejection and
is narrowed here deliberately.

NUL is rejected because it cannot occur in a POSIX pathname at all — it
terminates the pathname — so a stored key containing one did not come from a
filesystem, and because NUL is the delimiter §5 requires for acquisition, a key
containing one would be unparseable by the mechanism that produced it.

Every other control character, including U+000A and U+0009, **is legal in a
POSIX filename and does occur.** Forbidding them would make real repositories
unrepresentable and would push producers toward exactly the silent omission §5
prohibits — an artifact that quietly lacks a file is worse than one that names it
awkwardly. Such names are hostile to line-oriented tooling, which is a reason to
acquire paths NUL-delimited rather than a reason to reject the file; identity and
ergonomics are different questions.

The rejection corpus, with what a normalizing reader would silently turn each
into — the second column is the behavior this record forbids:

| Stored key | A normalizing reader yields | Class |
| -- | -- | -- |
| `../x` | `../x` | escapes root |
| `src/../x` | **`x`** | **silently repaired** |
| `a/b/../b/c.ts` | **`a/b/c.ts`** | **silently repaired** |
| `/abs/posix/x.ts` | `/abs/posix/x.ts` | absolute |
| `C:\drive\x.ts` | drive path | absolute, non-POSIX |
| `\\unc\share\x.ts` | UNC | absolute, non-POSIX |
| `back\slash.ts` | unchanged on POSIX | separator |
| `./leading.ts` | **`leading.ts`** | **silently repaired** |
| `double//sep.ts` | **`double/sep.ts`** | **silently repaired** |
| `trailing/` | **`trailing`** | **silently repaired** |
| `` (empty) | `.` | empty |
| `.` | `.` | not a file |
| `..` | `..` | escapes root |
| `a\0b.ts` | unchanged | NUL |

Five of fourteen are repaired into a *valid-looking* key. Those are the cases
that make reject-don't-resolve necessary rather than merely tidy.

### 4. Case

**Stored-key comparison is exact and case-sensitive.** `A.ts` and `a.ts` are
different keys. This is a property of the artifact format, not of any filesystem,
and it does not vary by platform.

Host *query* behavior does vary, and the standard does not pretend otherwise. On
a case-insensitive filesystem a host path may name a file whose tracked entry
differs in case; `canonicalizeHostQuery` must return the **tracked** spelling,
because that is what the producer stored. Where the host cannot establish the
tracked spelling, the result is `unsupported`, not a case-folded guess.

**Observed.** On Linux/ext4, `A.ts` and `a.ts` are two tracked entries:

```
trackedEntries: ["A.ts", "a.ts"]
```

Exact case-sensitive comparison is therefore implementable, not merely desirable.
The darwin run could not answer this — the second write replaced the first and
Git recorded one entry — which is a property of APFS, not of the rule. Both runs
are recorded; see §11.

### 5. Unicode and encoding

**A stored key is a sequence of Unicode scalar values obtained by lossless UTF-8
decoding of the repository path's bytes.**

"Scalar value" is the operative term and is narrower than "code point". It
excludes surrogate code points U+D800–U+DFFF, which have no UTF-8 encoding.
Concretely, a key is invalid if:

- decoding its bytes as UTF-8 is not lossless — any byte sequence that does not
  round-trip;
- it contains an **unpaired surrogate**, which JavaScript strings can hold and
  JSON can carry as `\uD800` but which no valid UTF-8 byte sequence produces;
- a U+FFFD replacement character was **substituted** for undecodable input.

A U+FFFD that is genuinely present in the repository pathname is a legitimate
character and is not rejected. What is rejected is U+FFFD arriving as the
*result* of a failed decode — the distinguishing test is whether re-encoding the
key reproduces the original bytes. Substitution is silent identity mutation: two
distinct tracked paths can decode to the same key.

Comparison is exact over scalar values. **No normalization form is applied** —
NFC and NFD spellings are different keys, because normalizing at read time is the
same defect as collapsing `..` at read time.

Producers acquire paths from Git in **raw, NUL-delimited form** (`git ls-files
-z` or equivalent). This is not a style preference. Measured on darwin, the same
tracked file reported through the two forms:

```
git ls-files -z   ->  café.ts              (raw bytes: 63 61 66 c3 a9 2e 74 73)
git ls-files      ->  "caf\303\251.ts"     (quoted, octal-escaped, literal quotes)
```

A producer using the default form would store the key `"caf\303\251.ts"` —
including the quote characters — and no consumer would ever match it. **Display
quoting must never become artifact identity.**

**Unrepresentable paths.** A tracked pathname that is not valid UTF-8 cannot be
carried as a JSON string without lossy decoding, and lossy decoding is silent
identity mutation: distinct tracked paths can decode to the same key via U+FFFD.
The rule:

- a producer encountering a tracked path that cannot be represented as a valid
  Unicode string **fails with an explicit unsupported-path error**;
- it does **not** silently omit the path;
- it does **not** substitute U+FFFD or any other replacement.

**Observed.** On Linux/ext4 a non-UTF-8 tracked pathname was created and
measured. The decode is lossy and the original bytes are unrecoverable from the
JSON key:

```
raw bytes            626164ff2e7473        ("bad\xFF.ts")
decoded as UTF-8     bad<U+FFFD>.ts        code points: 62 61 64 fffd 2e 74 73
JSON round trip      {"bad<U+FFFD>.ts":{}}
re-encode == original bytes    false
```

The unpaired-surrogate case is confirmed on both platforms, since it needs no
filesystem:

```
lone U+D800    JSON encodes it as "\ud800"   re-encode -> efbfbd (U+FFFD)
               reEncodeIsLossless: false     isWellFormed(): false
```

Both are silent identity mutation, which is why §5 requires an explicit error
rather than substitution or omission. The darwin run could not create the
non-UTF-8 name; APFS enforces UTF-8. Both runs are recorded in §11.

### 6. Symlinks

**Stored identity is the tracked entry. It is never the target.**

Git tracks a symlink as an entry whose content is the link text; it does not
track a second path to the target. Measured:

```
tracked entries:  alias.ts  escape.ts  link  real/a.ts
link/a.ts is tracked:  false
```

`link` is a symlinked directory and `real/a.ts` is the real file. **`link/a.ts`
is not a tracked entry and therefore has no stored key of its own.**

That does not make it unanswerable. Resolving a host query through a symlink is
`canonicalizeHostQuery`'s job, and §2 grants that function the filesystem access
required to establish identity. What is forbidden is *repairing stored evidence*
— and no stored key is being repaired here, because the input is a host path, not
an artifact key. **Canonicalizing a host query into an existing tracked identity
is not the same operation as rewriting a malformed stored key, and this record
must not conflate them.**

**Traversal is permitted only against proof.** For a query that passes through a
symlink, all of the following must succeed:

1. resolve the target;
2. prove the resolved target is still within the repository root;
3. prove its exact tracked entry;
4. return **that tracked entry** as the key.

If any step fails — the target escapes the repository, is untracked, or the
identity is ambiguous — the result is `unsupported`. There is no fallback and no
nearest-match.

| Case | Behavior |
| -- | -- |
| Query names a tracked symlink entry (`alias.ts`) | key is `alias.ts` — the entry itself, never its target |
| Query traverses an internal symlink (`link/a.ts`) | key is `real/a.ts` **if and only if** all four proofs succeed; otherwise `unsupported` |
| Tracked symlink whose target escapes the repository (`escape.ts`) | key is `escape.ts`; the target is not followed |
| Query traverses a symlink whose target escapes, or is untracked | **`unsupported`** |
| `realpath()` differs from a lexical path that is *itself* tracked | the tracked entry wins — never rewrite a tracked alias to its target |

The last row is the load-bearing constraint. **A lexical alias is never replaced
by its target when the alias is itself tracked**, because then two tracked
entries would collapse to one key and the artifact could no longer distinguish
them. Resolution applies only where the lexical path has no tracked entry of its
own and therefore no identity to preserve.

Confirmed in the run: for `link/a.ts`, lexical and `realpath()` disagree, and the
escaping symlink's `realpath()` leaves the repository entirely. Both are exactly
the conditions the proofs above test.

### 7. Repository roots

**A linked worktree is its own artifact root. A submodule is its own artifact
root.** Measured:

- a linked worktree reports a different `--show-toplevel` from its main
  worktree while sharing `--git-common-dir`;
- a host repository tracks `.gitmodules`, `h.ts`, and `vendor` — **not**
  `vendor/s.ts`. The submodule's files are not entries in the host's index.

Therefore a key resolved against the host root can never name a file inside a
submodule, and a reader that walked upward from inside a submodule and selected
the host's artifact would resolve every key against the wrong root.

**No ancestor artifact discovery.** A reader does not walk upward past a
repository boundary to find an artifact. This is consistent with
[ADR-001](./001-canonical-artifact-path.md): the artifact belongs to the
repository it sits in, and a query originating inside repository R is answered by
R's artifact or by nothing.

### 7a. Host-query profile is scoped to POSIX

**The host-query profile this record accepts covers POSIX hosts only. Windows
host-query canonicalization is not yet specified.**

This is a deliberate scoping, not an oversight. No Windows fixture has been run,
and §11 records that. The alternative — writing a Windows rule from reasoning
about drive letters, UNC paths, `\\?\` prefixes, reserved device names and
case-insensitive-but-case-preserving semantics, with no measurement — would be
exactly the guessing this record exists to stop.

What this scoping does and does not mean:

- The **stored-key grammar (§3) is universal.** It forbids drive letters, UNC
  prefixes and backslashes on every platform. A Windows producer emits the same
  canonical keys as a POSIX one, because the key describes the repository, not
  the host.
- **Reading an artifact on Windows is unaffected.** `validateStoredKey` touches
  no filesystem and behaves identically everywhere.
- What is unspecified is `canonicalizeHostQuery` on Windows: how a native path
  becomes a key, and how containment is proven against a Windows root.
- A Windows integration must therefore either implement that mapping as a
  documented extension and say so, or return `unsupported`. It must not invent
  one and present it as conformance.

A later ADR — or an amendment to this one, per ADR-003 §11 — specifies Windows
once fixtures exist. Ratifying a POSIX-scoped profile now does not prejudge it.

### 8. Matching

**Exact string equality over canonical keys.** No prefix matching, no suffix
matching, no case folding, no normalization, no fuzzy fallback.

The existing absolute-query suffix fallback is a `canonicalizeHostQuery` concern,
not a matching concern: an absolute host path is canonicalized against a proven
root first, and then compared exactly. If containment cannot be proven, the
result is `unsupported` — not a suffix match.

### 9. Compatibility

Artifacts already published may contain non-canonical keys, and this record does
not retroactively invalidate the files people already have.

The sequencing is explicit, because "tolerant" is the word most likely to be
read as permission to repair.

**In the current v0.4.x line.** A reader encountering a malformed stored key has
exactly two obligations, and they are both required:

1. **Report it.** The key is surfaced as malformed — through validation output,
   a diagnostic, or whatever channel the integration owns per §10.
2. **Decline to match it.** The key participates in no lookup. It matches
   nothing, including the value it would have become under normalization.

A reader **never repairs** a malformed key — not in v0.4.x, not in tolerant
mode, not ever. Tolerance governs whether the reader *continues*, not whether it
*rewrites*. A v0.4.x reader may keep operating over the artifact's well-formed
remainder; it may not turn `src/../a.ts` into `a.ts` at any point.

**Producers** emit canonical keys only, starting from the version that
implements this record. This is not tolerant: a producer that cannot emit a
canonical key fails per §5 rather than emitting a malformed one.

**In v0.5.** Two changes belong to the declared compatibility transition and to
neither this record nor the v0.4.x line:

- the **narrowing validation change** — packaged validation rejecting artifacts
  that carry malformed keys, where v0.4.x validation reported them;
- the **hard-failure boundary** — readers failing the read outright rather than
  continuing over the well-formed remainder.

Both are breaking, both are announced through the v0.5 compatibility transition,
and both are sequenced under ADR-003 §5, which distinguishes relaxing a
constraint from ceasing to emit from removing. Landing either inside v0.4.x
would break consumers of already-published artifacts without a declared
boundary.

No behavior in this section is implemented before this record is Accepted.

### 10. Ownership

| Operation | Owner |
| -- | -- |
| Stored-key grammar | standard |
| Stored-key validation | standard |
| Artifact validity | standard |
| Host root selection | integration or host |
| Host containment proof | integration, using standard semantics |
| Canonical key comparison | standard semantics |
| Error presentation | integration |
| Key production | CLI |

The division is deliberate: an integration owns *where the user is* and *how a
failure is shown*, and owns neither *what a key means* nor *whether an artifact
is valid*.

### 11. What the evidence does not cover

Recorded as open rather than assumed, per ADR-003 §3's rule that a criterion with
no runnable procedure is *not currently determinable*.

Two platforms have been run. Receipts are committed as `receipts-darwin.json`
and `receipts-linux.json`; the Linux run is reproducible from
[`.github/workflows/adr-006-evidence.yml`](../../.github/workflows/adr-006-evidence.yml).

| Question | darwin 25.1.0 (APFS) | linux 6.17 (ext4), git 2.54.0 |
| -- | -- | -- |
| Case-distinct tracked entries | not answerable — case-insensitive | **answered** — `["A.ts", "a.ts"]`, two entries |
| NFC vs NFD as distinct entries | not answerable — collapsed to one | **answered** — two entries; `63 61 66 65 301 …` vs `63 61 66 e9 …` |
| Non-UTF-8 tracked pathname | not answerable — platform refused | **answered** — lossy decode, `re-encode == original: false` |
| Display quoting | **answered** — default `ls-files` quotes | **answered** — quotes both spellings |
| Symlinks, roots, malformed keys | **answered** | **answered**, same results |

The rules in §4 and §5 are therefore stated from observation, not from reasoning
about a failure mode. The earlier draft of this record could not say that.

**Still open: Windows.** Resolved by scoping rather than by measurement — §7a
scopes the accepted host-query profile to POSIX and states that Windows
canonicalization is not yet specified. The stored-key grammar remains universal.
Windows host-query fixtures are owed before any Windows host profile is
accepted; they are not owed before this record is.

## Boundaries

This record does **not** cover:

- **The `manual.coChangePatterns` item schema.** ADR-003 A-005 ratified *keep and
  specify*; the item shape is a separate decision. This record governs the
  identity of whatever paths that shape carries.
- **Artifact discovery.** Which file is the artifact is
  [ADR-001](./001-canonical-artifact-path.md). This record governs the keys
  inside it and says only that discovery does not cross a repository boundary
  upward.
- **Whether a path *should* be in the artifact.** Membership is a producer-profile
  obligation. This record governs the spelling of a path that is present.
- **Error message text.** §10 assigns presentation to integrations. The standard
  owns the classification, not the wording.
- **Performance.** Exact equality over a set is not slower than what is currently
  done; no claim beyond that is made.

## Consequences

Some currently accepted artifacts become invalid. That is the point: they were
being read by guessing. The tolerant v0.4.x reading mode in §9 keeps the
transition from being a cliff.

Some host queries that currently return an answer will return `unsupported` —
notably queries traversing a symlinked directory. A consumer that previously got
a confident wrong answer now gets an honest refusal, which is a regression in
apparent capability and an improvement in correctness.

Two consumer implementations must converge. They have already diverged while
being copies of each other, which is evidence that "keep it in sync by hand" is
not a mechanism.

## Supersession

Replace this record if the artifact format stops using JSON object keys for
paths, which would remove the Unicode-representability constraint in §5. Replace
it also if the standard adopts a path encoding that is not a Unicode string —
for example a byte-array form — which would make §5's unsupported-path error
unnecessary rather than merely rare.

Any replacement must state what happens to artifacts published under this
record's grammar, and whether §9's tolerant reading mode carries forward.

## Provenance

Written 2026-08-03 in `workspacejson/standard`, against the ratification issue
named in the metadata table.

Every empirical claim comes from
[`experiments/006-path-identity/run.mjs`](./experiments/006-path-identity/run.mjs),
whose raw output is committed alongside it as **`receipts-darwin.json` and
`receipts-linux.json`**. Both are load-bearing: the darwin run answers the
symlink, repository-root, malformed-key and display-quoting questions, and the
Linux run answers case distinction, NFC/NFD distinction and non-UTF-8 decoding,
which APFS cannot express. Neither alone supports §4 and §5. The Linux run is
reproducible from
[`.github/workflows/adr-006-evidence.yml`](../../.github/workflows/adr-006-evidence.yml).
The harness
builds throwaway Git repositories and records what Git, Node and JSON do; it
asserts nothing and gates nothing.

The consumer behavior in Context was reproduced by executing the shipped
consumers read-only and recording their output. It is cited here rather than
imported: the harness reproduces the *cause* (`node:path.normalize`) and the ADR
cites the consumers by location, because importing across repository boundaries
is forbidden by the architecture guard and would make this record's evidence
unrunnable outside a full multi-repository checkout.

The reject-don't-resolve principle in §1 was settled before drafting and is
recorded here rather than decided here.
