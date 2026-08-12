#!/usr/bin/env node

// Documentation integrity gate.
//
// Polish decays. A README that was accurate when it was written drifts as files
// move, and a "cold reader can follow this" claim is worthless if nothing checks
// it. This gate makes five properties of the public surface mechanically
// verifiable instead of merely asserted:
//
//   1. Every relative Markdown link and image resolves to a file that exists.
//   2. Public prose does not carry internal tracker identifiers, which a public
//      reader cannot resolve. Provenance records are exempt — see PROVENANCE_FILES.
//   3. Every documented pnpm script actually exists in package.json.
//   4. Every prose enumeration of the four stable read paths is complete and
//      matches the schema. The paths are restated in several documents and the
//      architecture guard reads only source and config, so nothing else would
//      notice a prose copy going stale.
//   5. The asset production receipt is recomputed from the assets it describes,
//      so a regenerated export cannot leave it reporting a stale pass.
//
// External links are NOT fetched. A network check in CI fails on someone else's
// outage and trains everyone to ignore red. They are syntax-checked here and
// verified manually during review; the counts are reported either way.
//
// Exit 0 = clean. Exit 1 = failures, printed with file, line and reason.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
const fail = (file, line, message) => failures.push({ file, line, message });

function trackedFiles() {
  const result = spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

const files = trackedFiles();
const markdown = files.filter((f) => f.endsWith(".md"));

// Files whose whole purpose is to record where something came from. An audit
// trail that cannot name its own source is not an audit trail.
const PROVENANCE_FILES = new Set([
  "migration/PROVENANCE.md",
  "migration/commit-map.txt",
  "migration/parity-packed.mjs",
  "migration/parity-runtime.mjs",
  "docs/adr/README.md",
  "docs/adr/index.json",
  "docs/adr/001-canonical-artifact-path.md",
  "docs/adr/002-bounded-enrichment-program.md",
  "docs/adr/003-field-lifecycle-and-admission.md",
  "docs/adr/006-canonical-path-identity.md",
  // An evidence receipt must name the tracked work that froze the contract it
  // ran under, for the same reason the records above must. Enumerated per file:
  // a future evidence run does NOT inherit this, and has to argue for itself.
  "docs/evidence/meta-310/RECEIPT.md",
]);

// A narrower exemption than PROVENANCE_FILES. That set admits every identifier
// anywhere in a file; this one admits only the identifiers enumerated for it,
// by value. An identifier that shows up later still fails and has to argue for
// itself, rather than inheriting an exemption that was granted for a different
// reference on a different line.
//
// Prefer this form. A whole-file exemption is the blunt instrument, and is
// worth reaching for only when the file cannot enumerate its references in
// advance — an open-ended migration log, say.
const SCOPED_PROVENANCE = new Map([
  [
    // A production receipt records which tracked work set the authority it ran
    // under, and which follow-on work owns each ruling it deferred. Strip those
    // and the record no longer says who to ask about an unresolved deviation.
    "assets/PRODUCTION-RECEIPT.md",
    new Set([
      "GTM-30", // content authority the pack was produced against
      "GTM-31", // the work that specified the pack
      "GTM-32", // owns the deferred README integration
      "GTM-33", // rule source for shipping no star CTA in the banner
      "META-297", // the finding the co-change stability tag turns on
    ]),
  ],
]);

// Historical release notes are a record of what was published, not live prose.
// Rewriting them to remove a reference would falsify the record.
const isChangelog = (f) => /(^|\/)CHANGELOG\.md$/.test(f);

// The producer stamps the identifier of the issue that specified its weighting
// algorithm into every scoring basis it emits, as `weightingVersion`. That
// string is DATA, not prose: editing it to satisfy this gate would ship an
// artifact that misreports which algorithm produced it, which is falsifying
// evidence to pass a style check.
//
// Scoped to the single producer-stamped member on its own line, by value, and
// deliberately NOT to any directory. An earlier version of this exemption
// skipped the whole `docs/evidence/` subtree; review found that overbroad,
// because it also waved through unrelated identifiers in human-authored
// evidence prose. Nothing else on any other line is exempted, and human prose
// that needs to name tracked work goes in PROVENANCE_FILES above, one
// enumerated file at a time, so each exemption stays a decision someone made.
//
// Fails closed: minified or reflowed JSON does not match, and must be justified
// rather than silently admitted.
const PRODUCER_STAMPED = /^\s*"weightingVersion":\s*"[^"]*"\s*,?\s*$/;

