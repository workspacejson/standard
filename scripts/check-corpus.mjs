#!/usr/bin/env node

// Normative path-identity corpus gate (ADR-006).
//
// Three properties, none of which the corpus file can guarantee about itself:
//
//   1. STRUCTURE. Every case has a unique id, a known kind, and the fields its
//      kind requires. Every `reason` a case cites is declared in the corpus's
//      own reason table — a typo'd reason is a classification that no
//      implementation can match.
//
//   2. COVERAGE. Every case class ADR-006 requires is present. Listed
//      explicitly, because a corpus silently missing a class is worse than one
//      that is obviously short: it reports coverage it does not have.
//
//   3. THE WATCHED-RED RECEIPT IS CURRENT. A fresh baseline run must reproduce
//      the committed receipt byte for byte. This is what makes the receipt
//      evidence rather than decoration: if the reproduced consumer behavior
//      changes, or someone quietly "fixes" the baseline copy, the receipt stops
//      matching and this fails.
//
// It deliberately does NOT check the corpus against a reference implementation.
// There is none yet — `validateStoredKey` is Phase 3. When it lands, its own
// tests consume this corpus and the disagreement count in the receipt is
// expected to fall to zero for the pure kinds. Until then the receipt records a
// defect that is real and unfixed, and this gate keeps it accurate.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(repoRoot, "conformance", "path-identity");
const corpus = JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8"));

const failures = [];
const fail = (m) => failures.push(m);

// ---- 1: structure -----------------------------------------------------------

const seen = new Set();
const kinds = new Set(Object.keys(corpus.kinds));
const reasons = new Set(Object.keys(corpus.reasons));

const REQUIRED_FIELDS = {
  storedKey: ["input", "expect"],
  identity: ["inputs", "expect"],
  matching: ["storedKey", "query", "expect"],
  hostQuery: ["scenario", "expect"],
  discovery: ["scenario", "expect"],
  acquisition: ["scenario", "expect"],
};

for (const c of corpus.cases) {
  if (!c.id) fail(`a case has no id`);
  if (seen.has(c.id)) fail(`duplicate case id: ${c.id}`);
  seen.add(c.id);

  if (!kinds.has(c.kind)) fail(`${c.id} — unknown kind '${c.kind}'`);
  for (const field of REQUIRED_FIELDS[c.kind] ?? []) {
    if (c[field] === undefined) fail(`${c.id} — kind '${c.kind}' requires field '${field}'`);
  }

  if (c.kind === "storedKey" && c.expect === "invalid" && !c.reason) {
    fail(`${c.id} — an invalid stored key must carry a reason, so implementations can classify identically`);
  }
  if (c.reason && !reasons.has(c.reason)) {
    fail(`${c.id} — reason '${c.reason}' is not declared in the corpus reason table`);
  }
  if (c.kind === "identity" && (!Array.isArray(c.inputs) || c.inputs.length !== 2)) {
    fail(`${c.id} — an identity case compares exactly two keys`);
  }
  // A case asserting a silent repair must say what it is repaired INTO, or the
  // claim cannot be checked.
  if (c.silentlyRepaired && !c.normalizingReaderYields) {
    fail(`${c.id} — silentlyRepaired requires normalizingReaderYields`);
  }
}

// ---- 2: coverage ------------------------------------------------------------
// Named individually. A count would pass while missing the case that matters.

const REQUIRED_CASES = [
  "stored/invalid/empty",
  "stored/invalid/dot",
  "stored/invalid/dotdot",
  "stored/invalid/escaping",
  "stored/invalid/interior-dotdot",
  "stored/invalid/interior-dotdot-roundtrip",
  "stored/invalid/absolute-posix",
  "stored/invalid/drive-letter",
  "stored/invalid/unc",
  "stored/invalid/backslash",
  "stored/invalid/leading-dot-slash",
  "stored/invalid/repeated-separator",
  "stored/invalid/trailing-separator",
  "stored/invalid/nul",
  "stored/invalid/unpaired-surrogate",
  "stored/valid/genuine-replacement-char",
  "acquisition/lossy-decode-detection",
  "identity/case-distinct",
  "identity/nfc-vs-nfd",
  "hostQuery/tracked-symlink-entry",
  "hostQuery/traversal-through-internal-symlink",
  "hostQuery/traversal-escapes-repository",
  "discovery/linked-worktree-is-its-own-root",
  "discovery/submodule-is-its-own-root",
  "discovery/no-ancestor-crossing",
  "matching/malformed-never-matches-repaired-value",
];
for (const id of REQUIRED_CASES) {
  if (!seen.has(id)) fail(`required case missing from the corpus: ${id}`);
}

// The case and Unicode classes must prove DISTINCT VALID IDENTITIES. A corpus
// that marked either spelling invalid, or collapsed the pair, would encode the
// defect it exists to prevent — so the shape is asserted, not assumed.
for (const id of ["identity/case-distinct", "identity/nfc-vs-nfd"]) {
  const c = corpus.cases.find((x) => x.id === id);
  if (!c) continue;
  if (c.expect !== "distinct") fail(`${id} — must expect 'distinct'`);
  for (const spelling of c.inputs ?? []) {
    const valid = corpus.cases.find(
      (x) => x.kind === "storedKey" && x.input === spelling && x.expect === "valid",
    );
    if (!valid) {
      fail(
        `${id} — the spelling ${JSON.stringify(spelling)} must also appear as a VALID storedKey case; ` +
          `a distinctness claim over a key the corpus never calls valid is unfalsifiable`,
      );
    }
  }
}

// ---- 3: the watched-red receipt is current ----------------------------------

const committed = readFileSync(join(dir, "receipt-baseline.json"), "utf8");
const fresh = execFileSync(process.execPath, [join(dir, "run-baseline.mjs")], { encoding: "utf8" });
if (committed !== fresh) {
  fail(
    "conformance/path-identity/receipt-baseline.json is stale — a fresh baseline run does not reproduce it. " +
      "Re-run `node conformance/path-identity/run-baseline.mjs --write` and review the diff: it means the " +
      "reproduced consumer behavior changed, which is exactly the event this receipt exists to catch.",
  );
}

const receipt = JSON.parse(committed);
if (receipt.totals.silentlyRepairedIntoAValidLookingKey === 0) {
  fail(
    "the receipt records zero silent repairs. Either the baseline no longer reproduces the shipped matcher, " +
      "or this file was edited to look clean. The defect is real until the consumers are fixed in their own repositories.",
  );
}

// ---- report -----------------------------------------------------------------

const byKind = corpus.cases.reduce((a, c) => ((a[c.kind] = (a[c.kind] ?? 0) + 1), a), {});
console.log("Path-identity corpus (ADR-006)");
console.log(`  cases               ${corpus.cases.length}`);
for (const [k, n] of Object.entries(byKind).sort()) console.log(`    ${k.padEnd(18)}${n}`);
console.log(`  required classes    ${REQUIRED_CASES.length}/${REQUIRED_CASES.length} present`);
console.log(
  `  watched-red         ${receipt.totals.disagrees} disagreement(s), ` +
    `${receipt.totals.silentlyRepairedIntoAValidLookingKey} silent repair(s) over ` +
    `${receipt.totals.runnable} runnable case(s)`,
);
console.log(`  not runnable here   ${receipt.totals.notRunnable} (filesystem, repository or raw-byte cases — owned per ADR-006 §10)`);

if (failures.length) {
  console.error(`\ncheck-corpus: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\nOK — corpus is structurally sound, covers every required class, and the watched-red receipt reproduces.");
