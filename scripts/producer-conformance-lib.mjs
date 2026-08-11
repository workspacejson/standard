// Shared machinery for the four-path producer conformance contract.
//
// This repository owns the neutral contract; `workspacejson/cli` is the
// implementation under test. The suite therefore needs a CLI *candidate* — a
// built producer package — supplied from outside this repository.
//
// SCOPE BOUNDARY, read before extending:
//
//   This contract asserts that `generated.fileIndex` is POPULATED FROM
//   REPOSITORY EVIDENCE. It asserts nothing about per-file *values*.
//
//   `FileIndexEntry` declares `fragility`, `aiModificationCount` and
//   `humanModificationCount` as OPTIONAL, so `{}` is a conformant entry. Those
//   values are behavioral, their only available source is git-derived, and
//   whether that source may enter the stable contract is an open determination
//   made outside this repository. A conformance suite that required them would
//   pre-empt a ruling this repository does not own, and would fail a producer
//   that is behaving correctly.
//
//   Do not add value assertions here. Do not add git-derived co-change.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Candidate resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the producer under test.
 *
 * `WORKSPACEJSON_CLI_CANDIDATE` points at a BUILT `@workspacejson/cli` package
 * directory — one containing `package.json` and `dist/`.
 *
 * There is deliberately no fallback that skips. A conformance gate that goes
 * green because it could not find the implementation is worse than no gate:
 * it reports conformance it never measured. Absent a candidate this exits
 * non-zero with instructions.
 */
export function resolveCandidate() {
  const raw = process.env.WORKSPACEJSON_CLI_CANDIDATE;
  if (!raw) {
    console.error(`
The producer conformance suite needs a built @workspacejson/cli candidate.

  WORKSPACEJSON_CLI_CANDIDATE=/path/to/cli/packages/cli node scripts/check-producer-conformance.mjs

To produce one from a checkout of workspacejson/cli:

  pnpm install && pnpm -r build      # emits packages/cli/dist/

This suite does not skip when the candidate is missing. A conformance gate that
passes without measuring anything is worse than no gate.
`);
    process.exit(2);
  }
  const dir = resolve(raw);
  const manifestPath = join(dir, 'package.json');
  const cliEntry = join(dir, 'dist', 'cli.js');
  const libEntry = join(dir, 'dist', 'index.js');

  for (const [label, path] of [['package.json', manifestPath], ['dist/cli.js', cliEntry], ['dist/index.js', libEntry]]) {
    if (!existsSync(path)) {
      console.error(`\nCandidate at ${dir} is missing ${label}.`);
      console.error(existsSync(manifestPath)
        ? 'The package exists but is not built. Run `pnpm -r build` in the candidate repository.\n'
        : 'That path does not look like a @workspacejson/cli package directory.\n');
      process.exit(2);
    }
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return { dir, manifest, cliEntry, libEntry };
}

// ---------------------------------------------------------------------------
// Fixture repositories
// ---------------------------------------------------------------------------

/**
 * A repository shaped to exercise every stable path at once.
 *
 * `express` is declared as a dependency AND named in AGENTS.md, so it is
 * corroborated. `svelte` is named in AGENTS.md and declared nowhere, so a
 * conformant producer must NOT publish it at the documented >= 0.7 confidence
 * floor — an uncorroborated guess at high confidence is worse than an omission,
 * because the confidence tells the consumer to trust it.
 */
export function makeFixture({ manual = null, existingArtifact = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wsjson-conformance-'));

  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: 'conformance-fixture',
    version: '1.0.0',
    private: true,
    dependencies: { express: '^4.18.0' },
  }, null, 2)}\n`);

  writeFileSync(join(dir, 'AGENTS.md'), [
    '# Conformance fixture',
    '',
    '## Stack',
    '',
    'This service uses express for routing and svelte on the front end.',
    '',
    '## Layout',
    '',
    '- `src/` — application source',
    '- `test/` — tests',
    '',
  ].join('\n'));

  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  writeFileSync(join(dir, 'src', 'index.js'), "export const answer = 42;\n");
  writeFileSync(join(dir, 'src', 'routes.js'), "export const routes = [];\n");
  writeFileSync(join(dir, 'test', 'index.test.js'), "// intentionally empty\n");
  writeFileSync(join(dir, 'README.md'), '# fixture\n');

  if (manual || existingArtifact) {
    mkdirSync(join(dir, '.agents'), { recursive: true });
    const artifact = existingArtifact ?? {
      manual,
      generated: {
        specVersion: '0.4',
        generatedAt: '2020-01-01T00:00:00.000Z',
        by: { name: '@workspacejson/cli', version: '0.0.0' },
        frameworkManifest: [],
        fileIndex: {},
      },
      agents: {},
      health: { intelligenceState: 'INSUFFICIENT_DATA', observationCount: 0, confidence: 0 },
    };
    writeFileSync(
      join(dir, '.agents', 'workspace.json'),
      typeof artifact === 'string' ? artifact : `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }

  return dir;
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export const ARTIFACT = join('.agents', 'workspace.json');

export function readArtifact(repo) {
  return JSON.parse(readFileSync(join(repo, ARTIFACT), 'utf8'));
}

export function readArtifactRaw(repo) {
  return readFileSync(join(repo, ARTIFACT), 'utf8');
}

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

/** Direct invocation — the published binary entry point. */
export function runDirect(candidate, repo, args = []) {
  return spawnSync(process.execPath, [candidate.cliEntry, 'generate', repo, ...args], {
    encoding: 'utf8',
    cwd: repo,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

/**
 * Mediated invocation — a host tool importing the package and calling the
 * exported producer, which is how an integrating tool drives generation.
 *
 * The issue names Vreko as the mediator. Vreko is private and outside this
 * repository's clean-room boundary, so it cannot be executed here. What is
 * asserted instead is the property that mediation must preserve, against the
 * public mediation surface the package exports. A Vreko-specific regression
 * belongs in that repository, which this contract does not replace.
 */
export function runMediated(candidate, repo) {
  const script = `
    import { generateWorkspaceJson } from ${JSON.stringify(candidate.libEntry)};
    const result = await generateWorkspaceJson(${JSON.stringify(repo)});
    process.stdout.write(JSON.stringify({ written: result.written, skipped: result.skipped }));
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    cwd: repo,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function createReporter() {
  const state = { pass: 0, fail: 0, failures: [], notMeasured: [] };
  const check = (label, condition, detail = '') => {
    if (condition) {
      console.log(`  PASS  ${label}`);
      state.pass += 1;
    } else {
      console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
      state.fail += 1;
      state.failures.push(label);
    }
  };

  /**
   * Record a property this candidate gave the suite no way to measure.
   *
   * Counted separately from `pass` on purpose. A property that could not be
   * exercised has not been demonstrated, and folding it into the pass count
   * would inflate the denominator with checks that measured nothing — the
   * failure this suite refuses to skip for elsewhere.
   */
  check.notMeasured = (label) => {
    console.log(`  N/A   ${label}`);
    state.notMeasured.push(label);
  };

  return {
    state,
    check,
    section(title) {
      console.log(`\n${'='.repeat(70)}\n ${title}\n${'='.repeat(70)}`);
    },
  };
}

export function listFiles(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.agents' || entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, base, acc);
    else acc.push(full.slice(base.length + 1).split('\\').join('/'));
  }
  return acc;
}