// This file names the pattern in order to forbid it.
const SELF = "scripts/check-docs.mjs";

const INTERNAL_ID = /\b(?:META|VR|HAC|GTM)-\d+\b/g;

// ---- 1 + 2: per-file Markdown checks ---------------------------------------

let linksChecked = 0;
let relativeLinks = 0;
let externalLinks = 0;

for (const file of markdown) {
  const content = readFileSync(join(repoRoot, file), "utf8");
  const lines = content.split("\n");
  const fileDir = dirname(join(repoRoot, file));

  // Strip fenced code blocks before link and identifier matching. A code sample
  // is an illustration, not a claim about this repository.
  let inFence = false;
  const prose = lines.map((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return ""; }
    return inFence ? "" : line;
  });

  prose.forEach((line, index) => {
    const lineNumber = index + 1;

    // ---- links and images
    // Matches [text](target) and ![alt](target). Bare autolinks are skipped:
    // they are always external and carry no relative-path risk.
    for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      linksChecked++;

      if (/^(https?:|mailto:)/.test(target)) {
        externalLinks++;
        if (/^http:/.test(target)) {
          fail(file, lineNumber, `insecure http link: ${target}`);
        }
        continue;
      }
      if (target.startsWith("#")) continue; // same-document anchor

      relativeLinks++;
      const [path] = target.split("#");
      if (!path) continue;
      const resolved = resolve(fileDir, decodeURIComponent(path));

      if (!existsSync(resolved)) {
        fail(file, lineNumber, `relative link target does not exist: ${target}`);
        continue;
      }
      // A link to a directory must point at something a reader can land on.
      if (statSync(resolved).isDirectory() && !existsSync(join(resolved, "README.md"))) {
        const inRepo = relative(repoRoot, resolved);
        if (!files.some((f) => f.startsWith(`${inRepo}/`))) {
          fail(file, lineNumber, `relative link points at an empty or untracked directory: ${target}`);
        }
      }
    }

    // ---- internal tracker identifiers
    if (file === SELF || PROVENANCE_FILES.has(file) || isChangelog(file)) return;
    const admitted = SCOPED_PROVENANCE.get(file);
    for (const match of line.matchAll(INTERNAL_ID)) {
      if (admitted?.has(match[0])) continue;
      fail(
        file,
        lineNumber,
        `internal tracker identifier '${match[0]}' in public prose — a public reader cannot resolve it. ` +
          `Describe the work instead, or record it in migration/PROVENANCE.md.`,
      );
    }
  });
}

// Non-Markdown tracked text is held to the identifier rule too, so an internal
// reference cannot simply move into a workflow comment or a script header.
for (const file of files.filter((f) => /\.(ya?ml|json|mjs|js|ts)$/.test(f))) {
  if (file === SELF || PROVENANCE_FILES.has(file)) continue;
  const admitted = SCOPED_PROVENANCE.get(file);
  const content = readFileSync(join(repoRoot, file), "utf8");
  content.split("\n").forEach((line, index) => {
    if (PRODUCER_STAMPED.test(line)) return;
    for (const match of line.matchAll(INTERNAL_ID)) {
      if (admitted?.has(match[0])) continue;
      fail(file, index + 1, `internal tracker identifier '${match[0]}' — describe the work instead`);
    }
  });
}

// ---- 3: documented commands exist ------------------------------------------

const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const rootScripts = new Set(Object.keys(rootManifest.scripts ?? {}));

let commandsChecked = 0;
for (const file of markdown) {
  const content = readFileSync(join(repoRoot, file), "utf8");
  for (const match of content.matchAll(/\bpnpm run ([a-z][a-z0-9:-]*)/g)) {
    commandsChecked++;
    if (!rootScripts.has(match[1])) {
      fail(file, 0, `documents 'pnpm run ${match[1]}', which is not a script in the root package.json`);
    }
  }
}

// ---- 4: enumerated stable read paths match the schema -----------------------

