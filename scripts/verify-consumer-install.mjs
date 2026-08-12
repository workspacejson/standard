#!/usr/bin/env node

// Disposable-consumer gate: install the packed tarballs the way a stranger would
// and exercise the public surface from outside the repository.
//
// Everything before this point runs inside the workspace, where TypeScript path
// mapping, pnpm links and the source tree quietly supply anything the package
// forgot to ship. This step deletes all of that: two tarballs, an empty
// directory, a real `npm install`, and imports by package name only.
//
// It is the last gate before publication and the only one whose failure mode is
// "the published package does not work", as opposed to "the source is wrong".
//
// What is proven here, and nowhere else:
//
//   * both fixed-group tarballs install together from nothing, with the sibling
//     dependency resolving to the packed artifact rather than to whatever the
//     registry happens to hold for that version;
//   * `@workspacejson/spec` imports by name and reports the version it packed;
//   * the schema resolves through the `./schema` export, parses, and still
//     carries the four stable read paths;
//   * `@workspacejson/rules` imports by name, and `./testing` RESOLVES — it is
//     deliberately not evaluated, because it re-exports vitest helpers that
//     throw outside a vitest run;
//   * the `workspacejson-spec` binary runs from the installed package.
//
// Each tarball's sha256 is printed as a release receipt so the artifact verified
// here can be matched against the artifact that was published.
//
// Nothing here contacts a registry for the packages under test, and nothing is
// published. Transitive third-party dependencies are fetched normally.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_GROUP = ["spec", "rules"];

// The four interoperability paths. They are asserted here against the schema a
// consumer actually receives, not against the one in the source tree.
const STABLE_READ_PATHS = ["fragileFiles", "coChangePatterns", "fileIndex", "frameworkManifest"];

const work = mkdtempSync(join(tmpdir(), "wsjson-consumer-"));
const consumer = join(work, "consumer");

try {
  // ---- Pack exactly what would be published --------------------------------
  // pnpm, not npm: pnpm is what rewrites the `workspace:` sibling link to the
  // exact version. Packing with anything else would test an artifact this
  // repository does not produce.
  const tarballs = new Map();
  for (const name of FIXED_GROUP) {
    const packageDir = join(repoRoot, "packages", name);
    execFileSync("pnpm", ["pack", "--pack-destination", work], { cwd: packageDir, stdio: ["ignore", "pipe", "pipe"] });
  }

  const packed = readdirSync(work).filter((f) => f.endsWith(".tgz"));
  for (const name of FIXED_GROUP) {
    const file = packed.find((f) => f.startsWith(`workspacejson-${name}-`));
    if (!file) throw new Error(`pnpm pack produced no tarball for packages/${name} (saw: ${packed.join(", ") || "nothing"}).`);
    const path = join(work, file);
    const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
    tarballs.set(`@workspacejson/${name}`, { path, file, sha256 });
    console.log(`packed  ${file}  sha256:${sha256}`);
  }

  const expectedVersion = JSON.parse(readFileSync(join(repoRoot, "packages/spec/package.json"), "utf8")).version;

  // ---- A consumer that has never seen this repository ----------------------
  // `overrides` pins @workspacejson/rules' declared dependency on its sibling to
  // the packed tarball. Without it npm would resolve that dependency from the
  // registry — which, for an unpublished version, either fails or silently
  // installs a DIFFERENT build than the one under test.
  const specTarball = `file:${tarballs.get("@workspacejson/spec").path}`;
  const rulesTarball = `file:${tarballs.get("@workspacejson/rules").path}`;
  execFileSync("mkdir", ["-p", consumer]);
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: "workspacejson-release-consumer",
        private: true,
        type: "module",
        dependencies: { "@workspacejson/spec": specTarball, "@workspacejson/rules": rulesTarball },
        overrides: { "@workspacejson/spec": specTarball },
      },
      null,
      2,
    )}\n`,
  );

  // `--ignore-scripts`: a consumer install must not need the package's own
  // lifecycle scripts, and running them here would re-enter the build.
  run("npm", ["install", "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund"], consumer);

  // ---- Exercise the public surface by name only ----------------------------
  const probe = `
    import { readFileSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';

    const expectedVersion = ${JSON.stringify(expectedVersion)};
    const stablePaths = ${JSON.stringify(STABLE_READ_PATHS)};

    const spec = await import('@workspacejson/spec');
    if (typeof spec.validate !== 'function') throw new Error('@workspacejson/spec does not export validate()');
    if (spec.version !== expectedVersion) {
      throw new Error(\`installed @workspacejson/spec reports version \${spec.version}, expected \${expectedVersion}\`);
    }

    const schemaUrl = import.meta.resolve('@workspacejson/spec/schema');
    const schema = JSON.parse(readFileSync(fileURLToPath(schemaUrl), 'utf8'));
    if (typeof schema.$id !== 'string') throw new Error('the packaged schema has no $id');
    const schemaText = JSON.stringify(schema);
    for (const path of stablePaths) {
      if (!schemaText.includes(path)) throw new Error(\`the packaged schema is missing the stable read path \${path}\`);
    }

    const rules = await import('@workspacejson/rules');
    if (Object.keys(rules).length === 0) throw new Error('@workspacejson/rules exports nothing');

    // Resolution, not evaluation: ./testing re-exports vitest helpers that throw
    // when loaded outside a vitest run. CI makes the same distinction.
    const testingUrl = import.meta.resolve('@workspacejson/rules/testing');
    if (!testingUrl.endsWith('/dist/testing/rule-tester.js')) {
      throw new Error('unexpected ./testing resolution: ' + testingUrl);
    }

    console.log('consumer: @workspacejson/spec@' + spec.version + ' validate() present, schema $id ' + schema.$id);
    console.log('consumer: @workspacejson/rules exports ' + Object.keys(rules).length + ' names; ./testing resolves');
  `;
  run("node", ["--input-type=module", "-e", probe], consumer);

  // ---- The binary, from the installed package ------------------------------
  // The document comes from this repository and the implementation from the
  // tarball, so a pass means the shipped binary validates a real artifact.
  const example = join(repoRoot, "packages/spec/examples/populated-v0.4.json");
  run("npx", ["--no-install", "workspacejson-spec", "validate", example], consumer);
  console.log("consumer: workspacejson-spec validate accepted a real v0.4 artifact");

  console.log(`\nverify-consumer-install: OK — the fixed group installs and runs from packed artifacts at ${expectedVersion}.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.trim()) process.stdout.write(`${result.trimEnd()}\n`);
  return result;
}
