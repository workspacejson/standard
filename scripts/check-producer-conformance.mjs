#!/usr/bin/env node
// Executable four-path producer conformance contract.
//
// This repository owns the neutral standard. This suite is the standard's
// assertion about what any conforming producer must do; `workspacejson/cli` is
// the implementation currently measured against it.
//
//   WORKSPACEJSON_CLI_CANDIDATE=/path/to/cli/packages/cli \
//     node scripts/check-producer-conformance.mjs
//
// WHAT THIS ASSERTS ABOUT fileIndex — and deliberately does not:
//
//   `generated.fileIndex` must be POPULATED FROM REPOSITORY EVIDENCE: real
//   keys, in the documented key format, deterministically ordered.
//
//   It asserts NOTHING about per-file values. `FileIndexEntry` declares every
//   value field optional, so `{}` is conformant. Those values are behavioral,
//   their only source is git-derived, and whether that may enter the stable
//   contract is an open determination made outside this repository. Requiring
//   them here would pre-empt a ruling this repository does not own and would
//   fail a producer that is behaving correctly.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveCandidate, makeFixture, cleanup, readArtifact, readArtifactRaw,
  runDirect, runMediated, createReporter, listFiles, ARTIFACT, repoRoot,
} from './producer-conformance-lib.mjs';

const { check, section, state } = createReporter();
const candidate = resolveCandidate();

// The standard's own validator is the reference implementation. Re-implementing
// it here would create a second source of truth, and they drift.
const { validate, validateV4 } = await import(
  join(repoRoot, 'packages/spec/dist/index.js')
).catch(() => {
  console.error('\n@workspacejson/spec is not built. Run `pnpm --filter @workspacejson/spec build` first.\n');
  process.exit(2);
});

console.log(`candidate: ${candidate.manifest.name}@${candidate.manifest.version}`);
console.log(`           ${candidate.dir}`);

// ---------------------------------------------------------------------------
section('1. generated.fileIndex — populated from repository evidence');
// ---------------------------------------------------------------------------
{
  const repo = makeFixture();
  const run = runDirect(candidate, repo);
  check('generate exits 0 on a clean repository', run.status === 0,
    `status=${run.status}\n${run.stderr?.slice(0, 300) ?? ''}`);

  const doc = readArtifact(repo);
  const fileIndex = doc.generated?.fileIndex ?? {};
  const keys = Object.keys(fileIndex);
  const onDisk = listFiles(repo);

  check('fileIndex is non-empty — not an unpopulated stub', keys.length > 0,
    `keys=${keys.length}`);
  check('every key is repository-root-relative POSIX (spec fileIndex contract)',
    keys.every((k) => !k.startsWith('/') && !k.startsWith('./') && !k.includes('\\') && !k.includes('..') && !/^[A-Za-z]:/.test(k)),
    `offenders=${JSON.stringify(keys.filter((k) => k.startsWith('/') || k.startsWith('./') || k.includes('\\')).slice(0, 3))}`);
  check('every key names a file that actually exists in the repository',
    keys.every((k) => existsSync(join(repo, k))),
    `missing=${JSON.stringify(keys.filter((k) => !existsSync(join(repo, k))).slice(0, 3))}`);
  check('the repository\'s real files are represented',
    onDisk.every((f) => keys.includes(f)),
    `absent=${JSON.stringify(onDisk.filter((f) => !keys.includes(f)).slice(0, 5))}`);
  check('keys are deterministically ordered (sorted, not filesystem order)',
    JSON.stringify(keys) === JSON.stringify([...keys].sort()));

  // Explicitly recorded as out of scope, so a future reader does not mistake
  // its absence for an oversight.
  const allEmpty = keys.every((k) => Object.keys(fileIndex[k]).length === 0);
  console.log(`  NOTE  per-file values are NOT asserted (out of scope). Observed: ${allEmpty ? 'all entries empty — conformant' : 'some entries carry values — also conformant'}`);

  cleanup(repo);
}

// ---------------------------------------------------------------------------
section('2. generated.frameworkManifest — populated from repository evidence');
// ---------------------------------------------------------------------------
{
  const repo = makeFixture();
  runDirect(candidate, repo);
  const doc = readArtifact(repo);
  const manifest = doc.generated?.frameworkManifest ?? [];
  const names = manifest.map((e) => e.name.toLowerCase());

  check('a framework corroborated by a declared dependency is published',
    names.includes('express'), `manifest=${JSON.stringify(manifest)}`);
  check('published entries meet the documented confidence floor (>= 0.7)',
    manifest.every((e) => typeof e.confidence === 'number' && e.confidence >= 0.7),
    `entries=${JSON.stringify(manifest)}`);
  check('an AGENTS.md token corroborated by nothing is NOT published at that floor',
    !names.includes('svelte'),
    'an uncorroborated guess at high confidence is worse than an omission — confidence tells the consumer to trust it');
  check('entries are deterministically ordered',
    JSON.stringify(manifest.map((e) => e.name)) === JSON.stringify([...manifest.map((e) => e.name)].sort()));

  cleanup(repo);
}

