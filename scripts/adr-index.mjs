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
// Two classes of field, deliberately not treated alike
// ----------------------------------------------------
// REQUIRED — `adr`, `title`, `path`, `status`, `decisionDate`, `ratifyingIssue`,
// and above all `blob`. `blob` is the Git blob SHA of the record's bytes: the
// reference an amendment is written against. It is knowable before merge, never
// changes, and `git cat-file blob <sha>` returns exactly the reviewed text
// forever. Drift in any required field means the index is stale, and the check
// fails.
//
// OPTIONAL — `revision` (the commit that published those bytes) and
// `pullRequest` (the PR that carried it). These are enrichment. They may be
// null forever without failing anything. When present they are verified against
// Git — the commit must be on the baseline, must contain this exact blob, and
// must name this PR — so a wrong value is caught even though a missing one is
// fine.
//
// Why optional fields are echoed rather than derived during verification
// ---------------------------------------------------------------------
// The obvious implementation — derive everything, serialize, compare to the
// committed file — is wrong, and wrong in a way that only shows up after a
// merge. The instant a record's bytes reach the baseline, `revision` becomes
// derivable; the committed index still says null; the comparison declares it
// stale; `main` goes red until someone lands a follow-up commit whose only
// content is bookkeeping. Publication metadata newly becoming derivable is not
// a defect and must not read as one.
//
// So verification echoes the committed optional values into the expected
// serialization, which makes staleness a statement about the required fields
// alone. Whether a committed optional value is TRUE is asked separately, so one
// defect is reported once. `--write` is the enrichment path: it fills optional
// fields when they are derivable, and keeps existing ones only while they
// remain true of the current bytes.
//
// Exit 0 = required fields match and no present optional value is false.
// Exit 1 = stale required field, a false optional value, or an Accepted record
// still carrying an unresolved placeholder.

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

const serialize = (entries) =>
  `${JSON.stringify(
    {
      $comment:
        "Generated by scripts/adr-index.mjs. Do not edit by hand — run `pnpm run adr:index`. " +
        "`blob` is the required content pin an amendment is written against, and is verified on " +
        "every run. `revision` and `pullRequest` are optional publication metadata: they may stay " +
        "null forever, and are verified against Git only when present.",
      records: entries,
    },
    null,
    2,
  )}\n`;

// Required — the index is stale if any of these drifts from the records on disk.
const INVARIANT = ["adr", "title", "path", "status", "decisionDate", "ratifyingIssue", "blob"];

// Optional — publication metadata. Verified when present, never demanded.
const OPTIONAL = ["revision", "pullRequest"];

const project = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));