// The four stable read paths are a compatibility surface, so they are restated
// in several places a reader might arrive at first — AGENTS.md, GOVERNANCE.md,
// the Copilot instructions. The architecture guard only scans source and config,
// so none of those prose copies is checked by anything else: a path could be
// renamed in the schema and go on being documented under its old name.
//
// Two properties, both mechanical:
//   a. each path this repository calls stable still exists in the schema;
//   b. any prose that starts enumerating them enumerates all four, so a partial
//      list cannot drift into looking authoritative.
//
// Prose that merely refers to "the four stable read paths" without naming any is
// left alone — it carries no list that can rot.

const STABLE_READ_PATHS = [
  ["manual", "fragileFiles"],
  ["manual", "coChangePatterns"],
  ["generated", "fileIndex"],
  ["generated", "frameworkManifest"],
];

const schemaRelPath = "packages/spec/schema/v1.json";
const schema = JSON.parse(readFileSync(join(repoRoot, schemaRelPath), "utf8"));

for (const [parent, leaf] of STABLE_READ_PATHS) {
  const present = schema?.properties?.[parent]?.properties?.[leaf] !== undefined;
  if (!present) {
    fail(
      schemaRelPath,
      0,
      `stable read path '${parent}.${leaf}' is documented as a compatibility surface but is absent from the schema — ` +
        `remove it from the prose that enumerates it, or restore it`,
    );
  }
}

const MENTIONS_STABLE_PATHS = /stable read path/i;
let enumerationsChecked = 0;

for (const file of markdown) {
  const content = readFileSync(join(repoRoot, file), "utf8");
  if (!MENTIONS_STABLE_PATHS.test(content)) continue;

  const named = STABLE_READ_PATHS.filter(([parent, leaf]) =>
    content.includes(`${parent}.${leaf}`),
  );
  if (named.length === 0) continue; // refers to them without listing them

  enumerationsChecked++;
  if (named.length !== STABLE_READ_PATHS.length) {
    const missing = STABLE_READ_PATHS.filter(([p, l]) => !content.includes(`${p}.${l}`))
      .map(([p, l]) => `${p}.${l}`)
      .join(", ");
    fail(
      file,
      0,
      `enumerates stable read paths but omits ${missing} — a partial list reads as authoritative`,
    );
  }
}

// ---- 5: asset receipts are recomputed from the assets -----------------------

// A receipt that records "pass" against a file it never reads is a claim, not
// evidence: regenerate the asset and the receipt goes on reporting the old
// result. So the manifest's dimensions are read back out of the PNG headers,
// and the size ceilings are recomputed from the files on disk. Change an
// export without updating its receipt row and this fails.
//
// The receipt owns the numbers. Nothing here hardcodes a dimension — the table
// is the input, and the PNG is the referent it is checked against.

const ASSET_RECEIPT = "assets/PRODUCTION-RECEIPT.md";

// Ceilings the receipt's preflight states, in bytes.
const SIZE_CEILINGS = { social: 300 * 1024, readme: 400 * 1024 };

// Geometry and encoding both live in the IHDR chunk, at fixed offsets in every
// PNG, so neither needs the image decoded.
const pngHeader = (buffer) => {
  const isPng = buffer.length >= 29 && buffer.readUInt32BE(0) === 0x89504e47;
  if (!isPng) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colourType: buffer.readUInt8(25),
    interlace: buffer.readUInt8(28),
  };
};

// "PNG-24" in the receipt means 8 bits per channel truecolour — colour type 2
// (RGB) or 6 (RGBA). An export downgraded to a palette or to 16-bit would
// change how it renders while leaving the receipt reporting a pass.
const TRUECOLOUR = new Set([2, 6]);

// The receipt also records the alpha channel as flattened to opaque, and that
// one cannot be read off the header: colour type 6 says an alpha channel
// exists, not that every sample in it is 255. A hero that regained
// transparency would render wrong against exactly one of GitHub's two themes,
// which is the failure the light/dark pairing exists to prevent, so the
// samples are checked directly.
//
// Reconstructing them means undoing the per-scanline filters, which is why the
// image is inflated here rather than inspected in place.
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

