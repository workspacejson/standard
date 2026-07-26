#!/usr/bin/env node

// Architecture and clean-room guards for workspacejson/standard.
//
// Enforces the ratified dependency direction and the clean-room boundary:
//
//     workspacejson/standard          <- this repository, depends on NONE of the others
//             |
//     workspacejson/cli   workspacejson/integrations
//             \                    /
//                workspacejson/site
//
// Every guard class below has a matching red test in check-architecture.test.mjs
// that introduces a deliberate violation and asserts this script rejects it,
// plus a baseline test asserting the unmodified repository is ACCEPTED — so a
// guard that rejected everything could not masquerade as working.
//
// Exit 0 = clean. Exit 1 = violations, printed with file and reason.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.argv[2] ?? process.cwd();

const STANDARD_OWNED_PACKAGES = ["@workspacejson/spec", "@workspacejson/rules"];

// The canonical normative schema. Exactly one copy may exist in this repository.
const CANONICAL_SCHEMA = "packages/spec/schema/v1.json";

const violations = [];
const report = (kind, file, message) => violations.push({ kind, file, message });

function trackedFiles() {
  const result = spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

const files = trackedFiles();
const read = (f) => {
  try { return readFileSync(join(repoRoot, f), "utf8"); } catch { return ""; }
};
const isSource = (f) => /\.(ts|tsx|js|mjs|cjs|jsx)$/.test(f);
const isConfig = (f) => /\.(json|ya?ml)$/.test(f);
// Markdown is documentation. It must be able to NAME a prohibited thing in order
// to prohibit it — OWNERSHIP.md and CONTRIBUTING.md exist precisely to say
// "@marcelle-labs/* is forbidden". Scanning prose for the strings it is
// documenting makes the guard fire on its own rulebook, so these checks apply to
// code and configuration only.
const isScannable = (f) => isSource(f) || isConfig(f);

// Comments describe intent, including intent to forbid. Strip them before
// matching so a comment explaining "there is deliberately no `changeset publish`
// here" is not itself read as a publish step.
function stripComments(file, content) {
  if (isSource(file)) {
    return content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
  }
  if (/\.ya?ml$/.test(file)) {
    return content.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "$1")).join("\n");
  }
  return content;
}

// Files that are allowed to *name* forbidden things because their whole job is
// to forbid them. Without this, the guard would flag itself.
const GUARD_FILES = new Set([
  "scripts/check-architecture.mjs",
  "scripts/check-architecture.test.mjs",
]);

