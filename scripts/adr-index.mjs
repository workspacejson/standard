#!/usr/bin/env node

// ADR revision index — generator and verifier.
//
// An ADR cannot record the identity of its own publication. The commit SHA does
// not exist until the commit is made, and any digest of the file changes the
// moment it is written into the file. Both were attempted in ADR-003 and both
// left a `*filled at merge*` placeholder in an Accepted record — a record that
// says "Accepted" while pointing at a value nobody ever filled in.
//
// So the bookkeeping lives outside the records, in `docs/adr/index.json`, which
// is generated from Git rather than typed by hand. This file is both halves:
//
//   node scripts/adr-index.mjs           verify  — regenerate and compare
//   node scripts/adr-index.mjs --write   emit    — rewrite index.json
//
// One computation serves both, so the generator and the check cannot drift.
//
// What is pinned, and how hard
// ----------------------------
// `blob` is the Git blob SHA of the record's bytes. It is knowable before merge,
// never changes, and `git cat-file blob <sha>` returns exactly the reviewed text
// forever. This is the reference an amendment is written against, and it is
// enforced unconditionally.
//
// `revision` and `pullRequest` are the merge commit that published those bytes
// and the public PR that carried it. They are derived by searching the baseline
// branch for a commit whose blob for that path equals the working-tree blob.
// Before merge no such commit exists, so both are `null` and the entry is
// reported as pending. They are verified when present and never invented.
//
// Deliberately NOT enforced: "an Accepted record must have a non-null revision."
// That rule cannot hold on the commit that merges the record — the index is
// written before the merge commit it would have to name — so it would leave
// `main` red until a follow-up commit, which trains reviewers to ignore red. The
// content pin already makes the reference reproducible; the commit SHA is
// convenience, and it fills in on the next run.
//
// Exit 0 = index matches the repository. Exit 1 = stale, or an Accepted record
// still carries an unresolved placeholder.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// An explicit root lets the red tests point this at a scratch repository. It
// defaults to the repository this script lives in.
const args = process.argv.slice(2);
const write = args.includes("--write");
const repoRoot = args.find((a) => !a.startsWith("--")) ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const adrDir = join(repoRoot, "docs/adr");
const indexRelPath = "docs/adr/index.json";

const git = (...args) => {
  const r = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};

// The branch a published revision is measured against. `origin/main` is the
// truth; the local fallbacks keep the check runnable in a shallow or
// remote-less checkout, where it degrades to "nothing is published yet" rather
// than to a wrong answer.
const baseline = ["origin/main", "main"].find((ref) => git("rev-parse", "--verify", `${ref}^{commit}`));

// ---- parsing ---------------------------------------------------------------

// Metadata rows are `| **Field** | value |`. Only the fields the index needs are
// read; everything else in the record is prose this script has no opinion about.
const metaField = (body, field) => {
  const m = body.match(new RegExp(`^\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "im"));
  return m ? m[1] : null;
};

// A placeholder that survived into an Accepted record is the defect this index
// exists to prevent, so it is named here in order to be forbidden.
const PLACEHOLDER = /\*?filled at merge\*?|\bTBD\b|\*pending\*/i;

function readRecords() {
  return readdirSync(adrDir)
    .filter((f) => /^\d{3}-.+\.md$/.test(f))
    .sort()
    .map((file) => {
      const relPath = `docs/adr/${file}`;
      const body = readFileSync(join(adrDir, file), "utf8");
      const blob = git("hash-object", join(adrDir, file));

      // The commit that published these exact bytes, if any has. Walking the
      // path's history and comparing blobs answers "is this content merged?"
      // without trusting commit messages or dates.
      let revision = null;
      let pullRequest = null;
      if (baseline && blob) {
        const history = (git("rev-list", baseline, "--", relPath) ?? "").split("\n").filter(Boolean);
        for (const commit of history) {
          if (git("rev-parse", `${commit}:${relPath}`) === blob) {
            revision = commit;
            const subject = git("log", "-1", "--format=%s", commit) ?? "";
            const pr = subject.match(/\(#(\d+)\)\s*$/);
            pullRequest = pr ? Number(pr[1]) : null;
            break;
          }
        }
      }

      return {
        adr: Number(file.slice(0, 3)),
        title: (body.match(/^#\s*ADR-\d+:\s*(.+)$/m) ?? [, file])[1].trim(),
        path: relPath,
        status: metaField(body, "Status"),
        decisionDate: metaField(body, "Decision date"),
        ratifyingIssue: metaField(body, "Ratification issue"),
        blob,
        revision,
        pullRequest,
        body, // stripped before serialization; used by the placeholder check
      };
    });
}

const serialize = (records) =>
  `${JSON.stringify(
    {
      $comment:
        "Generated by scripts/adr-index.mjs. Do not edit by hand — run `pnpm run adr:index`. " +
        "`blob` is the immutable content pin an amendment is written against. `revision` and " +
        "`pullRequest` are null until the record's bytes are merged to the baseline branch.",
      records: records.map(({ body, ...entry }) => entry),
    },
    null,
    2,
  )}\n`;

// ---- run -------------------------------------------------------------------

const records = readRecords();
const expected = serialize(records);
const failures = [];

if (write) {
  writeFileSync(join(repoRoot, indexRelPath), expected);
  console.log(`ADR revision index written — ${records.length} records`);
} else {
  let actual = null;
  try {
    actual = readFileSync(join(repoRoot, indexRelPath), "utf8");
  } catch {
    failures.push(`${indexRelPath} is missing — run \`pnpm run adr:index\``);
  }
  if (actual !== null && actual !== expected) {
    failures.push(
      `${indexRelPath} is stale — it does not match the records on disk. ` +
        `Run \`pnpm run adr:index\` and commit the result.`,
    );
  }
}

