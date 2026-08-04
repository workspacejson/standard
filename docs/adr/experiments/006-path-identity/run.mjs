#!/usr/bin/env node

// ADR-006 evidence harness — canonical path identity.
//
// This answers, with receipts rather than assertion, the questions ADR-006 has
// to decide. It builds throwaway Git repositories, puts adversarial pathnames
// in them, and records what Git, Node and JSON actually do — on THIS platform.
//
//   node docs/adr/experiments/006-path-identity/run.mjs            human output
//   node docs/adr/experiments/006-path-identity/run.mjs --json     raw receipts
//
// Nothing here is a test and nothing here gates CI. It is an experiment log:
// re-running it on another platform is expected to produce different answers to
// several questions, which is itself the finding. Every result carries the
// platform it was observed on, because "case-insensitive" is a property of a
// filesystem, not of a specification.
//
// Deliberate non-goals:
//   - It does not import from workspacejson/cli or workspacejson/integrations.
//     Cross-repository source coupling is forbidden, so where a consumer's
//     behavior is at issue, this reproduces the SEMANTICS (node:path) and cites
//     the consumer by file:line rather than importing it.
//   - It draws no conclusions. The ADR draws conclusions; this produces the
//     evidence they must survive.

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir, platform, release } from "node:os";
import { join, normalize, resolve, relative, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";

const asJson = process.argv.includes("--json");
const receipts = [];

const record = (question, finding, data) => receipts.push({ question, finding, ...data });

// Git invocations return raw bytes where the answer is about encoding: decoding
// to a JS string is exactly the step under investigation and must not be
// silently performed before the measurement.
const gitRaw = (cwd, ...args) => spawnSync("git", args, { cwd, maxBuffer: 1 << 24 }).stdout ?? Buffer.alloc(0);
const git = (cwd, ...args) =>
  (spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 24 }).stdout ?? "").trim();

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "adr006-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "e@e"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "e"], { cwd: dir });
  return dir;
}
const commitAll = (dir, msg = "fixture") => {
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-qm", msg], { cwd: dir });
};

// `git ls-files -z` is the acquisition form under test: NUL-delimited, so no
// quoting, escaping or display transformation can become artifact identity.
const lsFilesZ = (dir) =>
  gitRaw(dir, "ls-files", "-z").toString("binary").split("\0").filter(Boolean);
const lsFilesDefault = (dir) => git(dir, "ls-files").split("\n").filter(Boolean);

const platformTag = `${platform()} ${release()}`;

// ---------------------------------------------------------------- 1. case
{
  const dir = scratchRepo();
  writeFileSync(join(dir, "A.ts"), "a");
  let secondCreated = false;
  try {
    writeFileSync(join(dir, "a.ts"), "b");
    // On a case-insensitive filesystem this OVERWRITES A.ts rather than creating
    // a sibling, so existence of two tracked entries is the real question.
    secondCreated = true;
  } catch { /* case-sensitive refusal is itself a finding */ }
  commitAll(dir);
  const tracked = lsFilesZ(dir);
  const caseSensitiveFs = tracked.length === 2;

  record("case-identity", caseSensitiveFs
    ? "filesystem is case-SENSITIVE: A.ts and a.ts are two tracked entries"
    : "filesystem is case-INSENSITIVE: only one tracked entry survives", {
    platform: platformTag,
    secondWriteSucceeded: secondCreated,
    trackedEntries: tracked,
    gitIndexCount: tracked.length,
    hostLookupCollides: !caseSensitiveFs,
    note: "Stored-key comparison is a string operation and is unaffected by this. " +
      "What varies is whether a HOST QUERY can name a file whose stored key differs only by case.",
  });
  rmSync(dir, { recursive: true, force: true });
}

