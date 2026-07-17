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

for (const pkg of packages) {
  const directory = mkdtempSync(join(tmpdir(), "workspacejson-registry-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
    run("npm", ["install", "--ignore-scripts", "--no-package-lock", `${pkg.name}@${version}`], directory);
    run(pkg.check[0], pkg.check.slice(1), directory);
    console.log(`Verified registry install and runtime entry point: ${pkg.name}@${version}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
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
