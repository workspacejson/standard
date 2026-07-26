#!/usr/bin/env node
// Runtime/API parity harness for META-239.
//
// Installs the OLD candidate (packed from the frozen source monorepo) and the
// NEW candidate (packed from workspacejson/standard) into separate clean
// directories from tarballs, then runs identical inputs through both and
// compares exit codes and normalized output.
//
// Every load-bearing behavior is PERTURBED, not merely exercised: a harness that
// only feeds valid input cannot tell a real validator from `return true`.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Candidate tarball directory. Override with WORKSPACEJSON_PARITY_DIR.
const SP = process.env.WORKSPACEJSON_PARITY_DIR
  ?? (() => { throw new Error("Set WORKSPACEJSON_PARITY_DIR to a directory containing old-candidates/, new-candidates/ and registry/ tarballs."); })();
const SPEC_TGZ = "workspacejson-spec-0.4.4.tgz";
const RULES_TGZ = "workspacejson-rules-0.4.4.tgz";

function makeSide(label, dir) {
  const root = mkdtempSync(join(tmpdir(), `wsjson-${label}-`));
  writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  // vitest is a peer of @workspacejson/rules/testing (built with --external
  // vitest). Without it the ./testing export throws on import, so install it to
  // prove the export actually WORKS rather than merely failing identically.
  const r = spawnSync("npm", ["install", "--ignore-scripts", "--no-package-lock",
    join(dir, SPEC_TGZ), join(dir, RULES_TGZ), "vitest@1.6.0"],
    { cwd: root, encoding: "utf8", env: { ...process.env, npm_config_cache: join(root, ".npm") } });
  if (r.status !== 0) { console.error(`install failed for ${label}:\n${r.stderr}`); process.exit(1); }
  return root;
}

console.log("Installing packed candidates into clean directories...");
const OLD = makeSide("old", `${SP}/old-candidates`);
const NEW = makeSide("new", `${SP}/new-candidates`);
console.log(`  old -> ${OLD}\n  new -> ${NEW}\n`);

let pass = 0, fail = 0;
const results = [];

