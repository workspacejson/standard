#!/usr/bin/env node

// Documentation integrity gate.
//
// Polish decays. A README that was accurate when it was written drifts as files
// move, and a "cold reader can follow this" claim is worthless if nothing checks
// it. This gate makes three properties of the public surface mechanically
// verifiable instead of merely asserted:
//
//   1. Every relative Markdown link and image resolves to a file that exists.
//   2. Public prose does not carry internal tracker identifiers, which a public
//      reader cannot resolve. Provenance records are exempt — see PROVENANCE_FILES.
//   3. Every documented pnpm script actually exists in package.json.
//
// External links are NOT fetched. A network check in CI fails on someone else's
// outage and trains everyone to ignore red. They are syntax-checked here and
// verified manually during review; the counts are reported either way.
//
// Exit 0 = clean. Exit 1 = failures, printed with file, line and reason.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
const fail = (file, line, message) => failures.push({ file, line, message });

function trackedFiles() {
  const result = spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

const files = trackedFiles();
const markdown = files.filter((f) => f.endsWith(".md"));

// Files whose whole purpose is to record where something came from. An audit
// trail that cannot name its own source is not an audit trail.
const PROVENANCE_FILES = new Set([
  "migration/PROVENANCE.md",
  "migration/commit-map.txt",
  "migration/parity-packed.mjs",
  "migration/parity-runtime.mjs",
  "docs/adr/README.md",
  "docs/adr/001-canonical-artifact-path.md",
  "docs/adr/002-bounded-enrichment-program.md",
  "docs/adr/003-field-lifecycle-and-admission.md",
]);

// Historical release notes are a record of what was published, not live prose.
// Rewriting them to remove a reference would falsify the record.
const isChangelog = (f) => /(^|\/)CHANGELOG\.md$/.test(f);

// This file names the pattern in order to forbid it.
const SELF = "scripts/check-docs.mjs";

const INTERNAL_ID = /\b(?:META|VR|HAC|GTM)-\d+\b/g;

// ---- 1 + 2: per-file Markdown checks ---------------------------------------

let linksChecked = 0;
let relativeLinks = 0;
let externalLinks = 0;

for (const file of markdown) {
  const content = readFileSync(join(repoRoot, file), "utf8");
  const lines = content.split("\n");
  const fileDir = dirname(join(repoRoot, file));

  // Strip fenced code blocks before link and identifier matching. A code sample
  // is an illustration, not a claim about this repository.
  let inFence = false;
  const prose = lines.map((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return ""; }
    return inFence ? "" : line;
  });

  prose.forEach((line, index) => {
    const lineNumber = index + 1;

    // ---- links and images
    // Matches [text](target) and ![alt](target). Bare autolinks are skipped:
    // they are always external and carry no relative-path risk.
    for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      linksChecked++;

      if (/^(https?:|mailto:)/.test(target)) {
        externalLinks++;
        if (/^http:/.test(target)) {
          fail(file, lineNumber, `insecure http link: ${target}`);
        }
        continue;
      }
      if (target.startsWith("#")) continue; // same-document anchor

      relativeLinks++;
      const [path] = target.split("#");
      if (!path) continue;
      const resolved = resolve(fileDir, decodeURIComponent(path));

      if (!existsSync(resolved)) {
        fail(file, lineNumber, `relative link target does not exist: ${target}`);
        continue;
      }
      // A link to a directory must point at something a reader can land on.
      if (statSync(resolved).isDirectory() && !existsSync(join(resolved, "README.md"))) {
        const inRepo = relative(repoRoot, resolved);
        if (!files.some((f) => f.startsWith(`${inRepo}/`))) {
          fail(file, lineNumber, `relative link points at an empty or untracked directory: ${target}`);
        }
      }
    }

    // ---- internal tracker identifiers
    if (file === SELF || PROVENANCE_FILES.has(file) || isChangelog(file)) return;
    for (const match of line.matchAll(INTERNAL_ID)) {
      fail(
        file,
        lineNumber,
        `internal tracker identifier '${match[0]}' in public prose — a public reader cannot resolve it. ` +
          `Describe the work instead, or record it in migration/PROVENANCE.md.`,
      );
    }
  });
}

// Non-Markdown tracked text is held to the identifier rule too, so an internal
// reference cannot simply move into a workflow comment or a script header.
for (const file of files.filter((f) => /\.(ya?ml|json|mjs|js|ts)$/.test(f))) {
  if (file === SELF || PROVENANCE_FILES.has(file)) continue;
  const content = readFileSync(join(repoRoot, file), "utf8");
  content.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(INTERNAL_ID)) {
      fail(file, index + 1, `internal tracker identifier '${match[0]}' — describe the work instead`);
    }
  });
}

// ---- 3: documented commands exist ------------------------------------------

const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const rootScripts = new Set(Object.keys(rootManifest.scripts ?? {}));

let commandsChecked = 0;
for (const file of markdown) {
  const content = readFileSync(join(repoRoot, file), "utf8");
  for (const match of content.matchAll(/\bpnpm run ([a-z][a-z0-9:-]*)/g)) {
    commandsChecked++;
    if (!rootScripts.has(match[1])) {
      fail(file, 0, `documents 'pnpm run ${match[1]}', which is not a script in the root package.json`);
    }
  }
}

// ---- report ----------------------------------------------------------------

console.log("Documentation integrity");
console.log(`  markdown files      ${markdown.length}`);
console.log(`  links checked       ${linksChecked}  (${relativeLinks} relative, resolved on disk; ${externalLinks} external, syntax only)`);
console.log(`  pnpm commands       ${commandsChecked} documented references verified against package.json`);
console.log(`  provenance files    ${PROVENANCE_FILES.size} exempt from the tracker-identifier rule`);

if (failures.length) {
  console.error(`\ncheck-docs: ${failures.length} failure(s)\n`);
  for (const f of failures) {
    console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}\n      ${f.message}`);
  }
  process.exit(1);
}
console.log("\nOK — every relative link resolves, no internal tracker identifiers in public prose, every documented command exists.");
