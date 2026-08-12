#!/usr/bin/env node

// Red tests for scripts/check-architecture.mjs.
//
// Each case copies the repository into a scratch git worktree, introduces ONE
// deliberate violation, and asserts the guard rejects it with the expected
// violation kind.
//
// The first case is the opposite: it asserts the UNMODIFIED repository is
// ACCEPTED. Without that baseline, a guard that rejected everything would pass
// every red test and look perfectly healthy.

import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const guard = join(repoRoot, "scripts", "check-architecture.mjs");

function trackedFiles() {
  return spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .stdout.split("\n").filter(Boolean);
}

// Build a scratch copy that is a real git repo (the guard uses `git ls-files`),
// containing exactly the tracked files, then apply a mutation.
function withScratchRepo(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "wsjson-arch-"));
  try {
    for (const f of trackedFiles()) {
      const dest = join(dir, f);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(repoRoot, f), dest);
    }
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["add", "-A"], { cwd: dir });
    mutate(dir);
    // stage mutations so `git ls-files` sees added files
    spawnSync("git", ["add", "-A"], { cwd: dir });
    const result = spawnSync("node", [guard, dir], { cwd: dir, encoding: "utf8" });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const write = (dir, rel, content) => {
  const dest = join(dir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
};
const patchJson = (dir, rel, fn) => {
  const p = join(dir, rel);
  const d = JSON.parse(readFileSync(p, "utf8"));
  fn(d);
  writeFileSync(p, JSON.stringify(d, null, 2));
};

const cases = [];
const baseline = (name, fn) => cases.push({ name, expectReject: false, kind: null, mutate: fn });
const red = (name, kind, fn) => cases.push({ name, expectReject: true, kind, mutate: fn });

// ---------------------------------------------------------------- baseline
baseline("baseline: the unmodified repository is ACCEPTED", () => {});

// ------------------------------------------------------------- clean-room
red("clean-room: @marcelle-labs import", "clean-room", (d) =>
  write(d, "packages/spec/src/__violation.ts", `import { thing } from '@marcelle-labs/internal';\nexport const x = thing;\n`));

red("clean-room: workspace.vreko.json assumption", "clean-room", (d) =>
  write(d, "packages/rules/src/__violation.ts", `export const sidecar = 'workspace.vreko.json';\n`));

red("clean-room: private Vreko swarm source import", "clean-room", (d) =>
  write(d, "packages/rules/src/__violation.ts", `import x from '../../../.vreko-swarm/engine.js';\nexport default x;\n`));

// ------------------------------------------------------ dependency direction
red("dependency-direction: imports agents-audit (workspacejson/cli)", "dependency-direction", (d) =>
  write(d, "packages/rules/src/__violation.ts", `import { generate } from 'agents-audit';\nexport default generate;\n`));

red("dependency-direction: imports @workspacejson/cli", "dependency-direction", (d) =>
  write(d, "packages/spec/src/__violation.ts", `import { join } from '@workspacejson/cli';\nexport default join;\n`));

red("dependency-direction: imports @workspacejson/codex-mcp (integrations)", "dependency-direction", (d) =>
  write(d, "packages/rules/src/__violation.ts", `import s from '@workspacejson/codex-mcp';\nexport default s;\n`));

// ------------------------------------------------------- local dependencies
red("local-dependency: committed sibling-checkout path", "local-dependency", (d) =>
  patchJson(d, "packages/rules/package.json", (m) => { m.dependencies["@workspacejson/spec"] = "file:../../../standard/packages/spec"; }));

// ------------------------------------------------------- duplicate contract
red("duplicate-contract: ambient declare module '@workspacejson/spec' returns", "duplicate-contract", (d) =>
  write(d, "types/ambient.d.ts", `${readFileSync(join(d, "types/ambient.d.ts"), "utf8")}\ndeclare module '@workspacejson/spec' {\n  export const version: string;\n}\n`));

// ------------------------------------------------------ repository boundary
red("repository-boundary: producer implementation in standard", "repository-boundary", (d) =>
  write(d, "packages/spec/src/__violation.ts", `export async function generateWorkspaceJson(root: string) { return root; }\n`));

red("repository-boundary: MCP host-integration code in standard", "repository-boundary", (d) =>
  write(d, "packages/rules/src/__violation.ts", `import { Server } from '@modelcontextprotocol/sdk';\nexport default Server;\n`));

red("repository-boundary: site rendering code in standard", "repository-boundary", (d) =>
  write(d, "packages/spec/src/__violation.ts", `import { defineConfig } from 'astro/config';\nexport default defineConfig;\n`));

red("repository-boundary: copied CLI package source", "repository-boundary", (d) =>
  write(d, "packages/agents-audit/package.json", JSON.stringify({ name: "agents-audit", version: "0.4.4" }, null, 2)));

// ------------------------------------------------------------ copied schema
red("copied-schema: a second normative schema copy", "copied-schema", (d) =>
  write(d, "docs/schema/v1.json", readFileSync(join(d, "packages/spec/schema/v1.json"), "utf8")));

// ----------------------------------------------------- package/publication
red("foreign-package: a package this repo does not own", "foreign-package", (d) =>
  write(d, "packages/newthing/package.json", JSON.stringify({ name: "@workspacejson/newthing", version: "0.1.0" }, null, 2)));

red("unpinned-standard-dependency: floating range on a standard package", "unpinned-standard-dependency", (d) =>
  patchJson(d, "packages/rules/package.json", (m) => { m.dependencies["@workspacejson/spec"] = "^0.4.0"; }));

// ------------------------------------------------------- unused dependencies
red("unused-dependency: a runtime dependency nothing imports", "unused-dependency", (d) =>
  patchJson(d, "packages/rules/package.json", (m) => { m.dependencies["left-pad"] = "^1.3.0"; }));

// The inverse case: a dependency that IS imported must not be reported. Without
// it, a guard that flagged every dependency would pass the red test above.
baseline("unused-dependency: an imported subpath dependency is ACCEPTED", (d) =>
  patchJson(d, "packages/rules/package.json", (m) => { m.dependencies["ajv"] = "^8.16.0"; }));

// ---- publish authority -----------------------------------------------------
// The rule changed when authority transferred. It was "no workflow may publish";
// it is now "exactly one designated workflow may publish, under stated
// constraints". These cases were updated to match rather than removed — the
// first is the changed expectation, and the ones after it are the constraints
// that the old rule's blanket absence used to provide for free.
//
// The unmodified-repository baseline at the top of this file is what proves the
// relaxation did not simply disable the guard: the real release.yml must still
// be ACCEPTED, while every deviation from it below is still rejected.

// Formerly red as "a release workflow reappears with a publish step".
// `changeset publish` in the designated workflow is now the intended
// arrangement — the baseline covers it — so the red case moves to what is still
// forbidden: a publish step anywhere else.
red("publish-authority: a SECOND workflow gains a publish step", "publish-authority", (d) =>
  write(d, ".github/workflows/ship.yml", `name: Ship\non:\n  workflow_dispatch:\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm changeset publish\n`));

red("publish-authority: publishing hidden under a different workflow filename", "publish-authority", (d) =>
  write(d, ".github/workflows/deploy.yml", `name: Deploy\non:\n  push:\njobs:\n  ship:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm publish --access public\n`));

red("publish-authority: a non-release workflow gains an npm credential", "publish-authority", (d) =>
  write(d, ".github/workflows/ci.yml", `${readFileSync(join(d, ".github/workflows/ci.yml"), "utf8")}\n      - name: leak\n        env:\n          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\n        run: echo x\n`));

// A raw publish inside the designated workflow bypasses the release plan: it
// ships whatever is in the working directory under whatever name the manifest
// carries, with none of the fixed group's ordering.
red("publish-authority: the release workflow publishes with raw npm publish", "publish-authority", (d) =>
  write(d, ".github/workflows/release.yml", readFileSync(join(d, ".github/workflows/release.yml"), "utf8")
    .replace("run: pnpm changeset publish", "run: npm publish --access public")));

// A release workflow reachable from a pull request hands the credential to
// anyone who can open one.
red("publish-authority: the release workflow becomes reachable from a pull request", "publish-authority", (d) =>
  write(d, ".github/workflows/release.yml", readFileSync(join(d, ".github/workflows/release.yml"), "utf8")
    .replace("on:\n  push:", "on:\n  pull_request:\n  push:")));

// Provenance that is configured but not permitted is provenance that is absent.
red("publish-authority: the release workflow drops id-token: write", "publish-authority", (d) =>
  write(d, ".github/workflows/release.yml", readFileSync(join(d, ".github/workflows/release.yml"), "utf8")
    .replace(/^ *id-token: write$/m, "")));

// One authority per package cuts both ways: the designated workflow must not
// reach for a package this repository does not own either.
red("foreign-publish: the release workflow reaches for a package this repo does not own", "foreign-publish", (d) =>
  write(d, ".github/workflows/release.yml", `${readFileSync(join(d, ".github/workflows/release.yml"), "utf8")}\n      - run: npx agents-audit scan .\n`));

red("foreign-publish: fixed group reintroduces agents-audit", "foreign-publish", (d) =>
  patchJson(d, ".changeset/config.json", (m) => { m.fixed = [["@workspacejson/spec", "@workspacejson/rules", "agents-audit"]]; }));

red("foreign-publish: a workflow references agents-audit", "foreign-publish", (d) =>
  write(d, ".github/workflows/audit.yml", `name: Audit\non:\n  push:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx agents-audit scan .\n`));

// ------------------------------------------------------ descriptive-only
red("prescriptive-policy: schema gains an enforcement field", "prescriptive-policy", (d) => {
  const p = join(d, "packages/spec/schema/v1.json");
  const s = JSON.parse(readFileSync(p, "utf8"));
  s.properties.enforcementPolicy = { type: "object", description: "blockMerge rules" };
  writeFileSync(p, JSON.stringify(s, null, 2));
});

// ------------------------------------------------------ stable read paths
red("stable-read-path: fileIndex removed from the schema", "stable-read-path", (d) => {
  const p = join(d, "packages/spec/schema/v1.json");
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("fileIndex", "renamedIndex"));
});

// ---------------------------------------------------------------- run
let passed = 0, failed = 0;
for (const c of cases) {
  const { status, out } = withScratchRepo(c.mutate);
  const rejected = status !== 0;
  let ok = rejected === c.expectReject;
  if (ok && c.expectReject && c.kind) ok = out.includes(`[${c.kind}]`);

  if (ok) { passed++; console.log(`PASS  ${c.expectReject ? "rejected — " : ""}${c.name}`); }
  else {
    failed++;
    console.log(`FAIL  ${c.name}`);
    console.log(`        expected ${c.expectReject ? `rejection with kind [${c.kind}]` : "acceptance"}, got exit ${status}`);
    console.log(out.split("\n").map((l) => `        ${l}`).join("\n"));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
