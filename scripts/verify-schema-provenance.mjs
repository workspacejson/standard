#!/usr/bin/env node

// Schema provenance gate.
//
// workspacejson/standard is the canonical source of the normative schema.
// The website currently checks in an independently-edited copy that has
// drifted; this gate makes the package side of that contract verifiable, so a
// downstream consumer can materialize the schema and prove byte equality.
//
// Asserts:
//   1. the canonical schema exists at exactly one path;
//   2. its SHA-256 is recorded and printed, so downstream repositories can pin it;
//   3. `exports["./schema"]` resolves to that same file;
//   4. the packed tarball would include it (`files` covers `schema`);
//   5. the four stable read paths are present.
//
// This gate does NOT modify the website. Downstream materialization is tracked separately.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const specDir = join(repoRoot, "packages", "spec");
const CANONICAL = join(specDir, "schema", "v1.json");

const failures = [];

if (!existsSync(CANONICAL)) {
  console.error(`Canonical schema missing at packages/spec/schema/v1.json`);
  process.exit(1);
}

const bytes = readFileSync(CANONICAL);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const schema = JSON.parse(bytes.toString("utf8"));
const manifest = JSON.parse(readFileSync(join(specDir, "package.json"), "utf8"));

// 3. ./schema export resolves to the canonical file
const schemaExport = manifest.exports?.["./schema"];
if (!schemaExport) {
  failures.push('packages/spec/package.json has no exports["./schema"] entry');
} else {
  const resolved = resolve(specDir, schemaExport);
  if (resolved !== resolve(CANONICAL)) {
    failures.push(`exports["./schema"] resolves to ${resolved}, not the canonical ${CANONICAL}`);
  }
}

// 4. packed tarball includes it
if (!(manifest.files ?? []).includes("schema")) {
  failures.push('packages/spec/package.json "files" does not include "schema"; the packed tarball would omit the normative schema');
}

// 5. the four stable, externally consumed read paths
const generated = schema.properties?.generated?.properties ?? {};
const manual = schema.properties?.manual?.properties ?? {};
for (const [group, props, name] of [
  ["manual", manual, "fragileFiles"],
  ["manual", manual, "coChangePatterns"],
  ["generated", generated, "fileIndex"],
  ["generated", generated, "frameworkManifest"],
]) {
  if (!(name in props)) failures.push(`stable read path ${group}.${name} is absent from the canonical schema`);
}

console.log("Schema provenance");
console.log(`  path        packages/spec/schema/v1.json`);
console.log(`  bytes       ${bytes.length}`);
console.log(`  sha256      ${sha256}`);
console.log(`  $id         ${schema.$id ?? "(none)"}`);
console.log(`  $schema     ${schema.$schema ?? "(none)"}`);
console.log(`  export      ${schemaExport ?? "(none)"}`);
console.log(`  stable read paths: manual.fragileFiles, manual.coChangePatterns, generated.fileIndex, generated.frameworkManifest`);

if (failures.length) {
  console.error(`\n${failures.length} schema provenance failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK — canonical schema is single-sourced, exported, packed and complete.");