for (const file of files) {
  if (GUARD_FILES.has(file) || !isScannable(file)) continue;
  const content = stripComments(file, read(file));
  if (!content) continue;

  // ---- Clean-room boundary -------------------------------------------------
  // No workspacejson repository may import, copy from, require or assume
  // proprietary Vreko/Marcelle Labs material.

  if (/@marcelle-labs\//.test(content)) {
    report("clean-room", file, "references @marcelle-labs/* — proprietary scope is prohibited in workspacejson/*");
  }
  if (/workspace\.vreko\.json/.test(content)) {
    report("clean-room", file, "assumes workspace.vreko.json — the private sidecar must not appear in the standard");
  }
  if (isSource(file) && /from\s+['"][^'"]*\.vreko-swarm|require\(\s*['"][^'"]*\.vreko-swarm/.test(content)) {
    report("clean-room", file, "imports private Vreko swarm source");
  }

  // ---- Dependency direction ------------------------------------------------
  // standard sits at the top of the graph. It may not consume any sibling
  // target repository, by package name or by path.

  if (isSource(file)) {
    for (const [pattern, repo] of [
      [/from\s+['"]agents-audit['"]|require\(\s*['"]agents-audit['"]/, "workspacejson/cli"],
      [/from\s+['"]@workspacejson\/cli['"]|require\(\s*['"]@workspacejson\/cli['"]/, "workspacejson/cli"],
      [/from\s+['"]@workspacejson\/codex-mcp['"]|require\(\s*['"]@workspacejson\/codex-mcp['"]/, "workspacejson/integrations"],
    ]) {
      if (pattern.test(content)) {
        report("dependency-direction", file, `imports from ${repo}; standard must depend on none of the other three repositories`);
      }
    }
  }

  // ---- Sibling-checkout / local path dependencies --------------------------
  if (/\.json$/.test(file) && /"(file|link):\.\.\//.test(content)) {
    report("local-dependency", file, "declares a sibling-checkout path dependency; cross-repository deps must be registry-backed");
  }

  // ---- Second editable view of the standard contract -----------------------
  // The extraction migration removed a hand-written `declare module
  // '@workspacejson/spec'` that was WINNING over the real package's types and
  // described a stale v0.3-only contract. It must not come back.
  if (/\.d\.ts$/.test(file) && /declare\s+module\s+['"]@workspacejson\/(spec|rules)['"]/.test(content)) {
    report("duplicate-contract", file, "ambient `declare module` for a standard-owned package shadows the real types — consume the real package instead");
  }

  // ---- Producer / host / site implementation in standard -------------------
  // standard is descriptive. It defines contracts; it does not generate,
  // integrate or render.
  if (isSource(file) && file.startsWith("packages/")) {
    if (/export\s+(async\s+)?function\s+generateWorkspaceJson\b/.test(content)) {
      report("repository-boundary", file, "producer implementation (generateWorkspaceJson) belongs to workspacejson/cli");
    }
    if (/@modelcontextprotocol\/sdk|\bvscode\b\s*:|from\s+['"]vscode['"]/.test(content)) {
      report("repository-boundary", file, "MCP/editor host-integration code belongs to workspacejson/integrations");
    }
    if (/from\s+['"]astro|@astrojs\/|from\s+['"]@astrojs/.test(content)) {
      report("repository-boundary", file, "site rendering code belongs to workspacejson/site");
    }
  }
}

// ---- Exactly one normative schema -----------------------------------------
// The website independently checked in a drifting copy of the schema.
// standard is the canonical source; a second copy here would recreate that
// failure inside the repository that is supposed to be authoritative.
{
  const schemaCopies = files.filter((f) => /(^|\/)v1\.json$/.test(f) || /(^|\/)schema\/.*\.json$/.test(f));
  for (const copy of schemaCopies) {
    if (copy !== CANONICAL_SCHEMA) {
      report("copied-schema", copy, `a second normative schema copy; ${CANONICAL_SCHEMA} is the only canonical schema in this repository`);
    }
  }
  if (!files.includes(CANONICAL_SCHEMA)) {
    report("copied-schema", CANONICAL_SCHEMA, "the canonical schema is missing from this repository");
  }
}

// ---- Copied CLI package source --------------------------------------------
for (const forbidden of ["packages/agents-audit", "packages/cli"]) {
  if (files.some((f) => f.startsWith(`${forbidden}/`))) {
    report("repository-boundary", forbidden, "CLI-owned package source present in workspacejson/standard");
  }
}

// ---- Package ownership and publication ------------------------------------
for (const file of files.filter((f) => /^packages\/[^/]+\/package\.json$/.test(f))) {
  let manifest;
  try { manifest = JSON.parse(read(file)); } catch { continue; }

  if (!STANDARD_OWNED_PACKAGES.includes(manifest.name)) {
    report("foreign-package", file, `${manifest.name} is not owned by workspacejson/standard (owns: ${STANDARD_OWNED_PACKAGES.join(", ")})`);
  }

  // A committed workspace: protocol is correct HERE, because spec and rules
  // live in the same pnpm workspace and pnpm rewrites it to the exact version
  // at pack time, proven against the published 0.4.4 tarball.
  // A *floating range* on a standard-owned package is not — the fixed release
  // group would stop being coherent.
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (!STANDARD_OWNED_PACKAGES.includes(dep)) continue;
      const isWorkspace = typeof range === "string" && range.startsWith("workspace:");
      const isExact = typeof range === "string" && /^\d+\.\d+\.\d+$/.test(range);
      if (!isWorkspace && !isExact) {
        report("unpinned-standard-dependency", file, `${field}.${dep}=${JSON.stringify(range)} must be an exact version or an intra-workspace link`);
      }
    }
  }
}

// ---- No workflow may be capable of publishing ------------------------------
// Publish authority for standard-owned packages still belongs to
// workspace-json/agents-audit until a coordinated cutover. This repository ships NO release
// workflow at all — see .github/RELEASE-AUTHORITY.md for why absence was chosen
// over a disabled file. These checks scan EVERY workflow, so publication cannot
// reappear under a different filename.
for (const workflow of files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f))) {
  const content = stripComments(workflow, read(workflow));

  if (/changeset\s+publish|npm\s+publish|pnpm\s+publish/.test(content)) {
    report("publish-authority", workflow, "workflow contains a publish step; this repository must be incapable of publishing until authority transfers");
  }
  if (/secrets\.NPM_TOKEN|NODE_AUTH_TOKEN/.test(content)) {
    report("publish-authority", workflow, "workflow references a publish credential; no npm credential may exist here until authority transfers");
  }
  if (/\bagents-audit\b/.test(content)) {
    report("foreign-publish", workflow, "workflow references agents-audit, which is published by workspacejson/cli");
  }
}

// ---- Changesets fixed group ------------------------------------------------
{
  const changesetConfig = ".changeset/config.json";
  if (files.includes(changesetConfig)) {
    let config;
    try { config = JSON.parse(read(changesetConfig)); } catch { config = null; }
    for (const group of config?.fixed ?? []) {
      for (const name of group) {
        if (!STANDARD_OWNED_PACKAGES.includes(name)) {
          report("foreign-publish", changesetConfig, `fixed release group contains ${name}, which this repository does not publish`);
        }
      }
    }
  }
}

// ---- Prescriptive policy ---------------------------------------------------
// workspace.json is descriptive: it reports what a repository IS, never what a
// team MUST do, and the committed file must be useful without a daemon.
{
  const PRESCRIPTIVE = [
    [/\benforce(ment)?Policy\b/, "enforcementPolicy"],
    [/\brequiredApproval/, "requiredApproval"],
    [/\bblockMerge\b/, "blockMerge"],
    [/\bmandatoryReview/, "mandatoryReview"],
    [/\bdaemonRequired\b/, "daemonRequired"],
    [/\brequiresDaemon\b/, "requiresDaemon"],
  ];
  const schema = files.includes(CANONICAL_SCHEMA) ? read(CANONICAL_SCHEMA) : "";
  for (const [pattern, name] of PRESCRIPTIVE) {
    if (pattern.test(schema)) {
      report("prescriptive-policy", CANONICAL_SCHEMA, `schema defines prescriptive field '${name}'; the standard is descriptive, never prescriptive`);
    }
  }
}

// ---- The four stable read paths --------------------------------------------
// Externally consumed and load-bearing. Extraction must not reshape them.
{
  if (files.includes(CANONICAL_SCHEMA)) {
    const schema = read(CANONICAL_SCHEMA);
    for (const path of ["fragileFiles", "coChangePatterns", "fileIndex", "frameworkManifest"]) {
      if (!schema.includes(path)) {
        report("stable-read-path", CANONICAL_SCHEMA, `stable read path '${path}' is absent from the schema; the four interoperability paths must remain`);
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`check-architecture: OK — ${files.length} tracked files, 0 violations.`);
  process.exit(0);
}

console.error(`check-architecture: ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  [${v.kind}] ${v.file}\n      ${v.message}`);
}
process.exit(1);