// An Accepted record makes a promise implementers act on. It must not depend on
// a value that was never filled in, and it must not carry the in-record
// revision field the index replaced.
for (const r of records) {
  if (r.status !== "Accepted") continue;
  const lines = r.body.split("\n");
  lines.forEach((line, i) => {
    if (PLACEHOLDER.test(line)) {
      failures.push(
        `${r.path}:${i + 1} — Accepted record carries an unresolved placeholder: ${line.trim()}`,
      );
    }
  });
  if (metaField(r.body, "Canonical revision") !== null) {
    failures.push(
      `${r.path} — carries an in-record 'Canonical revision' field. A record cannot name the ` +
        `commit that publishes it; the pin belongs in ${indexRelPath}.`,
    );
  }
  if (!r.blob) failures.push(`${r.path} — no blob SHA could be computed`);
  if (!r.decisionDate) failures.push(`${r.path} — Accepted record has no decision date`);
  // A ratifying issue is recorded when the record names one. It is not required:
  // ADR-001, ADR-004 and ADR-005 were accepted before the ledger convention
  // existed, and inventing an issue number for them would be worse than `null`.
}

// The README index is the human entry point. If it disagrees with the records
// about status, one of them is lying to a reader who will never open the other.
const readme = readFileSync(join(adrDir, "README.md"), "utf8");
for (const r of records) {
  const row = readme.match(new RegExp(`^\\|\\s*\\[${String(r.adr).padStart(3, "0")}\\].*$`, "m"));
  if (!row) {
    failures.push(`docs/adr/README.md — no index row for ADR-${String(r.adr).padStart(3, "0")}`);
    continue;
  }
  const cells = row[0].split("|").map((c) => c.trim());
  if (!cells.includes(r.status)) {
    failures.push(
      `docs/adr/README.md — index row for ADR-${String(r.adr).padStart(3, "0")} does not say ` +
        `'${r.status}', which is the status in ${r.path}`,
    );
  }
}

const pending = records.filter((r) => r.revision === null);

console.log("ADR revision index");
console.log(`  baseline            ${baseline ?? "none reachable — every record reads as unpublished"}`);
console.log(`  records             ${records.length} (${records.filter((r) => r.status === "Accepted").length} Accepted)`);
console.log(`  content pins        ${records.filter((r) => r.blob).length}/${records.length} blob SHAs resolved`);
console.log(`  published revisions ${records.length - pending.length}/${records.length}` +
  (pending.length ? `  — pending merge: ${pending.map((r) => `ADR-${String(r.adr).padStart(3, "0")}`).join(", ")}` : ""));

if (failures.length) {
  console.error(`\nadr-index: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\nOK — index matches the records, and no Accepted record depends on an unresolved placeholder.");