const norm = (s) => (s ?? "")
  .replaceAll(OLD, "<ROOT>").replaceAll(NEW, "<ROOT>")
  .replace(/\r\n/g, "\n")
  .replace(/\/private\/var\/folders\/[^\s"']+/g, "<TMP>")
  .replace(/\/var\/folders\/[^\s"']+/g, "<TMP>")
  .trim();

function runBoth(name, argv, { stdin } = {}) {
  const run = (root) => {
    const r = spawnSync(process.execPath, argv.map((a) => a.replaceAll("<ROOT>", root)),
      { cwd: root, encoding: "utf8", input: stdin });
    return { status: r.status, out: norm(r.stdout), err: norm(r.stderr) };
  };
  const a = run(OLD), b = run(NEW);
  const same = a.status === b.status && a.out === b.out && a.err === b.err;
  results.push({ name, old: a, new: b, same });
  if (same) { pass++; console.log(`  PASS  ${name}  exit=${a.status}`); }
  else {
    fail++;
    console.log(`  FAIL  ${name}`);
    console.log(`          old exit=${a.status} out=${JSON.stringify(a.out.slice(0, 200))} err=${JSON.stringify(a.err.slice(0, 200))}`);
    console.log(`          new exit=${b.status} out=${JSON.stringify(b.out.slice(0, 200))} err=${JSON.stringify(b.err.slice(0, 200))}`);
  }
  return { a, b };
}

// Fixtures ------------------------------------------------------------------
const VALID_V4 = {
  manual: { fragileFiles: [{ path: "src/core.ts", reason: "load-bearing" }], coChangePatterns: [{ files: ["a.ts", "b.ts"] }] },
  generated: {
    specVersion: "0.4", generatedAt: "2026-07-26T00:00:00.000Z",
    by: { name: "agents-audit", version: "0.4.4" },
    frameworkManifest: [{ name: "vitest", confidence: 1 }],
    fileIndex: { "src/core.ts": { fragility: 0.9 } },
  },
  agents: {},
  health: { intelligenceState: "CONFIDENT", observationCount: 10, confidence: 0.9 },
};

const fixtures = {
  "valid-v4.json": VALID_V4,
  // PERTURBATION: required field removed
  "missing-required.json": (() => { const d = structuredClone(VALID_V4); delete d.generated.specVersion; return d; })(),
  // PERTURBATION: unknown top-level property (additionalProperties)
  "extra-property.json": (() => { const d = structuredClone(VALID_V4); d.notARealField = true; return d; })(),
  // PERTURBATION: stable read path malformed (fragileFiles not an array)
  "malformed-fragilefiles.json": (() => { const d = structuredClone(VALID_V4); d.manual.fragileFiles = "not-an-array"; return d; })(),
  // PERTURBATION: stable read path malformed (fileIndex wrong type)
  "malformed-fileindex.json": (() => { const d = structuredClone(VALID_V4); d.generated.fileIndex = []; return d; })(),
  // PERTURBATION: invalid specVersion value
  "bad-specversion.json": (() => { const d = structuredClone(VALID_V4); d.generated.specVersion = "9.9"; return d; })(),
  // PERTURBATION: whole document is not an object
  "not-an-object.json": "just a string",
  // PERTURBATION: empty object
  "empty.json": {},
};

for (const root of [OLD, NEW]) {
  mkdirSync(join(root, "fx"), { recursive: true });
  for (const [f, data] of Object.entries(fixtures)) {
    writeFileSync(join(root, "fx", f), JSON.stringify(data, null, 2));
  }
  writeFileSync(join(root, "fx", "corrupt.json"), "{ this is not json ");
}

// ---------------------------------------------------------------- spec CLI
console.log("=== @workspacejson/spec — binary (workspacejson-spec) ===");
const BIN = "<ROOT>/node_modules/@workspacejson/spec/dist/cli.js";
// The binary's only command is `validate <file>`; it has no --help flag and
// prints usage to stderr with exit 1 for any other form. Both shapes are
// compared so usage AND success paths are covered.
runBoth("workspacejson-spec (no args) -> usage", [BIN]);
runBoth("workspacejson-spec --help -> usage", [BIN, "--help"]);
runBoth("workspacejson-spec validate VALID -> exit 0", [BIN, "validate", "<ROOT>/fx/valid-v4.json"]);
for (const f of ["missing-required", "extra-property", "malformed-fragilefiles", "malformed-fileindex", "bad-specversion", "not-an-object", "empty", "corrupt"]) {
  runBoth(`workspacejson-spec validate INVALID: ${f}`, [BIN, "validate", `<ROOT>/fx/${f}.json`]);
}
runBoth("workspacejson-spec validate missing file", [BIN, "validate", "<ROOT>/fx/does-not-exist.json"]);

// ------------------------------------------------------------- spec exports
console.log("\n=== @workspacejson/spec — public API ===");
const specApi = `
const m = await import('@workspacejson/spec');
const out = {
  exports: Object.keys(m).sort(),
  version: m.version,
  hasValidate: typeof m.validate,
  hasValidateLegacy: typeof m.validateLegacy,
  hasSchema: typeof m.workspaceJsonSchema,
  schemaId: m.workspaceJsonSchema.$id,
  schemaRequired: m.workspaceJsonSchema.required,
  schemaAdditional: m.workspaceJsonSchema.additionalProperties,
};
console.log(JSON.stringify(out, null, 2));
`;
runBoth("import('@workspacejson/spec') surface", ["--input-type=module", "-e", specApi]);

const schemaSub = `
const s = (await import('@workspacejson/spec/schema', { with: { type: 'json' } })).default;
const { createHash } = await import('node:crypto');
console.log(JSON.stringify({ id: s.$id, sha256: createHash('sha256').update(JSON.stringify(s)).digest('hex') }));
`;
runBoth("import('@workspacejson/spec/schema')", ["--input-type=module", "-e", schemaSub]);

const validateAll = `
const { validate, validateLegacy } = await import('@workspacejson/spec');
const { readFileSync, readdirSync } = await import('node:fs');
const files = readdirSync('fx').sort();
const rows = {};
for (const f of files) {
  let data;
  try { data = JSON.parse(readFileSync('fx/' + f, 'utf8')); }
  catch { rows[f] = { parse: 'ERROR' }; continue; }
  rows[f] = { validate: validate(data), validateLegacy: validateLegacy(data) };
}
console.log(JSON.stringify(rows, null, 2));
`;
const { a: vOld } = runBoth("validate()/validateLegacy() across all fixtures", ["--input-type=module", "-e", validateAll]);

// ------------------------------------------------------------ rules exports
console.log("\n=== @workspacejson/rules — public API ===");
const rulesApi = `
const m = await import('@workspacejson/rules');
console.log(JSON.stringify({ exports: Object.keys(m).sort(), count: Object.keys(m).length }, null, 2));
`;
runBoth("import('@workspacejson/rules') surface", ["--input-type=module", "-e", rulesApi]);

// @workspacejson/rules/testing re-exports vitest helpers, and vitest throws
// "failed to access its internal state" when imported outside a vitest run.
// Proving this export therefore requires running it INSIDE vitest, not just
// importing it — otherwise "both sides error identically" would masquerade as
// a working public export.
const TESTING_SPEC = `
import { describe, it, expect } from 'vitest';
import * as testing from '@workspacejson/rules/testing';
import { missingFileReference } from '@workspacejson/rules';

describe('@workspacejson/rules/testing public export', () => {
  it('exposes exactly RuleTester', () => {
    expect(Object.keys(testing).sort()).toEqual(['RuleTester']);
    expect(typeof testing.RuleTester).toBe('function');
  });
});

// RuleTester.run() GENERATES describe/it blocks, so it must be called at
// collection time. This drives a real shipped rule through the public testing
// utility — proving the export works, not merely that it imports.
const tester = new testing.RuleTester({ rule: missingFileReference });

tester.run('missing-file-reference via public ./testing export', {
  valid: [
    {
      name: 'referenced file exists on disk',
      context: {
        agentsMd: { filePath: 'AGENTS.md', filePaths: ['package.json'] },
        repo: { root: process.cwd() },
      },
      expectedState: 'PASS',
    },
  ],
  invalid: [
    {
      name: 'referenced file is absent from disk',
      context: {
        agentsMd: { filePath: 'AGENTS.md', filePaths: ['definitely/not/here.ts'] },
        repo: { root: process.cwd() },
      },
    },
  ],
});
`;

function runTestingExport(root) {
  writeFileSync(join(root, "testing-export.test.mjs"), TESTING_SPEC);
  writeFileSync(join(root, "vitest.config.mjs"), "export default { test: { include: ['testing-export.test.mjs'] } };\n");
  const r = spawnSync(join(root, "node_modules", ".bin", "vitest"), ["run", "--reporter=basic"],
    { cwd: root, encoding: "utf8" });
  return { status: r.status, out: norm(r.stdout), err: norm(r.stderr) };
}
{
  const a = runTestingExport(OLD), b = runTestingExport(NEW);
  const bothPass = a.status === 0 && b.status === 0;
  const same = a.status === b.status;
  if (bothPass && same) { pass++; console.log(`  PASS  ./testing export exercised INSIDE vitest — RuleTester usable on both sides  exit=0`); }
  else {
    fail++;
    console.log(`  FAIL  ./testing export inside vitest: old exit=${a.status} new exit=${b.status}`);
    console.log((a.out + a.err).split("\n").slice(-15).map(l => "        " + l).join("\n"));
  }
}

// rules: validator against the same fixture corpus
const rulesValidator = `
const { WorkspaceJsonValidator } = await import('@workspacejson/rules');
const { readFileSync, readdirSync } = await import('node:fs');
const v = new WorkspaceJsonValidator();
const rows = {};
for (const f of readdirSync('fx').sort()) {
  let data;
  try { data = JSON.parse(readFileSync('fx/' + f, 'utf8')); } catch { rows[f] = 'PARSE_ERROR'; continue; }
  const r = v.validate(data);
  rows[f] = { valid: r.valid, errorCount: r.errors.length, errors: r.errors.slice(0, 3) };
}
console.log(JSON.stringify(rows, null, 2));
`;
runBoth("rules WorkspaceJsonValidator across all fixtures", ["--input-type=module", "-e", rulesValidator]);

// rules: parser
const parser = `
const { AgentsMdParser } = await import('@workspacejson/rules');
const p = new AgentsMdParser();
const md = ['# Title','','## Conventions','','- Tests live in tests/ and use kebab-case filenames','- src/index.ts is the entry point','','## Frameworks','','We use vitest and react.',''].join('\\n');
const r = await p.parse('AGENTS.md', md);
console.log(JSON.stringify({
  sections: r.sections.map(s => s.heading ?? s.title ?? null),
  filePaths: r.filePaths,
  conventions: r.conventions?.map(c => ({ type: c.type, canonical: c.canonical })),
  frameworks: r.frameworkTokens ?? r.frameworks,
}, null, 2));
`;
runBoth("rules AgentsMdParser deterministic parse", ["--input-type=module", "-e", parser]);

// rules: engine determinism + a real rule firing, then the SAME input perturbed
const engineSrc = (createTarget) => `
const R = await import('@workspacejson/rules');
const { mkdirSync, writeFileSync } = await import('node:fs');
mkdirSync('src', { recursive: true });
${createTarget ? "writeFileSync('src/referenced.ts', 'export {};');" : ""}
const engine = new R.RuleEngine();
engine.register(R.missingFileReference);
const ctx = {
  agentsMd: { filePath: 'AGENTS.md', sections: [], filePaths: ['src/referenced.ts'], conventions: [], patterns: [], frameworkTokens: [] },
  repo: { root: process.cwd(), files: [], packages: [], manifests: {}, git: { commits: [], filesChangedLast30Days: [] } },
  findings: new R.FindingGraphImpl().readOnly(),
  config: {},
};
const res = await engine.run(ctx);
console.log(JSON.stringify({
  findings: res.findings.map(f => ({ ruleId: f.ruleId, severity: f.severity, state: f.state, path: f.evidence?.path, confidence: f.confidence, message: f.message })),
  skipped: res.skipped, previewed: res.previewed,
}, null, 2));
`;
// The rule resolves against the real filesystem, so the perturbation must be a
// real file, not a changed array.
const { a: eOld } = runBoth("rules RuleEngine — referenced file ABSENT", ["--input-type=module", "-e", engineSrc(false)]);
const { a: pOld } = runBoth("rules RuleEngine PERTURBED — referenced file PRESENT", ["--input-type=module", "-e", engineSrc(true)]);

// rules: hygiene score
const hygiene = `
const { computeHygieneScore } = await import('@workspacejson/rules');
const mk = (n, sev) => Array.from({length:n}, (_,i) => ({ ruleId:'r'+i, ruleVersion:'1.0.0', severity:sev, state:'FAIL', confidence:1, signals:[], temporalWeight:1, evidence:{ file:'src/f'+i+'.ts' }, message:'m', remediation:'r', firedAt:new Date(0) }));
console.log(JSON.stringify({
  clean: computeHygieneScore([], 100),
  oneError: computeHygieneScore(mk(1,'error'), 100),
  fiveErrors: computeHygieneScore(mk(5,'error'), 100),
  fiveWarns: computeHygieneScore(mk(5,'warn'), 100),
}, null, 2));
`;
runBoth("rules computeHygieneScore graded output", ["--input-type=module", "-e", hygiene]);

// rules: testing export is functional, not just importable


// ------------------------------------------------------- perturbation proof
console.log("\n=== Perturbation sanity — the harness can tell behavior apart ===");
const validateRows = JSON.parse(vOld.out);
const accepted = Object.entries(validateRows).filter(([, r]) => r.validate === true).map(([f]) => f);
const rejected = Object.entries(validateRows).filter(([, r]) => r.validate === false).map(([f]) => f);
console.log(`  validate() accepted: ${accepted.join(", ") || "(none)"}`);
console.log(`  validate() rejected: ${rejected.join(", ") || "(none)"}`);
const discriminates = accepted.length > 0 && rejected.length > 0;
if (discriminates) { pass++; console.log(`  PASS  validator discriminates: ${accepted.length} accepted / ${rejected.length} rejected`); }
else { fail++; console.log(`  FAIL  validator did NOT discriminate — a constant result would look identical`); }

// missingFileReference emits a PASS finding when nothing fails, so the signal is
// the finding STATE, not the count.
const stateAbsent = JSON.parse(eOld.out).findings.map(f => f.state).join(",");
const statePresent = JSON.parse(pOld.out).findings.map(f => f.state).join(",");
if (stateAbsent.includes("FAIL") && !statePresent.includes("FAIL")) {
  pass++; console.log(`  PASS  rule engine discriminates: state ${stateAbsent} -> ${statePresent} when the file is created`);
} else {
  fail++; console.log(`  FAIL  rule engine did NOT discriminate (${stateAbsent} -> ${statePresent}) — could be a constant result`);
}

console.log(`\n${pass} passed, ${fail} failed`);
rmSync(OLD, { recursive: true, force: true });
rmSync(NEW, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
