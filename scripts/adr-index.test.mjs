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
// Accepted, but the output must say a specific thing. Exit 0 is not evidence on
// its own — a check that passes while reporting the wrong thing still misleads.
const green = (name, match, fn) => cases.push({ name, expectReject: false, match, mutate: fn });

// Rewrite one entry of the committed index in place.
const patchIndex = (dir, path, fields) => {
  const p = join(dir, "docs/adr/index.json");
  const idx = JSON.parse(readFileSync(p, "utf8"));
  Object.assign(idx.records.find((e) => e.path === path), fields);
  writeFileSync(p, `${JSON.stringify(idx, null, 2)}\n`);
};

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

// ------------------------------------------------- orphan publication metadata
// `revision` is the only thing that makes a PR number checkable. A PR with no
// commit is an unverifiable claim, so the two are absent together or present
// together — "optional" is not "half-present".
red(
  "orphan reference: a pullRequest recorded with a null revision is REJECTED",
  "names nothing that can be checked",
  (d) => patchIndex(d, ACCEPTED_ADR, { revision: null, pullRequest: 18 }),
);

// --------------------------------------------- unverifiable is not verified
// withScratchRepo has no commits and no remote, so no baseline is reachable. A
// recorded revision is preserved and the command still exits 0 — but it must
// not claim the value was checked.
green(
  "no baseline: a present revision is reported UNVERIFIED, not verified",
  "UNVERIFIED",
  (d) => patchIndex(d, ACCEPTED_ADR, { revision: "a".repeat(40), pullRequest: 7 }),
);

green(
  "no baseline: the report says values are preserved, not proven truthful",
  "preserved, not proven truthful",
  (d) => patchIndex(d, ACCEPTED_ADR, { revision: "a".repeat(40), pullRequest: 7 }),
);

// ---------------------------------------------------------- lifecycle
//
// The regression this suite exists for. An earlier version of the check derived
// `revision` and compared the FULL serialization, so the moment a record's bytes
// reached the baseline the committed index — still holding null — was declared
// stale. Every ADR merge would have turned `main` red until a bookkeeping-only
// follow-up commit landed.
//
// This walks the real lifecycle: index before publication, publish, then assert
// the UNCHANGED index still passes. The `after baseline advances` case is the
// one that fails against the old implementation.

function lifecycle() {
  const dir = mkdtempSync(join(tmpdir(), "wsjson-adr-life-"));
  const results = [];
  const check = (dirArg = dir) => {
    const r = spawnSync("node", [guard, dirArg], { cwd: dirArg, encoding: "utf8" });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const assert = (name, cond, out) => results.push({ name, ok: cond, out });

  try {
    for (const f of trackedFiles()) {
      const dest = join(dir, f);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(repoRoot, f), dest);
    }
    // The real repository's index names commits from the real repository, which
    // mean nothing here. Start with no index so this scratch history is the only
    // thing under test.
    rmSync(join(dir, "docs/adr/index.json"), { force: true });

    // Commit on a branch that is NOT the baseline, so the record's bytes exist
    // but are not yet published.
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["checkout", "-q", "-b", "work"], { cwd: dir });
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "records (#42)"], { cwd: dir });

    // 1. Index before publication. No baseline exists, so revision must be null.
    spawnSync("node", [guard, "--write", dir], { cwd: dir, encoding: "utf8" });
    const beforeText = readFileSync(join(dir, "docs/adr/index.json"), "utf8");
    const before = JSON.parse(beforeText).records;
    assert(
      "lifecycle: an unpublished record is indexed with a null revision",
      before.every((e) => e.revision === null && e.pullRequest === null) && before.every((e) => e.blob),
      beforeText.slice(0, 200),
    );
    const pre = check();
    assert("lifecycle: that index passes before publication", pre.status === 0, pre.out);

    // 2. Publish: the baseline now contains the exact blob, unchanged.
    spawnSync("git", ["branch", "main", "work"], { cwd: dir });

    // 3. THE REGRESSION. The index is byte-identical; only the baseline moved.
    const after = check();
    const unchanged = readFileSync(join(dir, "docs/adr/index.json"), "utf8") === beforeText;
    assert(
      "lifecycle: the UNCHANGED index still passes after the baseline advances",
      after.status === 0 && unchanged,
      after.out,
    );
    assert(
      "lifecycle: newly derivable metadata is reported as enrichment, not staleness",
      !/is stale/.test(after.out) && /not required, not stale/.test(after.out),
      after.out,
    );

    // 4. Enrichment is available but never demanded.
    spawnSync("node", [guard, "--write", dir], { cwd: dir, encoding: "utf8" });
    const enriched = JSON.parse(readFileSync(join(dir, "docs/adr/index.json"), "utf8")).records;
    const enrichedOk = check();
    assert(
      "lifecycle: --write enriches the revision, and the enriched index passes",
      enriched.every((e) => /^[0-9a-f]{40}$/.test(e.revision ?? "")) &&
        enriched.every((e) => e.pullRequest === 42) &&
        enrichedOk.status === 0,
      enrichedOk.out,
    );

    // 5. A WRONG non-null revision is still caught. Real commit, wrong bytes:
    //    point the pin at a later commit in which the record differs.
    writeFileSync(join(dir, ACCEPTED_ADR), `${readFileSync(join(dir, ACCEPTED_ADR), "utf8")}\nedit\n`);
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "later (#43)"], { cwd: dir });
    spawnSync("git", ["branch", "-f", "main", "work"], { cwd: dir });
    const older = spawnSync("git", ["rev-parse", "main~1"], { cwd: dir, encoding: "utf8" }).stdout.trim();
    spawnSync("node", [guard, "--write", dir], { cwd: dir, encoding: "utf8" });
    const idx = JSON.parse(readFileSync(join(dir, "docs/adr/index.json"), "utf8"));
    idx.records.find((e) => e.path === ACCEPTED_ADR).revision = older;
    writeFileSync(join(dir, "docs/adr/index.json"), `${JSON.stringify(idx, null, 2)}\n`);
    const wrong = check();
    assert(
      "lifecycle: a non-null revision naming the wrong bytes is REJECTED",
      wrong.status !== 0 && /does not contain the record's current bytes/.test(wrong.out),
      wrong.out,
    );

    // 6. A non-null revision that is not on the baseline at all is REJECTED.
    idx.records.find((e) => e.path === ACCEPTED_ADR).revision = "0".repeat(40);
    writeFileSync(join(dir, "docs/adr/index.json"), `${JSON.stringify(idx, null, 2)}\n`);
    const absent = check();
    assert(
      "lifecycle: a revision absent from the baseline is REJECTED",
      absent.status !== 0 && /is not a commit on/.test(absent.out),
      absent.out,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return results;
}

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
  // Exit code alone is not evidence: a check can pass while reporting something
  // false. Where a case names expected output, that text must actually appear.
  if (c.match && !out.includes(c.match)) {
    failed.push(`${c.name}\n      ${rejected ? "rejected" : "accepted"}, but output does not contain '${c.match}'\n${out.split("\n").map((l) => `      | ${l}`).join("\n")}`);
    continue;
  }
  passed++;
  console.log(`PASS  ${c.expectReject ? "rejected — " : ""}${c.name}`);
}

for (const r of lifecycle()) {
  if (r.ok) {
    passed++;
    console.log(`PASS  ${r.name}`);
  } else {
    failed.push(`${r.name}\n${String(r.out).split("\n").map((l) => `      | ${l}`).join("\n")}`);
  }
}

if (failed.length) {
  console.error(`\n${failed.length} failed\n`);
  for (const f of failed) console.error(`  FAIL  ${f}\n`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