// ---------------------------------------------------------------------------
section('3. manual.* — preserved verbatim, never fabricated');
// ---------------------------------------------------------------------------
{
  const manual = {
    fragileFiles: [{ path: 'src/routes.js', reason: 'human-authored, must survive regeneration' }],
    coChangePatterns: [{ files: ['src/index.js', 'src/routes.js'], note: 'human-authored' }],
  };
  const repo = makeFixture({ manual });
  const before = readArtifact(repo).manual;
  const run = runDirect(candidate, repo);
  check('generate exits 0 over an existing artifact', run.status === 0, `status=${run.status}`);

  const after = readArtifact(repo).manual;
  check('manual.fragileFiles preserved verbatim across regeneration',
    JSON.stringify(after.fragileFiles) === JSON.stringify(before.fragileFiles),
    `before=${JSON.stringify(before.fragileFiles)}\n          after=${JSON.stringify(after.fragileFiles)}`);
  check('manual.coChangePatterns preserved verbatim across regeneration',
    JSON.stringify(after.coChangePatterns) === JSON.stringify(before.coChangePatterns),
    `before=${JSON.stringify(before.coChangePatterns)}\n          after=${JSON.stringify(after.coChangePatterns)}`);
  cleanup(repo);

  // Safe absence: a producer must not invent human evidence where none exists.
  // The boundary is explicit — do not require non-empty human-owned fields.
  const bare = makeFixture();
  runDirect(candidate, bare);
  const bareManual = readArtifact(bare).manual ?? {};
  check('absent manual evidence is left absent, never fabricated',
    (bareManual.fragileFiles === undefined || bareManual.fragileFiles.length === 0)
    && (bareManual.coChangePatterns === undefined || bareManual.coChangePatterns.length === 0),
    `manual=${JSON.stringify(bareManual)}`);
  cleanup(bare);
}

// ---------------------------------------------------------------------------
section('4. Invalid artifacts fail safely without destroying human evidence');
// ---------------------------------------------------------------------------
{
  // (a) unparseable JSON
  const broken = makeFixture({ existingArtifact: '{ this is not json' });
  const original = readArtifactRaw(broken);
  const run = runDirect(candidate, broken);
  check('unparseable artifact: refuses (non-zero exit)', run.status !== 0, `status=${run.status}`);
  check('unparseable artifact: the file on disk is untouched',
    readArtifactRaw(broken) === original);

  // (b) --force preserves the original rather than destroying it
  const forced = runDirect(candidate, broken, ['--force']);
  const moved = readdirSync(join(broken, '.agents')).filter((f) => f.includes('invalid'));
  check('--force moves the invalid artifact aside instead of destroying it',
    forced.status === 0 && moved.length === 1,
    `status=${forced.status} moved=${JSON.stringify(moved)}`);
  check('--force: the original bytes remain recoverable',
    moved.length === 1 && readFileSync(join(broken, '.agents', moved[0]), 'utf8') === original);
  cleanup(broken);

  // (c) schema-invalid but parseable, carrying human evidence
  const invalid = makeFixture({
    existingArtifact: {
      manual: { fragileFiles: [{ path: 'src/index.js', reason: 'irreplaceable' }] },
      generated: { specVersion: 'not-a-version' },
    },
  });
  const invalidBefore = readArtifactRaw(invalid);
  const invalidRun = runDirect(candidate, invalid);
  check('schema-invalid artifact: refuses rather than overwriting', invalidRun.status !== 0,
    `status=${invalidRun.status}`);
  check('schema-invalid artifact: human evidence survives the refusal',
    readArtifactRaw(invalid) === invalidBefore
    && readArtifactRaw(invalid).includes('irreplaceable'));
  cleanup(invalid);
}

