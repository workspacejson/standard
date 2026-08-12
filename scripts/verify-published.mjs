#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const version = process.env.WORKSPACEJSON_RELEASE_VERSION
  ?? JSON.parse(readFileSync(new URL("../packages/spec/package.json", import.meta.url), "utf8")).version;
// Only packages this repository publishes are verified here. `agents-audit` is
// published by workspacejson/cli and was deliberately removed during the
// extraction migration: per the four-repository ledger, no target repository
// verifies a package it does not publish.
//
// Two of these checks used to assert the opposite of what they meant, and both
// would only ever have fired AFTER publication — when the registry version is
// already permanent and nothing can be withdrawn:
//
//   * the spec binary has no `--help`. Its single command is `validate <file>`
//     and every other form exits 1 with usage, so `--help` asserted that the
//     published binary FAILS. It now does the binary's actual job, on the
//     smallest document the profile admits.
//   * `@workspacejson/rules/testing` re-exports vitest helpers, and vitest throws
//     "failed to access its internal state" when evaluated outside a vitest run.
//     So it is verified by RESOLUTION, not evaluation — the same distinction CI
//     makes. Its runtime behavior is covered by the package's own vitest suite.
//
// The document is written here rather than taken from packages/spec/examples/.
// The repository's examples track the CURRENT profile and legitimately move
// ahead of what is on the registry, so pairing one with an older published
// validator fails for a reason that has nothing to do with the release. This is
// the minimal shape the v0.4 profile requires — the four required root keys and
// nothing optional — so it stays valid across the whole 0.4 line.
const PROBE_DOCUMENT = {
  manual: {},
  generated: {
    specVersion: "0.4",
    generatedAt: "2026-01-01T00:00:00Z",
    by: { name: "workspacejson-release-verification", version: "1.0.0" },
  },
  agents: {},
  health: {},
};

const packages = [
  { name: "@workspacejson/spec", check: ["npx", "--no-install", "workspacejson-spec", "validate", "probe.json"] },
  { name: "@workspacejson/rules", check: ["node", "--input-type=module", "-e", "import('@workspacejson/rules')"] },
  {
    name: "@workspacejson/rules",
    check: [
      "node",
      "--input-type=module",
      "-e",
      "const u = import.meta.resolve('@workspacejson/rules/testing');" +
        "if (!u.endsWith('/dist/testing/rule-tester.js')) throw new Error('unexpected ./testing resolution: ' + u);" +
        "console.log('@workspacejson/rules/testing resolves to ' + u);",
    ],
  },
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
    writeFileSync(join(directory, "probe.json"), JSON.stringify(PROBE_DOCUMENT, null, 2));
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
