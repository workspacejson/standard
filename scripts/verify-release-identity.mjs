#!/usr/bin/env node

// Release identity gate for workspacejson/standard.
//
// This is the first thing the release workflow runs, and it exists to answer one
// question: *does this ref actually name the release that Changesets computed?*
//
// The failure it prevents is a human typing a version. A tag is a string someone
// chooses; the fixed group's version is a value `changeset version` derives from
// the accumulated changeset files. When those two disagree, publishing the tag
// ships a number nobody computed — and because the registry is append-only, the
// mistake is permanent. So the tag is checked AGAINST the Changesets output
// rather than used as the source of the version.
//
// Six properties, each independently falsifiable:
//
//   1. the tag is package-scoped (`standard-v0.5.0`), never a monorepo-wide `v0.5.0`;
//   2. the Changesets fixed group is exactly the packages this repository owns;
//   3. every member of that group carries the SAME version — that is what "fixed" means;
//   4. the tag's version equals that version;
//   5. no changeset files remain — a release commit is the OUTPUT of `changeset
//      version`, so leftovers mean the tag was cut before versioning ran, and the
//      release would silently omit them;
//   6. each package's CHANGELOG carries a heading for exactly this version — the
//      generated release manifest, present rather than assumed.
//
// Every one of these has a red case in verify-release-identity.test.mjs.
//
// Exit 0 = the ref names the computed release. Exit 1 = it does not, with the
// disagreement printed.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.WORKSPACEJSON_RELEASE_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), "..");

// The tag prefix is repository-scoped on purpose. `workspacejson/cli` and
// `workspacejson/integrations` publish different packages from different
// repositories; a bare `v0.5.0` would claim all of them at once.
const TAG_PREFIX = "standard-v";
const TAG_PATTERN = /^standard-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const STANDARD_OWNED_PACKAGES = ["@workspacejson/spec", "@workspacejson/rules"];

const failures = [];
const fail = (message) => failures.push(message);

const read = (relative) => readFileSync(join(repoRoot, relative), "utf8");

function resolveTag() {
  const flagIndex = process.argv.indexOf("--tag");
  if (flagIndex !== -1) return process.argv[flagIndex + 1];
  if (process.env.WORKSPACEJSON_RELEASE_TAG) return process.env.WORKSPACEJSON_RELEASE_TAG;
  if (process.env.GITHUB_REF_TYPE === "tag") return process.env.GITHUB_REF_NAME;
  return undefined;
}

const tag = resolveTag();

if (!tag) {
  console.error(
    "verify-release-identity: no release tag supplied.\n" +
      "  Pass --tag <tag>, set WORKSPACEJSON_RELEASE_TAG, or run from a tag ref.\n" +
      "  Absence of a tag is not a pass — a release must name itself.",
  );
  process.exit(1);
}

// ---- 1. The tag is package-scoped ------------------------------------------
const tagMatch = TAG_PATTERN.exec(tag);
if (!tagMatch) {
  if (/^v?\d+\.\d+\.\d+/.test(tag)) {
    fail(
      `tag ${JSON.stringify(tag)} is a repository-wide version tag; ` +
        `this repository publishes only ${STANDARD_OWNED_PACKAGES.join(" + ")} and must tag them as ` +
        `${TAG_PREFIX}<version>. A bare version tag claims artifacts owned by other repositories.`,
    );
  } else {
    fail(`tag ${JSON.stringify(tag)} does not match ${TAG_PATTERN} — expected ${TAG_PREFIX}<semver>.`);
  }
}
const tagVersion = tagMatch?.[1];

// ---- 2. The fixed group is what this repository owns ------------------------
let fixedGroup = [];
{
  let config;
  try {
    config = JSON.parse(read(".changeset/config.json"));
  } catch (error) {
    fail(`.changeset/config.json is unreadable (${error.message}); the release version cannot be derived without it.`);
    config = null;
  }

  const groups = config?.fixed ?? [];
  if (groups.length !== 1) {
    fail(
      `.changeset/config.json declares ${groups.length} fixed group(s); this repository releases exactly one ` +
        `(${STANDARD_OWNED_PACKAGES.join(" + ")}), so any other count leaves the release version ambiguous.`,
    );
  }
  fixedGroup = groups[0] ?? [];

  for (const name of fixedGroup) {
    if (!STANDARD_OWNED_PACKAGES.includes(name)) {
      fail(`fixed release group contains ${name}, which workspacejson/standard does not publish.`);
    }
  }
  for (const name of STANDARD_OWNED_PACKAGES) {
    if (!fixedGroup.includes(name)) {
      fail(`fixed release group omits ${name}; the group must publish both packages together or it is not fixed.`);
    }
  }
}