// Is a committed `revision` actually the commit that published these bytes? A
// recorded value is only kept if it survives this; a wrong one is never
// tolerated just because it was already in the file.
function revisionIsTruthful(entry, record) {
  if (entry.revision == null) {
    // An orphan PR reference. `revision` is the only thing that makes a PR
    // number checkable — without it there is no commit to compare against, so
    // the number is an unverifiable claim rather than partial data. Optional
    // means "may be absent together", not "may be half-present".
    if (entry.pullRequest != null) {
      return {
        ok: false,
        why:
          `pullRequest ${entry.pullRequest} is recorded with a null revision — a PR reference ` +
          `with no commit names nothing that can be checked. Record both or neither.`,
      };
    }
    return { ok: true };
  }
  // No baseline (shallow clone, no remote): the value is PRESERVED but cannot be
  // judged. It is reported as unverified rather than counted as proven — the
  // whole point of verifying is lost if "could not check" reads as "checked".
  if (!baseline) return { ok: true, unverified: true };
  const reachable =
    spawnSync("git", ["merge-base", "--is-ancestor", entry.revision, baseline], { cwd: repoRoot })
      .status === 0;
  if (!reachable) {
    return { ok: false, why: `revision ${entry.revision} is not a commit on ${baseline}` };
  }
  if (git("rev-parse", `${entry.revision}:${record.path}`) !== record.blob) {
    return {
      ok: false,
      why:
        `revision ${entry.revision} does not contain the record's current bytes ` +
        `(blob ${record.blob}) — it names a different version of ${record.path}`,
    };
  }
  if (entry.pullRequest != null) {
    const subject = git("log", "-1", "--format=%s", entry.revision) ?? "";
    const pr = subject.match(/\(#(\d+)\)\s*$/);
    if (!pr) {
      return { ok: false, why: `pullRequest ${entry.pullRequest} is recorded, but commit ${entry.revision} names no PR` };
    }
    if (Number(pr[1]) !== entry.pullRequest) {
      return { ok: false, why: `pullRequest ${entry.pullRequest} disagrees with commit ${entry.revision}, which names #${pr[1]}` };
    }
  }
  return { ok: true };
}

// ---- run -------------------------------------------------------------------

const records = readRecords();
const failures = [];

let committed = null;
try {
  committed = JSON.parse(readFileSync(join(repoRoot, indexRelPath), "utf8")).records ?? [];
} catch {
  committed = null;
}
const committedFor = (path) => (committed ?? []).find((e) => e.path === path) ?? {};

// Optional metadata carried into the expected serialization comes from what is
// ALREADY COMMITTED, not from what is derivable now. That is the whole fix: the
// moment this record's bytes reach the baseline, `revision` becomes derivable —
// and if the expected file used the derived value, every merge would leave the
// committed index "stale" and `main` red until a follow-up commit. Publication
// metadata newly becoming derivable is not a defect and must not read as one.
const entryFor = (r) => {
  const prior = committedFor(r.path);

  // Verifying: optional metadata is echoed back from the file exactly as
  // committed, so staleness measures ONLY the invariant fields. Whether the
  // committed value is true is a separate question, asked separately below —
  // folding it in here would report one defect as two.
  if (!write) return { ...project(r, INVARIANT), ...project(prior, OPTIONAL) };

  // Enriching: prefer a freshly derived revision. Otherwise keep what is
  // committed, but only while it is still true of these bytes — once a record
  // is edited its old revision names the old text, so carrying it forward would
  // turn a stale value into a lie.
  if (r.revision) return { ...project(r, INVARIANT), revision: r.revision, pullRequest: r.pullRequest };
  const keep = revisionIsTruthful(prior, r).ok;
  return {
    ...project(r, INVARIANT),
    revision: keep ? prior.revision ?? null : null,
    pullRequest: keep ? prior.pullRequest ?? null : null,
  };
};

const expected = serialize(records.map(entryFor));

if (write) {
  writeFileSync(join(repoRoot, indexRelPath), expected);
  console.log(`ADR revision index written — ${records.length} records`);
  if (!baseline) {
    console.log(
      "  no baseline reachable: existing publication metadata was PRESERVED as-is, " +
        "not derived and not proven truthful",
    );
  }
} else if (committed === null) {
  failures.push(`${indexRelPath} is missing or unparseable — run \`pnpm run adr:index\``);
} else {
  if (readFileSync(join(repoRoot, indexRelPath), "utf8") !== expected) {
    failures.push(
      `${indexRelPath} is stale — a required field (${INVARIANT.join(", ")}) does not match the ` +
        `records on disk. Run \`pnpm run adr:index\` and commit the result.`,
    );
  }
  // Optional metadata is never required, but a present value must be true.
  for (const r of records) {
    const verdict = revisionIsTruthful(committedFor(r.path), r);
    if (!verdict.ok) failures.push(`${r.path} — ${verdict.why}`);
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

const recorded = records.filter((r) => committedFor(r.path).revision != null);
const unverified = recorded.filter((r) => revisionIsTruthful(committedFor(r.path), r).unverified);
const enrichable = records.filter((r) => committedFor(r.path).revision == null && r.revision != null);

console.log("ADR revision index");
console.log(`  baseline            ${baseline ?? "NONE REACHABLE — publication metadata cannot be derived or checked"}`);
console.log(`  records             ${records.length} (${records.filter((r) => r.status === "Accepted").length} Accepted)`);
console.log(`  content pins        ${records.filter((r) => r.blob).length}/${records.length} blob SHAs resolved  [required]`);

// Never report an unchecked value as verified. With no baseline the recorded
// revisions are carried forward untouched, and saying so is the honest form.
if (unverified.length) {
  console.log(`  publication         ${recorded.length}/${records.length} revisions recorded, ${unverified.length} UNVERIFIED  [optional]`);
  console.log(`                      no baseline reachable — recorded values are preserved, not proven truthful`);
} else {
  console.log(`  publication         ${recorded.length}/${records.length} revisions recorded and verified  [optional]`);
}
if (enrichable.length) {
  console.log(`                      ${enrichable.length} now derivable — \`pnpm run adr:index\` will enrich; not required, not stale`);
}

if (failures.length) {
  console.error(`\nadr-index: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\nOK — index matches the records, and no Accepted record depends on an unresolved placeholder.");
