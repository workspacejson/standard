#!/usr/bin/env node

// Executable examples gate.
//
// Every example this repository ships must validate against the package-owned
// schema, using the package's own validator — not a re-implementation. If an
// example contradicts the schema, this fails loudly. It must never be resolved
// by weakening the schema to make an example pass.
//
// Two directions, because one of them proves nothing on its own:
//
//   examples/*.json          MUST validate.
//   examples/invalid/*.json  MUST be rejected.
//
// Positive examples alone show that valid documents pass; they cannot show that
// invalid ones fail, and a schema that accepts everything would pass a
// positives-only gate perfectly.
//
// THE TWO REJECTION CHECKS ARE NOT EQUALLY INFORMATIVE, and conflating them
// overstates the evidence:
//
//   `validate()`       — SUBSTANTIVE. This is the assertion that the current
//                        schema rejects the named defect.
//   `validateLegacy()` — STRUCTURAL. It does NOT inspect the defect at all: it
//                        keys on the ABSENCE of `generated.specVersion`, so it
//                        rejects every one of these fixtures for carrying a
//                        v0.4 profile declaration, defect or no defect. What it
//                        covers is that a rejected v0.4 document cannot be
//                        re-admitted through the legacy path — real coverage,
//                        but of a different property.
//
// Both are still required, because a fixture accepted by either would reach a
// consumer. Only the first says anything about the defect the fixture is named
// for. Each negative fixture carries a `generated.$comment` naming that single
// defect — `generated` is `additionalProperties: true`, so the comment is not
// itself the reason for rejection. Attribution to the named defect rather than
// to incidental breakage is pinned by the one-field perturbation tests in
// `packages/spec/src/index.test.ts`, not by this gate.
//
// Requires `pnpm --filter @workspacejson/spec build` first (uses dist/).

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const specDir = join(repoRoot, "packages", "spec");
const examplesDir = join(specDir, "examples");
const distEntry = join(specDir, "dist", "index.js");

if (!existsSync(distEntry)) {
  console.error("packages/spec/dist/index.js is missing — build @workspacejson/spec before validating examples.");
  process.exit(1);
}

const spec = await import(pathToFileURL(distEntry).href);

if (!existsSync(examplesDir)) {
  console.error("packages/spec/examples is missing.");
  process.exit(1);
}

const invalidDir = join(examplesDir, "invalid");

const jsonIn = (dir) =>
  existsSync(dir) && statSync(dir).isDirectory()
    ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    : [];

const files = jsonIn(examplesDir);
if (files.length === 0) {
  console.error("No examples found — this gate would pass vacuously. Failing instead.");
  process.exit(1);
}

const negatives = jsonIn(invalidDir);
if (negatives.length === 0) {
  console.error(
    "No negative examples found in examples/invalid — a positives-only gate cannot show that " +
      "invalid documents are rejected. Failing instead.",
  );
  process.exit(1);
}

let failed = 0;
console.log(`Validating ${files.length} shipped example(s) against the package-owned schema\n`);

for (const file of files) {
  const data = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
  const declaredVersion = data?.generated?.specVersion ?? "(none)";

  // Each example declares which profile it demonstrates via generated.specVersion.
  // validate() accepts the currently supported profiles; validateLegacy() covers
  // the pre-v0.3 shape.
  const strict = spec.validate(data);
  const legacy = typeof spec.validateLegacy === "function" ? spec.validateLegacy(data) : false;
  const ok = strict || legacy;

  const how = strict ? "validate()" : legacy ? "validateLegacy()" : "REJECTED";
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${file}  specVersion=${declaredVersion}  via ${how}`);
  if (!ok) failed++;
}

console.log(
  `\nRejecting ${negatives.length} negative fixture(s)\n` +
    `  validate()      the substantive check: the current schema rejects the named defect\n` +
    `  validateLegacy() structural only: keys on absent generated.specVersion, so it rejects\n` +
    `                  every v0.4 fixture regardless of defect. Required, but not evidence\n` +
    `                  about the defect itself.\n`,
);

for (const file of negatives) {
  const data = JSON.parse(readFileSync(join(invalidDir, file), "utf8"));
  const strict = spec.validate(data);
  const legacy = typeof spec.validateLegacy === "function" ? spec.validateLegacy(data) : false;
  const rejected = !strict && !legacy;

  const why = data?.generated?.$comment ?? "(no defect recorded)";
  const accepted = strict
    ? "validate() ACCEPTED it — the current schema does not reject this defect"
    : "validateLegacy() ACCEPTED it — the document is being read as pre-v0.3";
  console.log(`  ${rejected ? "PASS" : "FAIL"}  invalid/${file}  [validate() rejected${legacy ? "" : "; legacy path closed"}]`);
  console.log(`          ${rejected ? why : `${why}\n          but ${accepted}`}`);
  if (!rejected) failed++;
}

if (failed) {
  console.error(`\n${failed} example(s) contradict the package schema.`);
  console.error("Do NOT weaken the schema to make an example pass — fix the example, or record the contradiction.");
  console.error("Do NOT delete a negative fixture the validator stopped rejecting — that is the regression it exists to catch.");
  process.exit(1);
}
console.log(
  `\nOK — ${files.length}/${files.length} examples validate; ` +
    `${negatives.length}/${negatives.length} negative fixtures are rejected by the package-owned ` +
    `schema, and none is reachable through the legacy path.`,
);
