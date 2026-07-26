#!/usr/bin/env node

// Packed-tarball gate for the packages workspacejson/standard publishes.
//
// Adapted from workspace-json/agents-audit@e47eb1b8 during the extraction
// migration. Two things changed, both because this repository publishes a
// different set of packages than the monorepo did:
//
//   * the fixed release group no longer contains `agents-audit`, which is
//     published by workspacejson/cli;
//   * the agents-audit `generate` smoke test and its sibling-packing helper
//     were removed. That helper packed ../rules and ../spec from disk, an
//     assumption that only held inside the monorepo.
//
// `assertFixedGroupDependencies` is load-bearing for the migration's decision
// to keep the intra-workspace link: @workspacejson/rules keeps `"@workspacejson/spec": "workspace:*"`
// in committed source because both packages live in this one pnpm workspace.
// This assertion is the proof that the protocol never reaches the registry —
// it fails if the packed manifest carries anything other than the exact
// version. `assertNoWorkspaceProtocol` is the belt to its braces.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const STANDARD_OWNED_PACKAGES = new Set(["@workspacejson/spec", "@workspacejson/rules"]);

const packageDirectory = process.cwd();
const sourceManifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
const packageName = sourceManifest.name;
const expectedVersion = sourceManifest.version;
const packer = process.env.WORKSPACEJSON_PACKER
  ?? (process.env.npm_execpath?.includes("pnpm") ? "pnpm" : "npm");

if (!["pnpm", "npm"].includes(packer)) {
  throw new Error(`Unsupported packer ${JSON.stringify(packer)}; use pnpm or npm.`);
}

const tarballName = `${packageName.replace(/^@/, "").replaceAll("/", "-")}-${expectedVersion}.tgz`;
const tarballPath = join(packageDirectory, tarballName);
if (existsSync(tarballPath)) {
  throw new Error(`Refusing to overwrite existing tarball ${tarballName}; remove it before verification.`);
}

const packArgs = packer === "npm" ? ["pack", "--ignore-scripts"] : ["pack"];
const packed = spawnSync(packer, packArgs, { cwd: packageDirectory, encoding: "utf8" });
process.stdout.write(packed.stdout);
process.stderr.write(packed.stderr);
if (packed.status !== 0) process.exit(packed.status ?? 1);

try {
  if (!existsSync(tarballPath)) {
    throw new Error(`${packer} pack did not create ${tarballName}.`);
  }

  const manifest = tar("-xOf", tarballPath, "package/package.json");
  // Release evidence, 2026-07-16: this verifier's first run found that archive
  // listings do not guarantee directory entries. Normalize once so every runtime
  // asset assertion checks the archive's contents, not a packer formatting detail.
  const files = new Set(tar("-tzf", tarballPath).trim().split("\n").filter(Boolean).map(normalizeArchivePath));
  assertStandardOwnedPackage(manifest);
  assertNoWorkspaceProtocol(manifest, "package");
  assertFixedGroupDependencies(manifest);
  assertRuntimeFiles(manifest, files);
  assertOwnershipMetadata(manifest);
  console.log(`Verified ${basename(tarballPath)} with ${packer}: packed manifest and runtime files are release-safe.`);
} finally {
  rmSync(tarballPath, { force: true });
}

function tar(...args) {
  const result = spawnSync("tar", args, { cwd: packageDirectory, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `tar ${args.join(" ")} failed.`);
  return args.includes("-xOf") ? JSON.parse(result.stdout) : result.stdout;
}

// This repository must never pack a package it does not own. Publishing a
// foreign package from a second repository is the specific failure the
// one-authority-per-package rule exists to prevent.
function assertStandardOwnedPackage(manifest) {
  if (!STANDARD_OWNED_PACKAGES.has(manifest.name)) {
    throw new Error(
      `${manifest.name} is not owned by workspacejson/standard. This repository publishes only ${[...STANDARD_OWNED_PACKAGES].join(", ")}.`,
    );
  }
}

function assertNoWorkspaceProtocol(value, path) {
  if (typeof value === "string") {
    if (value.startsWith("workspace:")) throw new Error(`${path} leaks ${JSON.stringify(value)} into the packed manifest.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoWorkspaceProtocol(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) assertNoWorkspaceProtocol(item, `${path}.${key}`);
  }
}

function assertFixedGroupDependencies(manifest) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (STANDARD_OWNED_PACKAGES.has(name) && version !== expectedVersion) {
        throw new Error(`${packageName} packed ${field}.${name}=${JSON.stringify(version)}; expected ${JSON.stringify(expectedVersion)} for the fixed release group.`);
      }
    }
  }
}

function assertRuntimeFiles(manifest, files) {
  if (![...files].some((file) => file.startsWith("package/dist/"))) {
    throw new Error("Packed tarball is missing dist/.");
  }
  if (packageName === "@workspacejson/spec" && !files.has("package/schema/v1.json")) {
    throw new Error("Packed spec tarball is missing schema/v1.json, required by validate() at runtime.");
  }
  const bins = typeof manifest.bin === "string" ? { [packageName]: manifest.bin } : manifest.bin ?? {};
  for (const target of Object.values(bins)) {
    const normalized = `package/${target.replace(/^\.\//, "")}`;
    if (!files.has(normalized)) throw new Error(`Packed tarball is missing bin target ${normalized}.`);
  }
}

// Consumers click repository/bugs first. Both pointed at a repository that
// never existed before the 0.4.4 line; they must now point here, with a
// directory pointer, or the published package is misleading again.
function assertOwnershipMetadata(manifest) {
  const expectedRepository = "git+https://github.com/workspacejson/standard.git";
  const expectedBugs = "https://github.com/workspacejson/standard/issues";
  const expectedDirectory = `packages/${manifest.name.split("/")[1]}`;

  if (manifest.repository?.url !== expectedRepository) {
    throw new Error(`${manifest.name} packed repository.url=${JSON.stringify(manifest.repository?.url)}; expected ${JSON.stringify(expectedRepository)}.`);
  }
  if (manifest.repository?.directory !== expectedDirectory) {
    throw new Error(`${manifest.name} packed repository.directory=${JSON.stringify(manifest.repository?.directory)}; expected ${JSON.stringify(expectedDirectory)}.`);
  }
  if (manifest.bugs?.url !== expectedBugs) {
    throw new Error(`${manifest.name} packed bugs.url=${JSON.stringify(manifest.bugs?.url)}; expected ${JSON.stringify(expectedBugs)}.`);
  }
  if (!manifest.homepage?.startsWith("https://workspacejson.dev")) {
    throw new Error(`${manifest.name} packed homepage=${JSON.stringify(manifest.homepage)}; expected the bare canonical domain.`);
  }
}

function normalizeArchivePath(file) {
  return file.replace(/^\.\//, "").replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}
