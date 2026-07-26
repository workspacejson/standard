#!/usr/bin/env node
// Red tests for the four-path producer conformance contract (see the
// suite itself): mutating any protected behavior must make it fail.
//
// A conformance suite nobody has watched fail is an unverified claim. Each case
// below copies the candidate, breaks exactly one protected behavior in the
// built output, and asserts the suite goes RED.
//
// Two guards make this honest:
//
//   1. Each mutation asserts it actually changed bytes. A stale anchor that no
//      longer matches would otherwise leave the candidate pristine, the suite
//      green, and this file reporting "the guard works" having tested nothing.
//   2. Each case names the check it expects to break, and the run must contain
//      that failure — not merely any failure. A mutation that reds the suite
//      for an unrelated reason is not evidence about the behavior it targeted.
//
// A baseline case asserts the unmutated candidate is accepted, so the suite
// cannot pass these tests by rejecting everything.
//
//   WORKSPACEJSON_CLI_CANDIDATE=/path/to/cli/packages/cli \
//     node scripts/check-producer-conformance.test.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SUITE = join(here, 'check-producer-conformance.mjs');

const source = process.env.WORKSPACEJSON_CLI_CANDIDATE;
if (!source) {
  console.error('\nWORKSPACEJSON_CLI_CANDIDATE is required. See check-producer-conformance.mjs.\n');
  process.exit(2);
}

/**
 * Mutations are applied to the BUILT output, not to source, so a case does not
 * depend on the candidate's toolchain being available. tsup emits shared code
 * into content-hashed chunks, so every `dist/*.js` is patched rather than a
 * named file — a chunk name is not a contract.
 */
const CASES = [
  {
    name: 'fileIndex emptied — an unpopulated stub',
    expect: 'fileIndex is non-empty',
    find: 'for (const key of keys) index[key] = {};',
    replace: 'for (const key of []) index[key] = {};',
  },
  {
    name: 'fileIndex key ordering removed',
    expect: 'deterministically ordered',
    find: '.filter((key) => !isProducerOutput(key)).sort();',
    replace: '.filter((key) => !isProducerOutput(key)).reverse();',
  },
  {
    name: 'producer-output exclusion removed — the non-convergence defect returns',
    expect: 'byte-identical',
    find: '.filter((key) => !isProducerOutput(key)).sort();',
    replace: '.sort();',
  },
  {
    name: 'framework confidence dropped below the documented floor',
    expect: 'confidence floor',
    find: 'confidence: 0.9',
    replace: 'confidence: 0.5',
  },
  {
    name: 'manual evidence discarded instead of preserved',
    expect: 'manual.fragileFiles preserved verbatim',
    find: 'manual: existing?.manual ?? {},',
    replace: 'manual: {},',
  },
  {
    name: 'producer identity misattributed to an invoker',
    expect: 'generated.by.name identifies @workspacejson/cli',
    find: 'by: { name: producer.name, version: producer.version }',
    replace: 'by: { name: "vreko", version: producer.version }',
  },
  {
    name: 'refusal on an invalid artifact removed',
    expect: 'refuses',
    find: 'if (!options.force || options.dryRun || options.check) throw new GenerateRefusalError(message);',
    replace: 'if (false) throw new GenerateRefusalError(message);',
  },
];

function patchDist(dir, find, replace) {
  const distDir = join(dir, 'dist');
  let replacements = 0;
  for (const entry of readdirSync(distDir)) {
    if (!entry.endsWith('.js')) continue;
    const path = join(distDir, entry);
    const before = readFileSync(path, 'utf8');
    if (!before.includes(find)) continue;
    const after = before.split(find).join(replace);
    if (after === before) continue;
    writeFileSync(path, after);
    replacements += before.split(find).length - 1;
  }
  return replacements;
}

function runSuite(candidateDir) {
  return spawnSync(process.execPath, [SUITE], {
    encoding: 'utf8',
    env: { ...process.env, WORKSPACEJSON_CLI_CANDIDATE: candidateDir, NO_COLOR: '1' },
  });
}

let pass = 0;
let fail = 0;
const failures = [];

function record(label, condition, detail = '') {
  if (condition) {
    console.log(`PASS  ${label}`);
    pass += 1;
  } else {
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
    fail += 1;
    failures.push(label);
  }
}

// ---------------------------------------------------------------------------
// Baseline — the suite must ACCEPT a clean candidate. Without this, a suite
// that rejected everything would pass every red test below.
// ---------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'conformance-baseline-'));
  const candidate = join(dir, 'candidate');
  cpSync(resolve(source), candidate, { recursive: true });
  const run = runSuite(candidate);
  record('baseline: an unmutated candidate is accepted',
    run.status === 0,
    `status=${run.status}\n        ${(run.stdout ?? '').split('\n').filter((l) => l.includes('FAIL')).slice(0, 3).join('\n        ')}`);
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
for (const testCase of CASES) {
  const dir = mkdtempSync(join(tmpdir(), 'conformance-mutant-'));
  const candidate = join(dir, 'candidate');
  cpSync(resolve(source), candidate, { recursive: true });

  const replacements = patchDist(candidate, testCase.find, testCase.replace);
  if (replacements === 0) {
    record(`${testCase.name}`, false,
      `MUTATION DID NOT APPLY — anchor not found in the built candidate:\n          ${testCase.find}\n        The anchor is stale. This case tested nothing; fix the anchor rather than deleting the case.`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  const run = runSuite(candidate);
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const wentRed = run.status !== 0;
  const brokeExpected = output.split('\n').some((line) => line.includes('FAIL') && line.includes(testCase.expect));

  record(`rejected — ${testCase.name}`,
    wentRed && brokeExpected,
    wentRed
      ? `suite went red but not on the expected check "${testCase.expect}"\n        observed: ${output.split('\n').filter((l) => l.includes('FAIL')).slice(0, 3).join(' | ')}`
      : `suite stayed GREEN with ${replacements} mutation(s) applied — the behavior is unprotected`);

  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nProducer conformance red tests: ${pass} passed, ${fail} failed.`);
if (fail) {
  console.log(`FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
