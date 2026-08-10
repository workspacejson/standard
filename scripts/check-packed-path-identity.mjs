#!/usr/bin/env node

// Packed-artifact proof for `validateStoredKey`.
//
// Source tests prove the logic. They do not prove that a CONSUMER gets it:
// `files`, the `exports` map, the emitted declaration and the build output all
// sit between `src/` and an installed package, and each of them has broken a
// release somewhere. This packs the tarball, installs it into a throwaway
// directory, imports it the way a consumer would, and runs the normative corpus
// through the export that actually shipped.
//
// The corpus is read from THIS repository, not from the tarball — it is not
// packaged, deliberately. The implementation under test comes from the tarball;
// the vectors come from the repository. That split is the point: it proves the
// shipped artifact satisfies the published contract.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const specDir = join(repoRoot, "packages", "spec");
const corpus = JSON.parse(
  readFileSync(join(repoRoot, "conformance", "path-identity", "corpus.json"), "utf8"),
);

const work = mkdtempSync(join(tmpdir(), "wsjson-packed-"));
let failures = [];

try {
  console.log("Packed-artifact proof — validateStoredKey");

  // 1. Pack exactly what a release would publish.
  execFileSync("npm", ["pack", "--pack-destination", work, "--silent"], {
    cwd: specDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack produced no tarball");
  console.log(`  packed              ${tarball}`);

  // 2. Install it as a consumer would, with no workspace linking.
  const consumer = join(work, "consumer");
  execFileSync("mkdir", ["-p", consumer]);
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "packed-consumer", private: true, type: "module", version: "0.0.0" }, null, 2)}\n`,
  );
  execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund", join(work, tarball)], {
    cwd: consumer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(`  installed           into a throwaway consumer`);

  // 3. Import through the package name and run the corpus.
  const probe = join(consumer, "probe.mjs");
  writeFileSync(
    probe,
    `import { validateStoredKey } from "@workspacejson/spec";
import { readFileSync } from "node:fs";
const corpus = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = { exportType: typeof validateStoredKey, results: [] };
for (const c of corpus.cases.filter((x) => x.kind === "storedKey")) {
  const r = validateStoredKey(c.input);
  out.results.push({ id: c.id, valid: r.valid, reason: r.reason ?? null, key: r.key ?? null });
}
process.stdout.write(JSON.stringify(out));
`,
  );
  const raw = execFileSync(
    process.execPath,
    [probe, join(repoRoot, "conformance", "path-identity", "corpus.json")],
    { cwd: consumer, encoding: "utf8" },
  );
  const observed = JSON.parse(raw);

  if (observed.exportType !== "function") {
    failures.push(`the packed package does not export validateStoredKey as a function (got ${observed.exportType})`);
  }

  // 4. Compare against the corpus, from the packed artifact's answers.
  const byId = new Map(observed.results.map((r) => [r.id, r]));
  let checked = 0;
  for (const c of corpus.cases.filter((x) => x.kind === "storedKey")) {
    const r = byId.get(c.id);
    checked += 1;
    if (!r) {
      failures.push(`${c.id} — the packed artifact returned no result`);
      continue;
    }
    if (r.valid !== (c.expect === "valid")) {
      failures.push(`${c.id} — packed artifact says valid=${r.valid}, corpus expects ${c.expect}`);
    }
    if (c.expect === "invalid" && r.reason !== c.reason) {
      failures.push(`${c.id} — packed artifact reason '${r.reason}', corpus declares '${c.reason}'`);
    }
    if (c.expect === "valid" && r.key !== c.input) {
      failures.push(`${c.id} — packed artifact returned a different key than the input`);
    }
    if (c.expect === "invalid" && r.key !== null) {
      failures.push(`${c.id} — packed artifact exposed a key on a rejection`);
    }
  }
  console.log(`  corpus vectors      ${checked}/${checked} run through the packed export`);
  console.log(`  export type         ${observed.exportType}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\ncheck-packed-path-identity: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\nOK — the packed artifact exports validateStoredKey and satisfies every storedKey vector.");