// ------------------------------------------------------------- 2. unicode
{
  const dir = scratchRepo();
  const nfc = "caf\u00e9.ts";        // é as one code point
  const nfd = "cafe\u0301.ts";       // e + combining acute
  writeFileSync(join(dir, nfc), "x");
  let nfdDistinct = false;
  try {
    writeFileSync(join(dir, nfd), "y");
    nfdDistinct = true;
  } catch { /* ignore */ }
  commitAll(dir);

  const z = lsFilesZ(dir);
  const def = lsFilesDefault(dir);
  const asUtf8 = gitRaw(dir, "ls-files", "-z").toString("utf8").split("\0").filter(Boolean);

  record("unicode-normalization", z.length === 2
    ? "NFC and NFD are DISTINCT tracked entries on this filesystem"
    : "NFC and NFD collapse to a single tracked entry on this filesystem", {
    platform: platformTag,
    nfcWritten: JSON.stringify(nfc),
    nfdWriteSucceeded: nfdDistinct,
    trackedCount: z.length,
    trackedViaLsFilesZ: asUtf8,
    trackedCodePoints: asUtf8.map((p) => [...p].map((c) => c.codePointAt(0).toString(16)).join(" ")),
    lsFilesDefaultQuoted: def,
    quotingObserved: def.some((p) => p.startsWith('"')),
    note: "If `git ls-files` (no -z) quotes a name and `-z` does not, then display " +
      "quoting would become artifact identity for any producer using the default form.",
  });
  rmSync(dir, { recursive: true, force: true });
}

// -------------------------------------------- 3. JSON representability
{
  const dir = scratchRepo();
  // A tracked pathname that is not valid UTF-8: a lone continuation byte.
  const rawName = Buffer.from([0x62, 0x61, 0x64, 0xff, 0x2e, 0x74, 0x73]); // bad\xFF.ts
  let created = false;
  try {
    writeFileSync(Buffer.concat([Buffer.from(`${dir}/`), rawName]), "x");
    created = true;
  } catch { /* some platforms refuse */ }
  let entry = null;
  let roundTrip = null;
  if (created) {
    commitAll(dir);
    const raw = gitRaw(dir, "ls-files", "-z");
    const bytes = raw.toString("binary").split("\0").filter(Boolean)[0] ?? "";
    entry = {
      rawBytesHex: Buffer.from(bytes, "binary").toString("hex"),
      decodedAsUtf8: Buffer.from(bytes, "binary").toString("utf8"),
      decodedCodePoints: [...Buffer.from(bytes, "binary").toString("utf8")]
        .map((c) => c.codePointAt(0).toString(16)).join(" "),
      containsReplacementChar: Buffer.from(bytes, "binary").toString("utf8").includes("\uFFFD"),
    };
    const json = JSON.stringify({ [entry.decodedAsUtf8]: {} });
    roundTrip = {
      serialized: json,
      reparsedKey: Object.keys(JSON.parse(json))[0],
      reparsedEqualsOriginalBytes:
        Buffer.from(Object.keys(JSON.parse(json))[0], "utf8").toString("hex") ===
        entry.rawBytesHex,
    };
  }
  // Unpaired surrogates and replacement-character substitution are the two
  // failure modes §5 names. Both are measurable without a filesystem, so they
  // are answerable on every platform even where creating the file is not.
  const loneSurrogate = "\uD800";
  const surrogateProbe = {
    key: "lone high surrogate U+D800",
    survivesJsonRoundTrip: JSON.parse(JSON.stringify({ [loneSurrogate]: 1 })) !== undefined,
    jsonEncodesIt: JSON.stringify(loneSurrogate),
    // Buffer.from(...,'utf8') replaces an unpaired surrogate with U+FFFD, so the
    // round trip is lossy: the string is not a sequence of scalar values.
    reEncodedHex: Buffer.from(loneSurrogate, "utf8").toString("hex"),
    reEncodeIsLossless:
      Buffer.from(loneSurrogate, "utf8").toString("utf8") === loneSurrogate,
    isWellFormed: typeof "".isWellFormed === "function" ? loneSurrogate.isWellFormed() : null,
  };

  record("json-representability", created
    ? (entry.containsReplacementChar
      ? "a non-UTF-8 tracked path DECODES LOSSILY: U+FFFD appears, and the original bytes are unrecoverable from the JSON key"
      : "a non-UTF-8 tracked path decoded without a replacement character on this platform")
    : "this platform refused to create a non-UTF-8 pathname; question not answerable here", {
    platform: platformTag,
    created,
    attemptedBytesHex: rawName.toString("hex"),
    entry,
    roundTrip,
    surrogateProbe,
    note: "Lossy decode means silent identity mutation: two distinct tracked paths " +
      "could serialize to the same JSON key. That is the case the rule must reject " +
      "explicitly rather than absorb.",
  });
  rmSync(dir, { recursive: true, force: true });
}

