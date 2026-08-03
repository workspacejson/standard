#!/usr/bin/env node

// Red tests for scripts/adr-index.mjs.
//
// Each case copies the repository into a scratch git repo, regenerates a
// self-consistent index there, introduces ONE deliberate defect, and asserts
// the check rejects it with the expected reason.
//
// Regenerating first matters. The real index records commit SHAs from this
// repository's history, which a scratch clone does not have — so without a
// fresh baseline every case would fail for the wrong reason and the suite would
// prove nothing.
//
// The first case is the opposite of the rest: it asserts the UNMODIFIED copy is
// ACCEPTED. Without that baseline, a check that rejected everything would pass
// every red test and look perfectly healthy.

import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const guard = join(repoRoot, "scripts", "adr-index.mjs");

const trackedFiles = () =>
  spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" }).stdout.split("\n").filter(Boolean);

function withScratchRepo(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "wsjson-adr-"));
  try {
    for (const f of trackedFiles()) {
      const dest = join(dir, f);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(repoRoot, f), dest);
    }
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["add", "-A"], { cwd: dir });
    // Establish an index that is correct *for this scratch repo* before the
    // defect is introduced, so each case fails for exactly one reason.
    spawnSync("node", [guard, "--write", dir], { cwd: dir, encoding: "utf8" });
    mutate(dir);
    spawnSync("git", ["add", "-A"], { cwd: dir });
    const r = spawnSync("node", [guard, dir], { cwd: dir, encoding: "utf8" });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ACCEPTED_ADR = "docs/adr/003-field-lifecycle-and-admission.md";
const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
const put = (dir, rel, content) => writeFileSync(join(dir, rel), content);

const cases = [];
const baseline = (name, fn) => cases.push({ name, expectReject: false, match: null, mutate: fn });
const red = (name, match, fn) => cases.push({ name, expectReject: true, match, mutate: fn });

// ---------------------------------------------------------------- baseline
baseline("baseline: the unmodified repository is ACCEPTED", () => {});

// ------------------------------------------------------------ stale index
red(
  "stale index: a record is edited without regenerating the index",
  "is stale",
  (d) => put(d, ACCEPTED_ADR, `${read(d, ACCEPTED_ADR)}\nAn edit nobody re-indexed.\n`),
);

red("stale index: index.json is deleted", "is missing", (d) =>
  rmSync(join(d, "docs/adr/index.json")));

red(
  "stale index: a blob pin is hand-edited to a value the record does not hash to",
  "is stale",
  (d) => put(d, "docs/adr/index.json", read(d, "docs/adr/index.json").replace(/"blob": "[0-9a-f]{40}"/, '"blob": "0000000000000000000000000000000000000000"')),
);

// ------------------------------------------------------- unresolved placeholders
// The defect this index exists to prevent: an Accepted record promising a value
// that was never filled in.
red(
  "placeholder: an Accepted record carries '*filled at merge*'",
  "unresolved placeholder",
  (d) => put(d, ACCEPTED_ADR, read(d, ACCEPTED_ADR).replace(
    "| **Ratification issue** |",
    "| **Effective revision** | *filled at merge* |\n| **Ratification issue** |",
  )),
);

red(
  "placeholder: an Accepted record carries a TBD",
  "unresolved placeholder",
  (d) => put(d, ACCEPTED_ADR, read(d, ACCEPTED_ADR).replace(
    "| **Decider** |",
    "| **Migration owner** | TBD |\n| **Decider** |",
  )),
);

red(
  "self-reference: an Accepted record reintroduces an in-record 'Canonical revision'",
  "cannot name the commit that publishes it",
  (d) => put(d, ACCEPTED_ADR, read(d, ACCEPTED_ADR).replace(
    "| **Ratification issue** |",
    "| **Canonical revision** | *filled at merge — Git commit SHA* |\n| **Ratification issue** |",
  )),
);

// ------------------------------------------------------------- README drift
red(
  "README drift: the index table disagrees with the record about status",
  "does not say 'Accepted'",
  (d) => put(d, "docs/adr/README.md", read(d, "docs/adr/README.md").replace(
    /(\| \[003\]\([^)]+\) \| [^|]+ \| )Accepted/,
    "$1Proposed",
  )),
);

red("metadata: an Accepted record loses its decision date", "no decision date", (d) =>
  put(d, ACCEPTED_ADR, read(d, ACCEPTED_ADR).replace(/^\| \*\*Decision date\*\* \|.*$/m, "")));

// ---------------------------------------------------------------- run
let passed = 0;
const failed = [];

for (const c of cases) {
  const { status, out } = withScratchRepo(c.mutate);
  const rejected = status !== 0;

  if (rejected !== c.expectReject) {
    failed.push(`${c.name}\n      expected ${c.expectReject ? "REJECT" : "ACCEPT"}, got ${rejected ? "REJECT" : "ACCEPT"}\n${out.split("\n").map((l) => `      | ${l}`).join("\n")}`);
    continue;
  }
  if (c.expectReject && !out.includes(c.match)) {
    failed.push(`${c.name}\n      rejected, but not for '${c.match}'\n${out.split("\n").map((l) => `      | ${l}`).join("\n")}`);
    continue;
  }
  passed++;
  console.log(`PASS  ${c.expectReject ? "rejected — " : ""}${c.name}`);
}

if (failed.length) {
  console.error(`\n${failed.length} failed\n`);
  for (const f of failed) console.error(`  FAIL  ${f}\n`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
