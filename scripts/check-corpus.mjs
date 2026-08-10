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
//   3. DELEGATED CASES ARE PORTABLE. Every `hostQuery`, `discovery` and
//      `acquisition` case carries a complete machine-readable fixture. These
//      cases are not executed here — they are executed by their ADR-006 §10
//      owners — and a downstream harness that has to invent inputs after seeing
//      its own implementation is not consuming one normative corpus.
//
//   4. THE FROZEN SPECIMEN HAS NOT DRIFTED. A fresh baseline run must reproduce
//      the committed receipt byte for byte, and the receipt must carry its
//      revision pins. This keeps the historical claim honest.
//
// WHAT THIS GATE DOES NOT DO. It cannot detect a regression in `integrations`
// or `codex-mcp`. The baseline is a frozen copy and never executes either
// consumer; it supports a claim about the pinned revisions and nothing later.
// Those repositories detect their own regressions by running this corpus
// against their actual implementations.
//
// It also does not check the corpus against a reference implementation, because
// there is none yet. When the standard-owned validator lands, its tests consume
// this corpus and the disagreement count is expected to fall to zero for the
// executed kinds.

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
  hostQuery: ["scenario", "expect", "fixture"],
  discovery: ["scenario", "expect", "fixture"],
  acquisition: ["scenario", "expect", "fixture"],
};

// The minimum a downstream harness needs in order to CONSTRUCT the case. Prose
// alone would force every consumer to invent its own inputs, which is the
// opposite of one normative corpus.
const REQUIRED_FIXTURE_FIELDS = {
  hostQuery: ["repositoryRoot", "trackedEntries", "filesystem", "inputPath"],
  discovery: ["repositories", "queryOrigin"],
  acquisition: ["acquisitionMode"],
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

  // ---- delegated cases must be portable
  const fixtureFields = REQUIRED_FIXTURE_FIELDS[c.kind];
  if (fixtureFields) {
    for (const field of fixtureFields) {
      if (c.fixture?.[field] === undefined) {
        fail(`${c.id} — delegated case fixture is missing '${field}'; a downstream harness would have to invent it`);
      }
    }
    // An outcome is not portable either unless the expected result is stated in
    // the same machine-readable terms the owner will produce.
    if (c.expect === "key" && !c.expectedKey) {
      fail(`${c.id} — expects a key but does not say which one`);
    }
    if (c.expect === "unsupported" && !c.expectedReason) {
      fail(`${c.id} — expects unsupported but names no reason classification`);
    }
    if (c.kind === "discovery" && c.expectedRoot === undefined) {
      fail(`${c.id} — a discovery case must state expectedRoot, including when the answer is no artifact`);
    }
    if (c.kind === "acquisition" && c.expect !== "requires-raw-bytes" && !c.expectedFailure && c.expectedDecoded === undefined) {
      fail(`${c.id} — an acquisition case must state either expectedDecoded or expectedFailure`);
    }
    for (const declared of [c.expectedReason, c.expectedFailure].filter(Boolean)) {
      if (!(declared in (corpus.delegation?.failureClassifications ?? {}))) {
        fail(`${c.id} — '${declared}' is not a declared failure classification`);
      }
    }
  }
}

// The delegation map must agree with the cases actually present, or the counts
// this gate reports are fiction.
{
  const executedHere = new Set(corpus.delegation?.executedHere ?? []);
  const delegated = new Set(corpus.delegation?.delegated ?? []);
  for (const k of kinds) {
    if (!executedHere.has(k) && !delegated.has(k)) fail(`kind '${k}' is in neither executedHere nor delegated`);
    if (executedHere.has(k) && delegated.has(k)) fail(`kind '${k}' is in both executedHere and delegated`);
  }
  for (const k of [...executedHere, ...delegated]) {
    if (!kinds.has(k)) fail(`delegation names unknown kind '${k}'`);
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

// The receipt is a historical claim, so it must name what it observed.
{
  const r = JSON.parse(committed);
  const prov = r.provenance;
  if (!prov) fail("receipt-baseline.json carries no provenance block — an undated, unpinned claim is not evidence");
  else {
    if (prov.kind !== "historical-defect-witness") fail("receipt provenance.kind must be 'historical-defect-witness'");
    if (!prov.limitation) fail("receipt provenance must state its limitation");
    const pins = prov.observedAt ?? [];
    if (pins.length === 0) fail("receipt provenance names no observation points");
    for (const pin of pins) {
      if (!pin.repository) fail("a receipt provenance entry has no repository");
      if (!/^[0-9a-f]{40}$/.test(pin.revision ?? "")) {
        fail(`receipt provenance for ${pin.repository ?? "?"} needs a full 40-character revision, not ${JSON.stringify(pin.revision)}`);
      }
      if (!Array.isArray(pin.sourcePaths) || pin.sourcePaths.length === 0) {
        fail(`receipt provenance for ${pin.repository ?? "?"} lists no source paths`);
      }
    }
  }
}
const fresh = execFileSync(process.execPath, [join(dir, "run-baseline.mjs")], { encoding: "utf8" });
if (committed !== fresh) {
  fail(
    "conformance/path-identity/receipt-baseline.json is stale — a fresh baseline run does not reproduce it. " +
      "Re-run `node conformance/path-identity/run-baseline.mjs --write` and review the diff: either the corpus " +
      "changed, or the frozen specimen was edited and no longer reflects the pinned revisions.",
  );
}

const receipt = JSON.parse(committed);
if (receipt.totals.silentlyRepairedIntoAValidLookingKey === 0) {
  // The specimen is deliberately defective and must stay that way. A clean
  // reading here means the frozen copy stopped reproducing what was observed at
  // the pinned revisions, or that the evidence was edited — not that anything
  // downstream was fixed.
  fail(
    "the receipt records zero silent repairs. The historical specimen is intentionally defective; a clean " +
      "reading means the frozen reproduction drifted from the pinned revisions, or the receipt was edited.",
  );
}

// ---- report -----------------------------------------------------------------

const byKind = corpus.cases.reduce((a, c) => ((a[c.kind] = (a[c.kind] ?? 0) + 1), a), {});
console.log("Path-identity corpus (ADR-006)");
console.log(`  cases               ${corpus.cases.length}`);
for (const [k, n] of Object.entries(byKind).sort()) console.log(`    ${k.padEnd(18)}${n}`);
console.log(`  required classes    ${REQUIRED_CASES.length}/${REQUIRED_CASES.length} present`);
console.log(`  executed here       ${receipt.totals.executedHere}  (${corpus.delegation.executedHere.join(", ")})`);
console.log(`  delegated           ${receipt.totals.delegated}  (${corpus.delegation.delegated.join(", ")}) — portable fixtures verified`);
console.log(
  `  historical witness  ${receipt.totals.disagrees} disagreement(s), ` +
    `${receipt.totals.silentlyRepairedIntoAValidLookingKey} silent repair(s) at the pinned revisions`,
);
for (const pin of receipt.provenance.observedAt) {
  console.log(`                      ${pin.repository} @ ${pin.revision.slice(0, 8)}  [${pin.sourcePaths.join(", ")}]`);
}

if (failures.length) {
  console.error(`\ncheck-corpus: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  "\nOK — corpus is structurally sound, covers every required class, every delegated case is portable, " +
    "and the historical witness reproduces at its pinned revisions.",
);
