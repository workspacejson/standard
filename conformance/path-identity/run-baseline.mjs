#!/usr/bin/env node

// Watched-red harness: runs the normative corpus against the CURRENT shipped
// matcher behavior and records what it does.
//
//   node conformance/path-identity/run-baseline.mjs           print the receipt
//   node conformance/path-identity/run-baseline.mjs --write   rewrite receipt-baseline.json
//
// This measures the defect. It asserts nothing and gates nothing — the gate is
// `conformance/path-identity/corpus.test.mjs`, which compares a fresh run
// against the committed receipt so the defect cannot change unobserved.
//
// Only `storedKey`, `identity` and `matching` cases are runnable here: they are
// pure string operations. `hostQuery`, `discovery` and `acquisition` cases need
// a filesystem, a repository, or raw bytes, and are carried by the corpus for
// the implementations that own them (§10). They are counted as `not-runnable`
// rather than skipped silently — a harness that quietly drops two thirds of a
// corpus reports coverage it does not have.

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

const PURE_KINDS = new Set(["storedKey", "identity", "matching"]);

const results = [];
for (const c of corpus.cases) {
  if (!PURE_KINDS.has(c.kind)) {
    results.push({ id: c.id, kind: c.kind, outcome: "not-runnable" });
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

const runnable = results.filter((r) => r.outcome !== "not-runnable");
const disagreements = runnable.filter((r) => r.outcome === "disagrees");
const silentRepairs = results.filter((r) => r.silentlyRepaired);

const receipt = {
  $comment:
    "WATCHED-RED EVIDENCE. Produced by run-baseline.mjs against the matcher behavior shipping today. Every entry under `disagreements` is a case where the current consumers depart from ADR-006. This file records the defect; it is not a target.",
  corpusVersion: corpus.corpusVersion,
  totals: {
    cases: corpus.cases.length,
    runnable: runnable.length,
    notRunnable: results.length - runnable.length,
    agrees: runnable.length - disagreements.length,
    disagrees: disagreements.length,
    silentlyRepairedIntoAValidLookingKey: silentRepairs.length,
  },
  silentRepairs: silentRepairs.map((r) => ({ id: r.id, storedAs: r.baselineKey })),
  disagreements: disagreements.map((r) => {
    const { outcome, ...rest } = r;
    return rest;
  }),
  notRunnable: results
    .filter((r) => r.outcome === "not-runnable")
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
