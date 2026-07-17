#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

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
  assertNoWorkspaceProtocol(manifest, "package");
  assertFixedGroupDependencies(manifest);
  assertRuntimeFiles(manifest, files);
  if (packageName === "agents-audit") assertAgentsAuditBinGenerates(tarballPath);
  console.log(`Verified ${basename(tarballPath)} with ${packer}: packed manifest and runtime files are release-safe.`);
} finally {
  rmSync(tarballPath, { force: true });
}

function tar(...args) {
  const result = spawnSync("tar", args, { cwd: packageDirectory, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `tar ${args.join(" ")} failed.`);
  return result.stdout;
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
  const fixedGroup = new Set(["@workspacejson/spec", "@workspacejson/rules", "agents-audit"]);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (fixedGroup.has(name) && version !== expectedVersion) {
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

function normalizeArchivePath(file) {
  return file.replace(/^\.\//, "").replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}

function assertAgentsAuditBinGenerates(tarballPath) {
  const smokeDirectory = mkdtempSync(join(tmpdir(), "agents-audit-pack-"));
  try {
    writeFileSync(join(smokeDirectory, "package.json"), JSON.stringify({ private: true }));
    // agents-audit's packed manifest depends on @workspacejson/rules and
    // @workspacejson/spec at this same fixed-group version, which is not yet
    // on the npm registry pre-publish. Pack and install those siblings from
    // disk too, so the install resolves locally instead of hitting the registry.
    const siblingTarballs = ["../rules", "../spec"].map((relative) =>
      packSibling(join(packageDirectory, relative), smokeDirectory),
    );
    run("npm", ["install", "--ignore-scripts", "--no-package-lock", ...siblingTarballs, tarballPath], smokeDirectory);
    run("npx", ["--no-install", "agents-audit", "generate"], smokeDirectory);

    const artifact = join(smokeDirectory, ".agents", "workspace.json");
    if (!existsSync(artifact)) {
      throw new Error("Packed agents-audit bin exited without creating .agents/workspace.json.");
    }
    JSON.parse(readFileSync(artifact, "utf8"));
  } finally {
    rmSync(smokeDirectory, { recursive: true, force: true });
  }
}

function packSibling(siblingDirectory, destinationDirectory) {
  const siblingManifest = JSON.parse(readFileSync(join(siblingDirectory, "package.json"), "utf8"));
  const siblingTarballName = `${siblingManifest.name.replace(/^@/, "").replaceAll("/", "-")}-${siblingManifest.version}.tgz`;
  const packArgs = packer === "npm"
    ? ["pack", "--ignore-scripts", "--pack-destination", destinationDirectory]
    : ["pack", "--pack-destination", destinationDirectory];
  const packed = spawnSync(packer, packArgs, { cwd: siblingDirectory, encoding: "utf8" });
  process.stdout.write(packed.stdout);
  process.stderr.write(packed.stderr);
  if (packed.status !== 0) throw new Error(`${packer} pack failed for ${siblingDirectory}.`);
  return join(destinationDirectory, siblingTarballName);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status ?? 1}.`);
}
