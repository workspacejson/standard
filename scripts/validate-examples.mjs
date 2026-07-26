#!/usr/bin/env node

// Executable examples gate (META-211).
//
// Every example this repository ships must validate against the package-owned
// schema, using the package's own validator — not a re-implementation. If an
// example contradicts the schema, this fails loudly. It must never be resolved
// by weakening the schema to make an example pass.
//
// Requires `pnpm --filter @workspacejson/spec build` first (uses dist/).

import { readdirSync, readFileSync, existsSync } from "node:fs";
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

const files = readdirSync(examplesDir).filter((f) => f.endsWith(".json")).sort();
if (files.length === 0) {
  console.error("No examples found — this gate would pass vacuously. Failing instead.");
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

if (failed) {
  console.error(`\n${failed} example(s) contradict the package schema.`);
  console.error("Do NOT weaken the schema to make an example pass — fix the example, or record the contradiction.");
  process.exit(1);
}
console.log(`\nOK — ${files.length}/${files.length} examples validate against the package-owned schema.`);
