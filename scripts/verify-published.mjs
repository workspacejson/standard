#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const version = process.env.WORKSPACEJSON_RELEASE_VERSION
  ?? JSON.parse(readFileSync(new URL("../packages/spec/package.json", import.meta.url), "utf8")).version;
const packages = [
  { name: "@workspacejson/spec", check: ["npx", "--no-install", "workspacejson-spec", "--help"] },
  { name: "@workspacejson/rules", check: ["node", "--input-type=module", "-e", "import('@workspacejson/rules')"] },
  { name: "agents-audit", check: ["npx", "--no-install", "agents-audit", "--help"] },
];

// npm registry propagation lags publish by seconds to low minutes. A single
// immediate post-publish check has no way to tell "not actually published"
// apart from "not visible here yet" and fails the Release workflow either
// way — training everyone to ignore red, which is worse than no gate at all.
const REGISTRY_PROPAGATION_RETRIES = 6;
const REGISTRY_PROPAGATION_BASE_DELAY_MS = 5000;
const isRegistryPropagationLag = (stderr) => /\bE(TARGET|404)\b|No matching version found/.test(stderr ?? "");

for (const pkg of packages) {
  const directory = mkdtempSync(join(tmpdir(), "workspacejson-registry-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
    await installWithRetry(pkg, directory);
    run(pkg.check[0], pkg.check.slice(1), directory);
    console.log(`Verified registry install and runtime entry point: ${pkg.name}@${version}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function installWithRetry(pkg, directory) {
  for (let attempt = 1; attempt <= REGISTRY_PROPAGATION_RETRIES; attempt++) {
    const result = spawnSync("npm", ["install", "--ignore-scripts", "--no-package-lock", `${pkg.name}@${version}`], {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: join(directory, ".npm-cache") },
    });
    if (result.status === 0) {
      process.stdout.write(result.stdout);
      return;
    }
    const lastAttempt = attempt === REGISTRY_PROPAGATION_RETRIES;
    if (!isRegistryPropagationLag(result.stderr) || lastAttempt) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }
    const delayMs = REGISTRY_PROPAGATION_BASE_DELAY_MS * attempt;
    console.log(`${pkg.name}@${version} not yet visible on the registry (attempt ${attempt}/${REGISTRY_PROPAGATION_RETRIES}) — retrying in ${delayMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: join(cwd, ".npm-cache") },
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