// ---- 3. Every group member carries the same version -------------------------
const manifests = new Map();
for (const name of fixedGroup) {
  const relative = `packages/${name.split("/")[1]}/package.json`;
  if (!existsSync(join(repoRoot, relative))) {
    fail(`${name} is in the fixed release group but ${relative} does not exist.`);
    continue;
  }
  let manifest;
  try {
    manifest = JSON.parse(read(relative));
  } catch (error) {
    fail(`${relative} is unreadable (${error.message}).`);
    continue;
  }
  if (manifest.private) {
    fail(`${name} is marked private and cannot be published, but it is in the fixed release group.`);
  }
  manifests.set(name, { manifest, relative });
}

const versions = new Set([...manifests.values()].map(({ manifest }) => manifest.version));
if (versions.size > 1) {
  const printed = [...manifests.entries()]
    .map(([name, { manifest }]) => `${name}@${manifest.version}`)
    .join(", ");
  fail(
    `fixed group members disagree on version (${printed}). ` +
      `Changesets keeps a fixed group in lockstep, so a disagreement means a version was hand-edited.`,
  );
}
const groupVersion = versions.size === 1 ? [...versions][0] : undefined;

// ---- 4. The tag names that version ------------------------------------------
if (tagVersion && groupVersion && tagVersion !== groupVersion) {
  fail(
    `tag ${JSON.stringify(tag)} names version ${tagVersion}, but the fixed group is at ${groupVersion}. ` +
      `The version comes from \`changeset version\`; the tag must follow it, never the other way round.`,
  );
}

// ---- 5. Nothing is left unreleased -------------------------------------------
// `changeset version` consumes every changeset file it applies. Survivors mean
// the tag was cut before versioning ran, or that changesets landed after it — in
// both cases the computed version is not the one about to be published, and the
// surviving changesets would be silently dropped from this release's changelog.
{
  const changesetDir = join(repoRoot, ".changeset");
  const pending = existsSync(changesetDir)
    ? readdirSync(changesetDir).filter((f) => f.endsWith(".md") && f !== "README.md")
    : [];
  if (pending.length > 0) {
    fail(
      `${pending.length} changeset(s) are still pending at this ref (${pending.join(", ")}). ` +
        `A release commit is the output of \`changeset version\` — pending files mean this ref is not one, ` +
        `and publishing it would drop them from the release notes.`,
    );
  }
}

// ---- 6. The generated release manifest exists --------------------------------
// The changelog entry is the human-readable half of the Changesets output. If it
// is missing for this version, `changeset version` did not produce this state.
for (const [name, { manifest, relative }] of manifests) {
  const changelogPath = relative.replace(/package\.json$/, "CHANGELOG.md");
  if (!existsSync(join(repoRoot, changelogPath))) {
    fail(`${name} has no ${changelogPath}; the Changesets release manifest is missing.`);
    continue;
  }
  const changelog = read(changelogPath);
  const heading = new RegExp(`^##\\s+${manifest.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  if (!heading.test(changelog)) {
    fail(
      `${changelogPath} has no \`## ${manifest.version}\` heading. ` +
        `Every published version carries a generated changelog entry; its absence means this version was not versioned by Changesets.`,
    );
  }
}

// ---- 7. Intra-group ranges stay inside the group ------------------------------
// A member may link to its sibling with `workspace:` (pnpm rewrites it at pack
// time) or pin the exact group version. A floating range would let the two halves
// of a "fixed" group resolve to different releases on a consumer's machine.
for (const [name, { manifest, relative }] of manifests) {
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (!fixedGroup.includes(dep)) continue;
      const linked = typeof range === "string" && range.startsWith("workspace:");
      const pinned = typeof range === "string" && range === groupVersion;
      if (!linked && !pinned) {
        fail(
          `${relative} declares ${field}.${dep}=${JSON.stringify(range)}; ` +
            `a fixed-group sibling must be an intra-workspace link or the exact group version ${groupVersion}.`,
        );
      }
    }
  }
  void name;
}

if (failures.length === 0) {
  console.log(
    `verify-release-identity: OK — ${tag} names ${groupVersion}, ` +
      `matching the Changesets fixed group ${fixedGroup.join(" + ")} with 0 pending changesets.`,
  );
  process.exit(0);
}

console.error(`verify-release-identity: ${failures.length} failure(s)\n`);
for (const message of failures) console.error(`  - ${message}`);
process.exit(1);
