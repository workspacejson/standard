---
"@workspacejson/rules": patch
"@workspacejson/spec": patch
---

Widen the validator to accept an optional root `version`, per ADR-004.

`generated.specVersion` has always been the profile declaration, but at least one
external reader gates on a **root** `version` key instead. No producer has ever
emitted it, so that gate has never executed.

The root object is `additionalProperties: false`, which means repairing the
mismatch is not the additive change it appears to be: adding a root key is
additive to the schema as a document and breaking for every already-deployed
validator. Acceptance therefore has to ship before emission, and this release is
the acceptance half.

`validate()` and `validateV4()` now accept an optional root `version` of `"0.3"`
or `"0.4"`. When present it must equal `generated.specVersion` — a document whose
two declarations disagree is invalid, not resolved by precedence. No new profile
name is introduced and `generated.specVersion` is unchanged: still required,
still primary, still emitted. A reader that ignores the root key sees no
difference.

`validateLegacy()` is corrected as a consequence. It previously identified the
pre-v0.3 shape as "has a root `version` string and fails `validate()`", which
stops being sufficient once v0.3/v0.4 documents may carry that key: a disagreeing
document would have been reported as legacy v0.1/v0.2 rather than rejected. It
now keys on the absence of `generated.specVersion`, so a disagreement is rejected
by both functions.

**This release does not emit the field.** No producer writes a root `version`,
and ADR-004 §8 requires evidence that known validate-before-read consumers accept
it before any producer begins. Widening what a reader accepts is deliberately not
permission to start writing.
