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
//
// The budget is a DURATION, not an attempt count, because the attempt count is
// exactly what drifted away from the sentence above it. Six attempts with a
// linear five-second step is seventy-five seconds of waiting, which does not
// cover "low minutes" and did not cover the 0.5.0 release: both packages were
// published successfully at 00:05:31, the retries were exhausted at 00:06:48,
// and the same script passed against the same registry minutes later. The
// release was real; the receipt said otherwise.
//
// A count has to be mentally multiplied out before it can be compared to the
// claim. A duration cannot silently disagree with it.
const REGISTRY_PROPAGATION_BUDGET_MS = 10 * 60 * 1000;
const REGISTRY_PROPAGATION_BASE_DELAY_MS = 5000;
// Capped so the tail of a long wait stays responsive rather than sleeping for
// minutes past the moment the package actually appears.
const REGISTRY_PROPAGATION_MAX_DELAY_MS = 30000;
const isRegistryPropagationLag = (stderr) => /\bE(TARGET|404)\b|No matching version found/.test(stderr ?? "");
const seconds = (ms) => `${Math.round(ms / 1000)}s`;

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
  const startedAt = Date.now();
  for (let attempt = 1; ; attempt++) {
    const result = spawnSync("npm", ["install", "--ignore-scripts", "--no-package-lock", `${pkg.name}@${version}`], {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: join(directory, ".npm-cache") },
    });
    if (result.status === 0) {
      process.stdout.write(result.stdout);
      if (attempt > 1) {
        console.log(`${pkg.name}@${version} became visible after ${seconds(Date.now() - startedAt)} (attempt ${attempt}).`);
      }
      return;
    }

    const lag = isRegistryPropagationLag(result.stderr);
    const elapsedMs = Date.now() - startedAt;
    const exhausted = elapsedMs >= REGISTRY_PROPAGATION_BUDGET_MS;

    if (!lag || exhausted) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      if (lag) {
        // Say which of the two things this is, rather than leaving a reader to
        // infer a failed publish from a failed lookup. They are not the same
        // event and they need different responses.
        console.error(
          `\n${pkg.name}@${version} was still not visible after ${seconds(elapsedMs)}, which is the whole ` +
            `${seconds(REGISTRY_PROPAGATION_BUDGET_MS)} propagation budget.\n` +
            `This is NOT proof that publication failed. Check the registry directly before treating it as one:\n` +
            `  npm view ${pkg.name} versions\n` +
            `If ${version} is present, the package shipped and only this receipt is missing — re-run this script.\n` +
            `If it is absent, the publish did not land and the release needs to be re-cut.`,
        );
      }
      process.exit(result.status ?? 1);
    }

    const delayMs = Math.min(REGISTRY_PROPAGATION_BASE_DELAY_MS * attempt, REGISTRY_PROPAGATION_MAX_DELAY_MS);
    console.log(
      `${pkg.name}@${version} not yet visible on the registry ` +
        `(attempt ${attempt}, ${seconds(elapsedMs)} of ${seconds(REGISTRY_PROPAGATION_BUDGET_MS)} elapsed) — retrying in ${delayMs}ms`,
    );
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