// Walks the chunk list once. `tRNS` is the other way a PNG carries
// transparency — a colour key on truecolour images, where the alpha channel
// itself is absent — so an export can be colour type 2 and still have
// see-through pixels. Its mere presence contradicts "flattened to opaque",
// which is why it does not need decoding to rule on.
const readChunks = (buffer) => {
  const idat = [];
  let hasTrns = false;
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === "tRNS") hasTrns = true;
    if (type === "IEND") break;
    offset += length + 12; // length + type + data + CRC
  }
  return { idat, hasTrns };
};

// Returns the first non-opaque alpha value found, or null when fully opaque.
// Throws for the encodings it deliberately does not handle, so an unsupported
// export fails loudly rather than passing unchecked.
const firstTransparentSample = (buffer, { width, height, colourType, interlace }) => {
  if (colourType !== 6) return null; // no alpha channel to inspect
  if (interlace !== 0) throw new Error("interlaced PNG");

  const { idat } = readChunks(buffer);
  if (!idat.length) throw new Error("no IDAT chunk");

  // A PNG's decompressed size is exactly one filter byte plus one scanline per
  // row, so the correct output length is known before inflating rather than
  // discovered by inflating. Declaring it caps the decompressor at the size the
  // header already committed to: a stream that expands past it stops with an
  // error instead of growing until the process dies.
  const stride = width * 4; // RGBA, 8 bits per channel
  const expected = height * (stride + 1);
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  if (raw.length < expected) throw new Error("truncated image data");
  const bpp = 4; // RGBA, 8 bits per channel
  const line = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0, pos = 0; y < height; y++) {
    const filter = raw[pos++];
    raw.copy(line, 0, pos, pos + stride);
    pos += stride;

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = previous[i];
      const c = i >= bpp ? previous[i - bpp] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: line[i] = (line[i] + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`unknown filter type ${filter}`);
      }
    }

    for (let i = bpp - 1; i < stride; i += bpp) {
      if (line[i] !== 0xff) return line[i];
    }
    line.copy(previous);
  }
  return null;
};

let assetRowsChecked = 0;
const committedAssets = files.filter((f) => /^assets\/[\w.-]+\.png$/.test(f));