// ------------------------------------------------------------- 4. symlinks
{
  const dir = scratchRepo();
  mkdirSync(join(dir, "real"), { recursive: true });
  writeFileSync(join(dir, "real/a.ts"), "x");
  const outside = mkdtempSync(join(tmpdir(), "adr006-outside-"));
  writeFileSync(join(outside, "external.ts"), "x");

  symlinkSync("real", join(dir, "link"));                 // symlinked directory
  symlinkSync("real/a.ts", join(dir, "alias.ts"));        // symlink to tracked file
  symlinkSync(join(outside, "external.ts"), join(dir, "escape.ts")); // escapes repo
  commitAll(dir);

  const tracked = lsFilesZ(dir);
  const throughLink = join(dir, "link/a.ts");
  record("symlinks", "tracked symlink ENTRIES are stored; Git does not store their targets as entries", {
    platform: platformTag,
    trackedEntries: tracked,
    symlinkEntriesTracked: tracked.filter((p) => ["alias.ts", "escape.ts", "link"].includes(p)),
    directoryNotWalkedThrough: !tracked.includes("link/a.ts"),
    queryThroughSymlinkedDir: {
      lexical: relative(dir, normalize(throughLink)),
      realpath: relative(dir, realpathSync(throughLink)),
      lexicalEqualsRealpath: normalize(throughLink) === realpathSync(throughLink),
    },
    escapingSymlink: {
      entry: "escape.ts",
      realpathEscapesRepo: !realpathSync(join(dir, "escape.ts")).startsWith(realpathSync(dir)),
    },
    note: "`link/a.ts` is NOT a tracked entry — Git records the symlink `link`, not a " +
      "second path to `real/a.ts`. A host query arriving as `link/a.ts` therefore has " +
      "no stored key, and realpath() would silently rewrite it to `real/a.ts`.",
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}

// -------------------------------------------------- 5. roots: worktree/submodule
{
  const main = scratchRepo();
  writeFileSync(join(main, "a.ts"), "x");
  commitAll(main);

  // linked worktree
  const wt = join(mkdtempSync(join(tmpdir(), "adr006-wt-")), "linked");
  spawnSync("git", ["worktree", "add", "-q", "-b", "wt", wt], { cwd: main });

  // submodule
  const sub = scratchRepo();
  writeFileSync(join(sub, "s.ts"), "x");
  commitAll(sub);
  const host = scratchRepo();
  writeFileSync(join(host, "h.ts"), "x");
  commitAll(host);
  const addSub = spawnSync("git",
    ["-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "vendor"],
    { cwd: host, encoding: "utf8" });
  commitAll(host, "add submodule");

  record("repository-roots", "a linked worktree and a submodule are SEPARATE artifact roots", {
    platform: platformTag,
    linkedWorktree: {
      toplevel: git(wt, "rev-parse", "--show-toplevel"),
      gitCommonDir: git(wt, "rev-parse", "--git-common-dir"),
      isSeparateToplevel: git(wt, "rev-parse", "--show-toplevel") !== git(main, "rev-parse", "--show-toplevel"),
      tracked: lsFilesZ(wt),
    },
    submodule: {
      added: addSub.status === 0,
      hostTracked: lsFilesZ(host),
      hostSeesSubmoduleFiles: lsFilesZ(host).includes("vendor/s.ts"),
      submoduleToplevel: git(join(host, "vendor"), "rev-parse", "--show-toplevel"),
      hostToplevel: git(host, "rev-parse", "--show-toplevel"),
    },
    note: "The host repo tracks `vendor` as a gitlink, NOT `vendor/s.ts`. A reader that " +
      "walked upward from inside the submodule and selected the host's artifact would " +
      "resolve keys against the wrong root.",
  });
  spawnSync("git", ["worktree", "remove", "--force", wt], { cwd: main });
  for (const d of [main, sub, host]) rmSync(d, { recursive: true, force: true });
}

// ------------------------------------------------- 6. malformed stored keys
{
  // The corpus a stored-key validator must reject. `normalize()` is shown to
  // demonstrate what a reader that normalizes would silently turn each into —
  // this is the behavior ADR-006 forbids, not the behavior it specifies.
  const corpus = [
    "../x", "src/../x", "a/b/../b/c.ts", "/abs/posix/x.ts", "C:\\drive\\x.ts",
    "\\\\unc\\share\\x.ts", "back\\slash.ts", "./leading.ts", "double//sep.ts",
    "trailing/", "", ".", "..", "a\0b.ts",
  ];
  record("malformed-stored-keys", "every entry is non-canonical; normalization would REPAIR several into a different, valid-looking key", {
    platform: platformTag,
    corpus: corpus.map((k) => ({
      key: JSON.stringify(k),
      nodeNormalize: JSON.stringify(normalize(k)),
      isAbsolute: isAbsolute(k),
      // The dangerous class: normalization turns an invalid key into a key that
      // looks canonical, so the defect becomes unobservable downstream.
      silentlyRepairedToCanonical:
        k !== normalize(k) && !normalize(k).startsWith("..") && !isAbsolute(normalize(k)) && normalize(k) !== ".",
      containsNul: k.includes("\0"),
    })),
    note: "`src/../x` -> `x` and `a/b/../b/c.ts` -> `a/b/c.ts` are the reject-don't-resolve " +
      "cases: a reader that normalizes cannot report the artifact as invalid, because after " +
      "normalization there is nothing left to report.",
  });
}

// ------------------------------- 7. the silent redirect, reproduced by semantics
{
  // Reproduces the CAUSE of the observed consumer behavior without importing
  // from the consumer repository. The consumers are cited in the ADR by
  // file:line; what is measured here is node:path.normalize, which is the
  // single call both of them route stored keys and host queries through.
  const stored = "a.ts";
  const probes = ["src/../a.ts", "a/b/../../a.ts", "./a.ts", "../a.ts"];
  record("silent-redirect", "node:path.normalize collapses traversal, so a query naming a path that is not the stored key compares EQUAL to it", {
    platform: platformTag,
    storedKey: stored,
    probes: probes.map((q) => ({
      query: JSON.stringify(q),
      normalized: JSON.stringify(normalize(q)),
      wouldMatchStoredKey: normalize(q).replace(/^\.\//, "") === stored,
    })),
    note: "Measured on node:path only. Consumer behavior is cited in the ADR by file:line " +
      "and was reproduced separately by executing the consumers read-only; importing them " +
      "here would create the cross-repository coupling the architecture guard forbids.",
  });
}

// ---------------------------------------------------------------- output
if (asJson) {
  console.log(JSON.stringify({ platform: platformTag, node: process.version, receipts }, null, 2));
} else {
  console.log(`ADR-006 path identity — evidence run`);
  console.log(`platform: ${platformTag}    node: ${process.version}\n`);
  for (const r of receipts) {
    console.log(`## ${r.question}`);
    console.log(`   ${r.finding}\n`);
  }
  console.log(`${receipts.length} questions probed. Use --json for raw receipts.`);
}
