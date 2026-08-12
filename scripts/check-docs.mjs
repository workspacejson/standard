#!/usr/bin/env node

// Documentation integrity gate.
//
// Polish decays. A README that was accurate when it was written drifts as files
// move, and a "cold reader can follow this" claim is worthless if nothing checks
// it. This gate makes four properties of the public surface mechanically
// verifiable instead of merely asserted:
//
//   1. Every relative Markdown link and image resolves to a file that exists.
//   2. Public prose does not carry internal tracker identifiers, which a public
//      reader cannot resolve. Provenance records are exempt — see PROVENANCE_FILES.
//   3. Every documented pnpm script actually exists in package.json.
//   4. Every prose enumeration of the four stable read paths is complete and
//      matches the schema. The paths are restated in several documents and the
//      architecture guard reads only source and config, so nothing else would
//      notice a prose copy going stale.
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
  "docs/adr/index.json",
  "docs/adr/001-canonical-artifact-path.md",
  "docs/adr/002-bounded-enrichment-program.md",
  "docs/adr/003-field-lifecycle-and-admission.md",
  "docs/adr/006-canonical-path-identity.md",
  // An evidence receipt must name the tracked work that froze the contract it
  // ran under, for the same reason the records above must. Enumerated per file:
  // a future evidence run does NOT inherit this, and has to argue for itself.
  "docs/evidence/meta-310/RECEIPT.md",
  // A production receipt records which tracked work set the visual and content
  // authority it was produced against, and which deviations were deferred to
  // which follow-on work. Strip those identifiers and the record no longer says
  // who to ask about an unresolved ruling. Same argument as the receipt above,
  // and enumerated per file on the same terms: a future asset pack does NOT
  // inherit this exemption.
  "assets/PRODUCTION-RECEIPT.md",
]);

// Historical release notes are a record of what was published, not live prose.
// Rewriting them to remove a reference would falsify the record.
const isChangelog = (f) => /(^|\/)CHANGELOG\.md$/.test(f);

// The producer stamps the identifier of the issue that specified its weighting
// algorithm into every scoring basis it emits, as `weightingVersion`. That
// string is DATA, not prose: editing it to satisfy this gate would ship an
// artifact that misreports which algorithm produced it, which is falsifying
// evidence to pass a style check.
//
// Scoped to the single producer-stamped member on its own line, by value, and
// deliberately NOT to any directory. An earlier version of this exemption
// skipped the whole `docs/evidence/` subtree; review found that overbroad,
// because it also waved through unrelated identifiers in human-authored
// evidence prose. Nothing else on any other line is exempted, and human prose
// that needs to name tracked work goes in PROVENANCE_FILES above, one
// enumerated file at a time, so each exemption stays a decision someone made.
//
// Fails closed: minified or reflowed JSON does not match, and must be justified
// rather than silently admitted.
const PRODUCER_STAMPED = /^\s*"weightingVersion":\s*"[^"]*"\s*,?\s*$/;

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
    if (PRODUCER_STAMPED.test(line)) return;
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

// ---- 4: enumerated stable read paths match the schema -----------------------

// The four stable read paths are a compatibility surface, so they are restated
// in several places a reader might arrive at first — AGENTS.md, GOVERNANCE.md,
// the Copilot instructions. The architecture guard only scans source and config,
// so none of those prose copies is checked by anything else: a path could be
// renamed in the schema and go on being documented under its old name.
//
// Two properties, both mechanical:
//   a. each path this repository calls stable still exists in the schema;
//   b. any prose that starts enumerating them enumerates all four, so a partial
//      list cannot drift into looking authoritative.
//
// Prose that merely refers to "the four stable read paths" without naming any is
// left alone — it carries no list that can rot.

const STABLE_READ_PATHS = [
  ["manual", "fragileFiles"],
  ["manual", "coChangePatterns"],
  ["generated", "fileIndex"],
  ["generated", "frameworkManifest"],
];

const schemaRelPath = "packages/spec/schema/v1.json";
const schema = JSON.parse(readFileSync(join(repoRoot, schemaRelPath), "utf8"));

for (const [parent, leaf] of STABLE_READ_PATHS) {
  const present = schema?.properties?.[parent]?.properties?.[leaf] !== undefined;
  if (!present) {
    fail(
      schemaRelPath,
      0,
      `stable read path '${parent}.${leaf}' is documented as a compatibility surface but is absent from the schema — ` +
        `remove it from the prose that enumerates it, or restore it`,
    );
  }
}

const MENTIONS_STABLE_PATHS = /stable read path/i;
let enumerationsChecked = 0;

for (const file of markdown) {
  const content = readFileSync(join(repoRoot, file), "utf8");
  if (!MENTIONS_STABLE_PATHS.test(content)) continue;

  const named = STABLE_READ_PATHS.filter(([parent, leaf]) =>
    content.includes(`${parent}.${leaf}`),
  );
  if (named.length === 0) continue; // refers to them without listing them

  enumerationsChecked++;
  if (named.length !== STABLE_READ_PATHS.length) {
    const missing = STABLE_READ_PATHS.filter(([p, l]) => !content.includes(`${p}.${l}`))
      .map(([p, l]) => `${p}.${l}`)
      .join(", ");
    fail(
      file,
      0,
      `enumerates stable read paths but omits ${missing} — a partial list reads as authoritative`,
    );
  }
}

// ---- report ----------------------------------------------------------------

console.log("Documentation integrity");
console.log(`  markdown files      ${markdown.length}`);
console.log(`  links checked       ${linksChecked}  (${relativeLinks} relative, resolved on disk; ${externalLinks} external, syntax only)`);
console.log(`  pnpm commands       ${commandsChecked} documented references verified against package.json`);
console.log(`  stable read paths   ${STABLE_READ_PATHS.length} confirmed in the schema; ${enumerationsChecked} prose enumerations complete`);
console.log(`  provenance files    ${PROVENANCE_FILES.size} exempt from the tracker-identifier rule`);
console.log(
  `  producer-stamped    weightingVersion admitted by value on its own line; no directory is exempt`,
);

if (failures.length) {
  console.error(`\ncheck-docs: ${failures.length} failure(s)\n`);
  for (const f of failures) {
    console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}\n      ${f.message}`);
  }
  process.exit(1);
}
console.log(
  "\nOK — every relative link resolves, no internal tracker identifiers in public prose, " +
    "every documented command exists, every enumerated stable read path matches the schema.",
);
