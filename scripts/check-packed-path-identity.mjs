#!/usr/bin/env node

// Packed-artifact proof for the ADR-006 stored-key surface:
// `validateStoredKey` AND `inspectStoredKeys`.
//
// Source tests prove the logic. They do not prove that a CONSUMER gets it:
// `files`, the `exports` map, the emitted declaration and the build output all
// sit between `src/` and an installed package, and each of them has broken a
// release somewhere. This packs the tarball, installs it into a throwaway
// directory, imports it the way a consumer would, and runs the normative corpus
// through the exports that actually shipped.
//
// Two things are proven from the tarball, not one:
//
//   1. every `storedKey` vector, through `validateStoredKey`;
//   2. every one of those vectors again, this time embedded on all four ratified
//      path-bearing surfaces of a real document, through `inspectStoredKeys` —
//      with the pointer, surface, verbatim `rawKey` and corpus-declared reason
//      checked on each finding.
//
// The corpus is read from THIS repository, not from the tarball — it is not
// packaged, deliberately. The implementation under test comes from the tarball;
// the vectors come from the repository. That split is the point: it proves the
// shipped artifact satisfies the published contract.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const specDir = join(repoRoot, "packages", "spec");
const corpusPath = join(repoRoot, "conformance", "path-identity", "corpus.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

const storedKeyCases = corpus.cases.filter((c) => c.kind === "storedKey");
const invalidCases = storedKeyCases.filter((c) => c.expect === "invalid");
const declaredReason = new Map(invalidCases.map((c) => [c.input, c.reason]));

// The four ratified surfaces. `manual.coChangePatterns` is absent on purpose —
// ADR-003 A-005 has not ratified its item shape, so nothing here may assume one.
const SURFACES = [
  "generated.fileIndex",
  "generated.coChange[].files[]",
  "generated.fragility[].file",
  "manual.fragileFiles[].path",
];

const work = mkdtempSync(join(tmpdir(), "wsjson-packed-"));
let failures = [];

try {
  console.log("Packed-artifact proof — validateStoredKey + inspectStoredKeys");

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

  // 3. Import through the package name and run both exports.
  //
  //    The probe builds its documents from the corpus rather than from a
  //    hardcoded fixture, so the occurrence counts reported below are derived
  //    from the same vectors the validator half is checked against.
  const probe = join(consumer, "probe.mjs");
  writeFileSync(
    probe,
    `import { validateStoredKey, inspectStoredKeys, validate, validateV4 } from "@workspacejson/spec";
import { readFileSync } from "node:fs";

const corpus = JSON.parse(readFileSync(process.argv[2], "utf8"));
const storedKeyCases = corpus.cases.filter((x) => x.kind === "storedKey");
const inputs = storedKeyCases.map((c) => c.input);
const invalid = storedKeyCases.filter((c) => c.expect === "invalid").map((c) => c.input);
const distinct = [...new Set(inputs)];

const out = {
  exports: {
    validateStoredKey: typeof validateStoredKey,
    inspectStoredKeys: typeof inspectStoredKeys,
  },
  storedKey: [],
};

// --- validateStoredKey, every vector -------------------------------------
for (const c of storedKeyCases) {
  const r = validateStoredKey(c.input);
  out.storedKey.push({ id: c.id, valid: r.valid, reason: r.reason ?? null, key: r.key ?? null });
}

// --- inspectStoredKeys, the saturated document ---------------------------
const fragilityEntry = (file) => ({
  file, changeCount: 1, revertCount: 0, revertRate: 0, fragilityScore: 0, excluded: false,
});
const coChangeEntry = (files) => ({ files, support: 1, occurrences: 1, generated: false });

const build = (parts) => ({
  manual: parts.manual ?? {},
  generated: {
    specVersion: "0.4",
    generatedAt: "2026-06-01T00:00:00Z",
    by: { name: "packed-probe", version: "0.0.0" },
    frameworkManifest: [],
    fileIndex: parts.fileIndex ?? {},
    ...(parts.coChange ? { coChange: parts.coChange, basisRevision: "3c9a0f14b7e25d8613af04c2e9b7d5081f6a2c3d" } : {}),
    ...(parts.fragility ? { fragility: parts.fragility } : {}),
  },
  agents: {},
  health: { intelligenceState: "OBSERVING", observationCount: 0, confidence: 0 },
});

const saturated = build({
  fileIndex: Object.fromEntries(distinct.map((k) => [k, {}])),
  coChange: invalid.map((bad) => coChangeEntry([bad, "src/ok.ts"])),
  fragility: inputs.map(fragilityEntry),
  manual: { fragileFiles: inputs.map((path) => ({ path })) },
});

// Occurrences actually placed, counted from the document itself.
out.occurrences = {
  "generated.fileIndex": Object.keys(saturated.generated.fileIndex).length,
  "generated.coChange[].files[]": saturated.generated.coChange.reduce((n, e) => n + e.files.length, 0),
  "generated.fragility[].file": saturated.generated.fragility.length,
  "manual.fragileFiles[].path": saturated.manual.fragileFiles.length,
};

const before = JSON.stringify(saturated);
out.findings = inspectStoredKeys(saturated).map((f) => ({ ...f }));
out.memberNames = out.findings.length ? Object.keys(out.findings[0]).sort() : [];
out.documentUnchanged = JSON.stringify(saturated) === before;

// The document acceptance boundary, asserted from the SHIPPED validator.
out.saturatedAccepted = { validate: validate(saturated), validateV4: validateV4(saturated) };

// A clean document must come back empty from the packed export too.
const clean = build({
  fileIndex: { "src/a.ts": {}, "A.ts": {}, "a.ts": {}, "caf\\u00e9.ts": {}, "cafe\\u0301.ts": {}, "bad\\ufffd.ts": {} },
  coChange: [coChangeEntry(["src/a.ts", "src/b.ts"])],
  fragility: [fragilityEntry("src/a.ts")],
  manual: { fragileFiles: [{ path: "docs/ok.md" }] },
});
out.cleanFindings = inspectStoredKeys(clean).length;

// manual.coChangePatterns must be inspected by nothing, however malformed.
const patterns = build({
  manual: { coChangePatterns: [{ files: ["src/../x", "./leading.ts"] }, { paths: ["trailing/"] }] },
});
out.coChangePatternFindings = inspectStoredKeys(patterns).length;

process.stdout.write(JSON.stringify(out));
`,
  );
  const observed = JSON.parse(
    execFileSync(process.execPath, [probe, corpusPath], { cwd: consumer, encoding: "utf8" }),
  );

  for (const name of ["validateStoredKey", "inspectStoredKeys"]) {
    if (observed.exports[name] !== "function") {
      failures.push(
        `the packed package does not export ${name} as a function (got ${observed.exports[name]})`,
      );
    }
  }

  // 4a. validateStoredKey — compare against the corpus, from the packed answers.
  const byId = new Map(observed.storedKey.map((r) => [r.id, r]));
  let storedKeyChecked = 0;
  for (const c of storedKeyCases) {
    const r = byId.get(c.id);
    storedKeyChecked += 1;
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

  // 4b. inspectStoredKeys — every finding, from the packed answers.
  const findings = observed.findings ?? [];
  const perSurfaceFindings = Object.fromEntries(SURFACES.map((s) => [s, 0]));
  const pointers = new Set();

  for (const f of findings) {
    if (!SURFACES.includes(f.surface)) {
      failures.push(`finding at ${f.pointer} declares unratified surface '${f.surface}'`);
      continue;
    }
    perSurfaceFindings[f.surface] += 1;

    if (pointers.has(f.pointer)) failures.push(`duplicate pointer ${f.pointer}`);
    pointers.add(f.pointer);

    const expected = declaredReason.get(f.rawKey);
    if (expected === undefined) {
      failures.push(`finding at ${f.pointer} reports '${f.rawKey}', which the corpus declares VALID`);
    } else if (f.reason !== expected) {
      failures.push(`${f.pointer} — packed reason '${f.reason}', corpus declares '${expected}'`);
    }

    if (f.pointer.startsWith("/manual/coChangePatterns")) {
      failures.push(`${f.pointer} — manual.coChangePatterns is deferred and must not be inspected`);
    }
  }

  const expectedMembers = ["pointer", "rawKey", "reason", "surface"];
  if (findings.length && JSON.stringify(observed.memberNames) !== JSON.stringify(expectedMembers)) {
    failures.push(
      `a packed finding carries members ${JSON.stringify(observed.memberNames)}; expected exactly ${JSON.stringify(expectedMembers)} — an extra member is where a repaired spelling would hide`,
    );
  }

  for (const surface of SURFACES) {
    if (perSurfaceFindings[surface] !== invalidCases.length) {
      failures.push(
        `${surface} — packed artifact reported ${perSurfaceFindings[surface]} findings, expected ${invalidCases.length}`,
      );
    }
  }

  if (!observed.documentUnchanged) failures.push("inspectStoredKeys mutated the document");
  if (observed.cleanFindings !== 0) {
    failures.push(`a clean document produced ${observed.cleanFindings} findings from the packed artifact`);
  }
  if (observed.coChangePatternFindings !== 0) {
    failures.push(
      `manual.coChangePatterns produced ${observed.coChangePatternFindings} findings; it is deferred pending ADR-003 A-005`,
    );
  }
  if (!observed.saturatedAccepted.validate || !observed.saturatedAccepted.validateV4) {
    failures.push(
      "the packed validate()/validateV4() rejected a document carrying malformed keys — v0.4 acceptance narrowed",
    );
  }

  const totalOccurrences = SURFACES.reduce((n, s) => n + (observed.occurrences?.[s] ?? 0), 0);

  console.log(`  export types        validateStoredKey=${observed.exports.validateStoredKey}, inspectStoredKeys=${observed.exports.inspectStoredKeys}`);
  console.log(`  storedKey vectors   ${storedKeyChecked}/${storedKeyCases.length} run through the packed validateStoredKey`);
  console.log(`  inspected occurrences (packed inspectStoredKeys)`);
  for (const surface of SURFACES) {
    console.log(
      `    ${surface.padEnd(30)} ${String(perSurfaceFindings[surface]).padStart(3)}/${String(observed.occurrences?.[surface] ?? 0).padEnd(3)} findings/occurrences`,
    );
  }
  console.log(`    ${"TOTAL".padEnd(30)} ${String(findings.length).padStart(3)}/${String(totalOccurrences).padEnd(3)}`);
  console.log(`  distinct pointers   ${pointers.size}`);
  console.log(`  clean document      ${observed.cleanFindings} findings`);
  console.log(`  coChangePatterns    ${observed.coChangePatternFindings} findings (deferred, ADR-003 A-005)`);
  console.log(`  v0.4 acceptance     validate=${observed.saturatedAccepted.validate}, validateV4=${observed.saturatedAccepted.validateV4} on the saturated document`);
  console.log(`  document mutated    ${observed.documentUnchanged ? "no" : "YES"}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\ncheck-packed-path-identity: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  "\nOK — the packed artifact exports validateStoredKey and inspectStoredKeys, satisfies every storedKey vector, and reports every malformed occurrence on all four ratified surfaces.",
);
