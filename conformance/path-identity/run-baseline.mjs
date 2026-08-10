#!/usr/bin/env node

// Watched-red harness: runs the normative corpus against the matcher behavior
// OBSERVED AT THE PINNED REVISIONS and records what it did.
//
//   node conformance/path-identity/run-baseline.mjs           print the receipt
//   node conformance/path-identity/run-baseline.mjs --write   rewrite receipt-baseline.json
//
// This measures a historical defect. It asserts nothing and gates nothing — the
// gate is `scripts/check-corpus.mjs`, which compares a fresh run against the
// committed receipt so the frozen specimen cannot drift unobserved.
//
// This harness EXECUTES the three pure kinds — `storedKey`, `identity` and
// `matching`. The other three are DELEGATED to their ADR-006 §10 owners:
// `hostQuery` and `discovery` need a filesystem and a repository, `acquisition`
// needs raw bytes. Delegated does not mean unrunnable — each such case carries a
// complete machine-readable `fixture` so its owner can construct it without
// inventing semantics. They are counted as `delegated` rather than skipped
// silently: of 59 cases, 45 are executed here and 14 are delegated, spanning
// 3 of the corpus's 6 kinds.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  baselineAdmitStoredKey,
  baselineNormalizeKey,
  baselinePathsMatch,
} from "./baseline-normalize.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));

const EXECUTED_HERE = new Set(corpus.delegation.executedHere);

const results = [];
for (const c of corpus.cases) {
  if (!EXECUTED_HERE.has(c.kind)) {
    results.push({ id: c.id, kind: c.kind, outcome: "delegated" });
    continue;
  }

  if (c.kind === "storedKey") {
    const { normalized, admitted } = baselineAdmitStoredKey(c.input);
    // The baseline "admits" a key when its post-normalization form passes the
    // shipped validity check. Agreement with the corpus is judged on the
    // ADMISSION decision, which is what reaches a lookup.
    const baselineSaysValid = admitted;
    const corpusSaysValid = c.expect === "valid";
    results.push({
      id: c.id,
      kind: c.kind,
      outcome: baselineSaysValid === corpusSaysValid ? "agrees" : "disagrees",
      baselineAdmitted: baselineSaysValid,
      corpusExpects: c.expect,
      // The heart of it: the stored key the baseline would actually look up.
      baselineKey: normalized,
      mutated: normalized !== c.input,
      silentlyRepaired: Boolean(c.silentlyRepaired) && baselineSaysValid,
    });
    continue;
  }

  if (c.kind === "identity") {
    const [a, b] = c.inputs;
    const collapsed = baselineNormalizeKey(a) === baselineNormalizeKey(b);
    results.push({
      id: c.id,
      kind: c.kind,
      outcome: collapsed ? "disagrees" : "agrees",
      baselineTreatsAsSameKey: collapsed,
      corpusExpects: c.expect,
    });
    continue;
  }

  const matched = baselinePathsMatch(c.query, c.storedKey);
  const corpusExpectsMatch = c.expect === "match";
  results.push({
    id: c.id,
    kind: c.kind,
    outcome: matched === corpusExpectsMatch ? "agrees" : "disagrees",
    baselineMatched: matched,
    corpusExpects: c.expect,
  });
}

const executed = results.filter((r) => r.outcome !== "delegated");
const disagreements = executed.filter((r) => r.outcome === "disagrees");
const silentRepairs = results.filter((r) => r.silentlyRepaired);

const receipt = {
  $comment:
    "WATCHED-RED EVIDENCE. A historical defect witness. Produced by run-baseline.mjs against a frozen reproduction of the matcher behavior OBSERVED AT THE PINNED REVISIONS below. Every entry under `disagreements` is a case where that behavior departed from ADR-006. This file records a defect; it is not a target. It cannot detect a future regression in either consumer — it never executes them. Those repositories detect their own regressions by running this corpus against their actual implementations.",
  corpusVersion: corpus.corpusVersion,
  provenance: {
    kind: "historical-defect-witness",
    observedOn: "2026-08-09",
    byteIdenticalAcrossRepositories: true,
    byteIdentityVerifiedWith: "diff -q",
    observedAt: [
      {
        repository: "workspacejson/integrations",
        revision: "219d3322f4fe39d21ae8a8b15b5634764b90df2c",
        sourcePaths: ["src/path-match.ts", "extension/src/pathMatch.ts"],
      },
      {
        repository: "workspace-json/codex-mcp",
        revision: "ddcd7b70ac231b1d8ec559bf69eea90ad8dd615d",
        sourcePaths: ["src/path-match.ts", "extension/src/pathMatch.ts"],
      },
    ],
    reproducedSymbols: ["normalizeKey", "pathsMatch", "isValidRelativeKey"],
    orderingObservedAt: "extension/src/parseSnapshot.ts:66,88,147",
    limitation:
      "A frozen copy. It never executes either consumer, so it establishes what shipped at the pinned revisions and nothing about any later revision.",
  },
  totals: {
    cases: corpus.cases.length,
    executedHere: executed.length,
    delegated: results.length - executed.length,
    agrees: executed.length - disagreements.length,
    disagrees: disagreements.length,
    silentlyRepairedIntoAValidLookingKey: silentRepairs.length,
  },
  silentRepairs: silentRepairs.map((r) => ({ id: r.id, storedAs: r.baselineKey })),
  disagreements: disagreements.map((r) => {
    const { outcome, ...rest } = r;
    return rest;
  }),
  delegated: results
    .filter((r) => r.outcome === "delegated")
    .reduce((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1;
      return acc;
    }, {}),
};

const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
const receiptPath = join(here, "receipt-baseline.json");

if (process.argv.includes("--write")) {
  writeFileSync(receiptPath, serialized);
  console.log(`receipt written — ${disagreements.length} disagreement(s), ${silentRepairs.length} silent repair(s)`);
} else {
  process.stdout.write(serialized);
}
