---
"@workspacejson/spec": minor
---

Add the standard-owned canonical path-identity surface, per ADR-006: stored keys
are data, not commands.

Seven new exports, in two halves.

**The grammar — `validateStoredKey(rawKey)`.** Decides whether one stored key is
canonical.

```ts
validateStoredKey('src/a.ts');    // { valid: true,  key: 'src/a.ts' }
validateStoredKey('src/../a.ts'); // { valid: false, reason: 'dotdot-segment' }
```

Pure, total, filesystem-free, deterministic, and applied to the original string
**before any path library sees it**. That ordering is the defect the record was
written about: the shipped consumers at the pinned revisions normalized first and
validated second, so `src/../a.ts` was already `a.ts` by the time anything asked
whether it was well-formed.

**There is deliberately no repaired-key field.** A valid result carries the input
unchanged; a rejection carries a reason and nothing a caller could mistake for a
usable key. A malformed key matches nothing — including the value normalization
would have produced. Reason precedence is fixed and documented so that two
implementations classify the same key identically: cannot-be-a-string, then
cannot-be-POSIX, then merely non-canonical.

Case and Unicode form are significant. `A.ts` and `a.ts` are two keys, and so are
the NFC and NFD spellings of `café.ts`. A genuine U+FFFD is a valid pathname
character; telling it from a substituted one needs the original bytes and belongs
to acquisition.

**The document walk — `inspectStoredKeys(document)`.** Reports every malformed
key on every ratified path-bearing surface: `generated.fileIndex` keys,
`generated.coChange[].files`, `generated.fragility[].file`, and
`manual.fragileFiles[].path`.

```ts
if (!validate(raw)) {
  // Existing invalid-document handling.
} else {
  for (const finding of inspectStoredKeys(raw)) {
    console.warn(`${finding.pointer}: ${finding.rawKey} — ${finding.reason}`);
  }
}
```

This is ADR-006 §9 obligation 1, *report it*. Obligation 2, *decline to match
it*, stays with the caller, because only the caller knows what a lookup is.

**The input is a schema-validated document, not `unknown`.** That narrowing is
what makes an empty result mean something: `[]` says every inspected value in an
accepted document is well-formed, and an unvalidated value is outside the
declared input domain rather than silently "clean". `inspectStoredKeys` does not
call `validate()` internally and is not a second document validator — folding the
two together would destroy exactly that distinction.

Findings are location-bearing records: one per occurrence, never deduplicated,
never normalized, never repaired. `rawKey` is the string the producer actually
wrote. Pointers are RFC 6901 with `~` escaped before `/`, so a pointer decodes
back to the exact stored key. Order is traversal order and is explicitly not part
of the contract.

`manual.coChangePatterns` is **not** inspected. ADR-003 amendment A-005 has not
ratified its item shape — the schema constrains items to `{"type": "object"}` and
nothing more, while `types.ts` assumes `files: string[]`. Walking that field
would promote an authoring-time TypeScript assumption into a normative contract
ahead of the record that decides it. The surface is added once A-005 settles it.

`canonicalizeHostQuery` is deliberately absent and must not be added to this
package: it needs a filesystem and a proven repository root, and ADR-006 §10
assigns it to integrations and hosts.

**Nothing narrows.** `validate()`, `validateV4()` and `validateLegacy()` are
unchanged, and `validate()` does not consult the stored-key grammar. Artifacts
carrying malformed keys on any path-bearing surface are still accepted, because
ADR-006 §9 requires a v0.4.x reader to report a malformed key and decline to
match it while continuing over the well-formed remainder. A dedicated suite fails
if a future change wires the two together — that is the intended alarm. Rejecting
such a document is a v0.5 document-profile change and is not authorized here.
No schema bytes changed.

**Why `minor`.** These are additive public exports: nothing is removed, nothing
is renamed, no accepted type or value range narrows, and no existing signature
changes. Under `docs/versioning.md` removing a public export is breaking and
adding one is not, so this is a minor on its own terms.

**On the version number this produces.** A `minor` takes both packages from
`0.4.4` to **`0.5.0`**, with `@workspacejson/rules` coming along unchanged because
the two are a fixed release group. This changeset does not move that number on its
own — the pending ADR-003 A-009 changeset already declares a `minor`, so `0.5.0`
is the next release with or without this one.

That number is the **package** version and says nothing about the document
profile. **The document profile is unchanged: this release still reads and writes
`generated.specVersion: "0.4"`.** Package `0.5.0` is not spec v0.5, no artifact's
`specVersion` moves, no new profile identifier is minted, and the deferred v0.5
profile work — narrowing validation and the hard-failure boundary — is untouched.
The two numbers are independent by policy; see `docs/versioning.md`.
