---
"@workspacejson/rules": minor
---

Deprecate the hygiene score, and stop it certifying scans that observed nothing,
per ADR-003 amendment A-002.

`computeHygieneScore([], 0)` returned `{ value: 100, grade: 'A' }`. No findings
meant no penalty; no penalty meant a full score; a full score meant an A. Nothing
in the function related the score to how much had been examined — `coverageRatio`
was computed and returned but never consulted by the scoring path. A scan that
looked at nothing certified a repository as flawless, and that value reached a
published artifact.

**The function now returns `HygieneScore | null`,** and `null` when the scan
observed nothing: no findings, and no file-count denominator to say anything was
examined. `null` is not a bad grade. It is the statement that there is no score
to give, and a reader has to decide what to do about that instead of inheriting
an `A`. Where evidence exists — any finding, or a known denominator — the
arithmetic is unchanged.

**`coverageRatio` is now `number | undefined`.** It was `0` whenever no total was
supplied, which is every current call site, so that zero was never a measurement
— it was the default parameter arriving unchanged. "Coverage was not measured"
and "coverage was zero" are different claims and no longer share a value.

**Both are source-level breaks for TypeScript readers, which is why this is a
minor.** Code assigning the result to a bare `HygieneScore`, or `coverageRatio`
to a bare `number`, stops compiling. That is the intended alarm: it is exactly
the code that would otherwise read absence as a pass. `AuditResult.score` is
`HygieneScore | null` for the same reason — a caller handed no evidence needs
somewhere truthful to put that, and the previous non-nullable field left
fabricating a perfect score as the only way to satisfy it.

**`computeHygieneScore`, `HygieneScore` and `AuditResult.score` are deprecated
and scheduled for removal at the next document-profile boundary.** A letter grade
is a judgement, and this standard is descriptive: it reports what a repository
*is*, not what a team must do about it. Scoring belongs to the consumer that
reads the descriptive fields.

Migrating needs nothing that is not already public — `Finding.state`,
`.severity`, `.confidence` and `.temporalWeight` are the only inputs the function
ever had:

```ts
const failures = findings.filter((f) => f.state === 'FAIL');
const critical = failures.filter((f) => f.severity === 'critical');
```

**Nothing is removed in this release and no schema bytes change.** Under ADR-003
§5 a normative-optional field earns a deprecation notice and a documented
migration now, with removal at the next declared breaking boundary; the document
profile is unchanged at `generated.specVersion: "0.4"`, so this release is not
that boundary. `generated.hygiene` remains declared in the schema, because a
first-party producer still emits it and removing the declaration while that is
true would describe the artifact incorrectly. Emission ceases first, on the
producer's own schedule, and the field and exports go together afterwards.