if (!files.includes(ASSET_RECEIPT)) {
  // The receipt is the only thing that accounts for what lives in assets/, so
  // its absence cannot be a reason to skip the checks below. Deleting it would
  // otherwise turn every asset check off at once, quietly.
  if (committedAssets.length) {
    fail(
      ASSET_RECEIPT,
      0,
      `${committedAssets.length} PNG(s) are committed under assets/ but the production receipt is ` +
        `missing — nothing accounts for their dimensions, encoding or size`,
    );
  }
} else {
  const receipt = readFileSync(join(repoRoot, ASSET_RECEIPT), "utf8");
  // | `name.png` | purpose | 2560 x 800 | ... |
  const ROW = /^\|\s*`([\w.-]+\.png)`\s*\|[^|]*\|\s*(\d+)\s*x\s*(\d+)\s*\|/gm;

  // Checking the manifest against the assets only catches rows that are
  // present. Delete a row and its export silently stops being validated, so
  // coverage is checked in the other direction too: every PNG committed under
  // assets/ has to be accounted for by the receipt, either as a manifest row
  // or as a file the replacement matrix explicitly keeps. Dropping a row makes
  // its file unaccounted-for and fails here.
  const manifested = new Set([...receipt.matchAll(ROW)].map(([, name]) => name));
  const kept = new Set(
    [...receipt.matchAll(/^\|\s*`assets\/([\w.-]+\.png)`[^|]*\|\s*\*\*Keep as-is\*\*/gm)].map(
      ([, name]) => name,
    ),
  );

  for (const file of committedAssets) {
    const name = /^assets\/([\w.-]+\.png)$/.exec(file)[1];
    if (manifested.has(name) || kept.has(name)) continue;
    fail(
      ASSET_RECEIPT,
      0,
      `${file} is committed but the receipt neither lists it in the manifest nor records it as kept — ` +
        `an unaccounted asset is not covered by any dimension, encoding or size check`,
    );
  }

  for (const [, name, w, h] of receipt.matchAll(ROW)) {
    const rel = `assets/${name}`;
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) {
      fail(ASSET_RECEIPT, 0, `manifest lists '${name}' but ${rel} does not exist`);
      continue;
    }

    assetRowsChecked++;
    const bytes = readFileSync(abs);
    const actual = pngHeader(bytes);
    if (!actual) {
      fail(rel, 0, `manifest records it as a PNG export, but the file has no PNG header`);
      continue;
    }

    // Order matters below. The geometry and size claims are read straight off
    // the header and the file length, so they are settled first, and only an
    // asset that already matches its row is decoded. That keeps the one
    // expensive check bounded by numbers the receipt has already agreed to,
    // instead of by whatever a file happens to declare about itself.
    const claimed = { width: Number(w), height: Number(h) };
    const geometryMatches =
      actual.width === claimed.width && actual.height === claimed.height;
    if (!geometryMatches) {
      fail(
        ASSET_RECEIPT,
        0,
        `manifest records '${name}' as ${claimed.width} x ${claimed.height}, but the file is ` +
          `${actual.width} x ${actual.height} — regenerate the asset or correct the receipt`,
      );
    }

    // The social card is the only asset the receipt holds to the tighter
    // ceiling, and it is the only one authored at its final unfurl size.
    const ceiling = claimed.width === 1200 && claimed.height === 630
      ? SIZE_CEILINGS.social
      : SIZE_CEILINGS.readme;
    const withinCeiling = bytes.length <= ceiling;
    if (!withinCeiling) {
      fail(
        rel,
        0,
        `${(bytes.length / 1024).toFixed(0)} KB exceeds the ${ceiling / 1024} KB ceiling the ` +
          `receipt records as passing`,
      );
    }

    if (actual.bitDepth !== 8 || !TRUECOLOUR.has(actual.colourType)) {
      fail(
        rel,
        0,
        `receipt records it as PNG-24, but the header says bit depth ${actual.bitDepth}, ` +
          `colour type ${actual.colourType}`,
      );
    } else if (readChunks(bytes).hasTrns) {
      fail(
        rel,
        0,
        `receipt records the alpha channel as flattened to opaque, but the file carries a tRNS ` +
          `chunk — colour-keyed transparency the alpha samples would not show`,
      );
    } else if (geometryMatches && withinCeiling) {
      try {
        const sample = firstTransparentSample(bytes, actual);
        if (sample !== null) {
          fail(
            rel,
            0,
            `receipt records the alpha channel as flattened to opaque, but the image contains a ` +
              `sample with alpha ${sample} — it would render wrong against one of the two themes`,
          );
        }
      } catch (error) {
        fail(rel, 0, `alpha channel could not be verified against the receipt: ${error.message}`);
      }
    }
  }

  if (assetRowsChecked === 0) {
    fail(ASSET_RECEIPT, 0, `no manifest rows parsed — the receipt cannot be checked against its assets`);
  }
}

// ---- report ----------------------------------------------------------------

console.log("Documentation integrity");
console.log(`  markdown files      ${markdown.length}`);
console.log(`  links checked       ${linksChecked}  (${relativeLinks} relative, resolved on disk; ${externalLinks} external, syntax only)`);
console.log(`  pnpm commands       ${commandsChecked} documented references verified against package.json`);
console.log(`  stable read paths   ${STABLE_READ_PATHS.length} confirmed in the schema; ${enumerationsChecked} prose enumerations complete`);
console.log(`  provenance files    ${PROVENANCE_FILES.size} exempt from the tracker-identifier rule; ${SCOPED_PROVENANCE.size} scoped to enumerated identifiers`);
console.log(`  asset receipts      ${assetRowsChecked} manifest rows recomputed from the PNGs on disk`);
console.log(
  `  producer-stamped    weightingVersion admitted by value on its own line; no directory is exempt`,
);

if (failures.length) {
  console.error(`\ncheck-docs: ${failures.length} failure(s)\n`);
  for (const f of failures) {
    console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}\n      ${f.message}`);
  }
  process.exit(1);
}
console.log(
  "\nOK — every relative link resolves, no internal tracker identifiers in public prose, " +
    "every documented command exists, every enumerated stable read path matches the schema.",
);