// ---------------------------------------------------------------------------
section('5. Producer identity, determinism, and mediation');
// ---------------------------------------------------------------------------
{
  const repo = makeFixture();
  runDirect(candidate, repo);
  const doc = readArtifact(repo);

  check('generated.by.name identifies @workspacejson/cli, not an invoker',
    doc.generated?.by?.name === '@workspacejson/cli',
    `by=${JSON.stringify(doc.generated?.by)}`);
  check('output validates against the package-owned schema',
    validate(doc) === true);
  check('output validates as v0.4 when it declares specVersion 0.4',
    doc.generated?.specVersion !== '0.4' || validateV4(doc) === true);

  // Canonical pair ordering — the producer-profile obligation from ADR-003
  // A-009, enforced here rather than merely described.
  //
  // `docs/conformance.md` previously said this suite enforced it while nothing
  // in the suite looked at `coChange[].files` at all, so a producer emitting
  // reversed endpoints passed a gate that advertised the check. That is fixed
  // here rather than by softening the claim.
  //
  // Scope, stated so the result is not over-read: readers stay unordered and a
  // reversed document remains VALID. This is a producer obligation only, and it
  // applies to what a candidate emits, never to what a consumer must accept.
  const coChange = Array.isArray(doc.generated?.coChange) ? doc.generated.coChange : undefined;
  const observationEntries = (coChange ?? []).filter((entry) => entry?.support !== undefined);

  if (observationEntries.length === 0) {
    // Absence is reported as absence. A producer that emits no observation-form
    // pairs has not demonstrated this property, and recording it as a pass
    // would be the "green gate that measured nothing" failure this file exists
    // to avoid.
    check.notMeasured('canonical pair ordering — candidate emitted no observation-form coChange entries, so this property was not exercised');
  } else {
    // UTF-8 BYTE order, not `<`. A bare string comparison is UTF-16 code unit
    // order and the two disagree on supplementary-plane characters, so `<`
    // would accept an ordering the rule forbids.
    const compareUtf8 = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

    // Malformed pairs are FAILED, not skipped.
    //
    // An earlier version folded the well-formedness test into the ordering
    // filter, so an entry whose `files` was not a two-string array could not be
    // counted as misordered and silently passed the ordering check. A
    // structurally invalid observation must not be able to buy itself an
    // exemption from the rule it cannot be evaluated against — that is the same
    // "green gate that measured nothing" failure the NOT MEASURED channel above
    // exists to prevent, arriving one level down.
    const wellFormed = (entry) =>
      Array.isArray(entry.files) && entry.files.length === 2 && entry.files.every((p) => typeof p === 'string');
    const malformed = observationEntries.filter((entry) => !wellFormed(entry));
    check('every emitted coChange entry carries a two-string files pair',
      malformed.length === 0,
      `${malformed.length} of ${observationEntries.length} entr(ies) malformed, e.g. ${JSON.stringify(malformed[0]?.files)}`);

    const misordered = observationEntries.filter(
      (entry) => wellFormed(entry) && compareUtf8(entry.files[0], entry.files[1]) > 0,
    );
    check('every emitted coChange pair is ordered by ascending UTF-8 bytes',
      misordered.length === 0,
      `${misordered.length} of ${observationEntries.length} pair(s) reversed, e.g. ${JSON.stringify(misordered[0]?.files)}`);

    check('no emitted coChange entry stores a derived rate',
      observationEntries.every((entry) => !('rate' in entry)),
      'a new observation producer must emit support + occurrences and must not emit rate');
  }

  // Determinism: same repository, same producer version, byte-identical.
  const first = readArtifactRaw(repo);
  const second = runDirect(candidate, repo);
  const afterSecond = readArtifactRaw(repo);
  check('a second run against an unchanged repository is byte-identical',
    first === afterSecond, 'material projection changed with no repository change');
  check('a second run reports no material drift (usable as a CI gate)',
    second.status === 0 && /skip|no change|unchanged|up to date/i.test(`${second.stdout}${second.stderr}`) || first === afterSecond,
    `stdout=${second.stdout?.slice(0, 200)}`);

  cleanup(repo);
}
{
  // Direct vs mediated, on the SAME repository in sequence.
  //
  // Comparing two separately-created fixtures cannot work: `hygiene.scannedAt`
  // is a scan timestamp, so two independent runs legitimately differ by more
  // than `generatedAt` and the assertion would be measuring wall-clock, not
  // mediation. Running both against one repository isolates the variable —
  // the second invocation sees an unchanged material projection, so a
  // conforming producer carries the prior values forward and writes nothing.
  const repo = makeFixture();
  const direct = runDirect(candidate, repo);
  const afterDirect = readArtifactRaw(repo);
  const mediated = runMediated(candidate, repo);
  const afterMediated = readArtifactRaw(repo);

  check('mediated invocation succeeds', mediated.status === 0,
    `status=${mediated.status}\n${mediated.stderr?.slice(0, 300) ?? ''}`);

  if (direct.status === 0 && mediated.status === 0) {
    const strip = (raw) => {
      const clone = JSON.parse(raw);
      delete clone.generated.generatedAt;
      return JSON.stringify(clone);
    };
    check('direct and mediated output are identical after removing only generated.generatedAt',
      strip(afterDirect) === strip(afterMediated),
      'mediation must not change what the producer emits');
    check('mediated invocation over a current artifact writes nothing',
      afterDirect === afterMediated,
      'a mediator must not cause a rewrite the direct path would not');
  }
  cleanup(repo);
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(70)}`);
console.log(` RESULT: ${state.pass} passed, ${state.fail} failed  (total ${state.pass + state.fail})`);
if (state.notMeasured.length > 0) {
  // Reported separately and never folded into the pass count: a property the
  // candidate gave no way to exercise has not been demonstrated.
  console.log(` NOT MEASURED: ${state.notMeasured.length} — ${state.notMeasured.join('; ')}`);
}
if (state.fail) console.log(` FAILED: ${state.failures.join(', ')}`);
console.log('='.repeat(70));
process.exit(state.fail ? 1 : 0);
