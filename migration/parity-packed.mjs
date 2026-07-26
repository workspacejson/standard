#!/usr/bin/env node
// Packed-artifact parity harness for META-239.
// Compares old candidate (built from the frozen source monorepo), new candidate
// (built from workspacejson/standard) and the PUBLISHED registry tarball.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Candidate tarball directory. Override with WORKSPACEJSON_PARITY_DIR.
const SP = process.env.WORKSPACEJSON_PARITY_DIR
  ?? (() => { throw new Error("Set WORKSPACEJSON_PARITY_DIR to a directory containing old-candidates/, new-candidates/ and registry/ tarballs."); })();

const tarText = (tgz, member) => {
  const r = spawnSync("tar", ["-xOf", tgz, member], { encoding: "buffer" });
  if (r.status !== 0) return null;
  return r.stdout;
};
const list = (tgz) =>
  spawnSync("tar", ["-tzf", tgz], { encoding: "utf8" }).stdout
    .split("\n").filter(Boolean).map((f) => f.replace(/^\.\//, "")).sort();

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? `  ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`); }
};

for (const [pkg, tarname] of [["spec", "workspacejson-spec-0.4.4.tgz"], ["rules", "workspacejson-rules-0.4.4.tgz"]]) {
  const oldT = `${SP}/old-candidates/${tarname}`;
  const newT = `${SP}/new-candidates/${tarname}`;
  const pubT = `${SP}/registry/${pkg}-0.4.4.tgz`;

  console.log(`\n=== @workspacejson/${pkg} — packed parity ===`);

  // 1. file inventory
  const [lo, ln, lp] = [list(oldT), list(newT), list(pubT)];
  check("file inventory old == new", JSON.stringify(lo) === JSON.stringify(ln), `${ln.length} entries`);
  check("file inventory published == new", JSON.stringify(lp) === JSON.stringify(ln), `${ln.length} entries`);

  // 2. manifest, key by key
  const mo = JSON.parse(tarText(oldT, "package/package.json").toString());
  const mn = JSON.parse(tarText(newT, "package/package.json").toString());
  const mp = JSON.parse(tarText(pubT, "package/package.json").toString());

  const keys = [...new Set([...Object.keys(mp), ...Object.keys(mn)])].sort();
  const identical = [], differs = [];
  for (const k of keys) {
    const a = JSON.stringify(mp[k]), b = JSON.stringify(mn[k]);
    (a === b ? identical : differs).push(k);
  }
  console.log(`  manifest vs PUBLISHED: ${identical.length}/${keys.length} keys identical`);
  console.log(`    identical: ${identical.join(" ")}`);
  for (const k of differs) {
    console.log(`    DIFFERS  ${k}`);
    console.log(`      published: ${JSON.stringify(mp[k])}`);
    console.log(`      new      : ${JSON.stringify(mn[k])}`);
  }

  // 3. identity invariants that must NOT change
  check("name unchanged", mn.name === mp.name, mn.name);
  check("version unchanged", mn.version === mp.version, mn.version);
  check("bin unchanged", JSON.stringify(mn.bin) === JSON.stringify(mp.bin), JSON.stringify(mn.bin ?? null));
  check("main unchanged", mn.main === mp.main, String(mn.main));
  check("module unchanged", mn.module === mp.module, String(mn.module));
  check("types unchanged", mn.types === mp.types, String(mn.types));
  check("exports unchanged", JSON.stringify(mn.exports) === JSON.stringify(mp.exports));
  check("files unchanged", JSON.stringify(mn.files) === JSON.stringify(mp.files));
  check("engines unchanged", JSON.stringify(mn.engines) === JSON.stringify(mp.engines), JSON.stringify(mn.engines));
  check("runtime dependencies unchanged", JSON.stringify(mn.dependencies) === JSON.stringify(mp.dependencies));
  check("publishConfig unchanged", JSON.stringify(mn.publishConfig) === JSON.stringify(mp.publishConfig));
  check("license unchanged", mn.license === mp.license, mn.license);

  // 4. no workspace: protocol leak
  check("no workspace: protocol in packed manifest",
    !JSON.stringify(mn).includes("workspace:"));
  if (pkg === "rules") {
    check("rules->spec packed as exact version",
      mn.dependencies["@workspacejson/spec"] === "0.4.4",
      mn.dependencies["@workspacejson/spec"]);
  }

  // 5. shipped content bytes
  for (const member of ln.filter((f) => f !== "package/package.json")) {
    const a = tarText(pubT, member), b = tarText(newT, member);
    if (!a || !b) { check(`content ${member}`, false, "missing"); continue; }
    const ha = createHash("sha256").update(a).digest("hex");
    const hb = createHash("sha256").update(b).digest("hex");
    check(`content published == new: ${member.replace("package/", "")}`, ha === hb, ha.slice(0, 12));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
