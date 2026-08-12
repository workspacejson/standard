#!/usr/bin/env node

// Red tests for scripts/verify-package-tarball.mjs.
//
// The packed-tarball gate is the last thing standing between a defect and a
// permanent registry version, so "it passed on the real packages" is not
// evidence that it would catch anything. Each case below copies a real package
// into a scratch directory, breaks exactly one property, packs it for real, and
// asserts the gate refuses the tarball.
//
// Cases run against `packages/spec` unless stated otherwise: spec has no
// fixed-group sibling, so a mutation there tests the rule under test and not the
// workspace-protocol rewrite. The two cases that need a sibling say so.
//
// The packer is pinned to npm. The gate supports both, and pnpm's rewrite of
// `workspace:` would otherwise silently repair one of the defects being tested.

import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const guard = join(repoRoot, "scripts", "verify-package-tarball.mjs");

for (const pkg of ["spec", "rules"]) {
  if (!existsSync(join(repoRoot, "packages", pkg, "dist"))) {
    console.error(
      `verify-package-tarball.test: packages/${pkg}/dist is missing.\n` +
        "  These cases pack real artifacts rather than fixtures. Run `pnpm -r build` first.",
    );
    process.exit(1);
  }
}

// node_modules is excluded deliberately: it is a symlink farm in a pnpm
// workspace, and `npm pack --ignore-scripts` does not need it.
function copyPackage(name, into) {
  cpSync(join(repoRoot, "packages", name), into, {
    recursive: true,
    filter: (src) => basename(src) !== "node_modules",
  });
}

function withPackage(name, mutate) {
  const dir = mkdtempSync(join(tmpdir(), `wsjson-pack-${name}-`));
  try {
    copyPackage(name, dir);
    mutate(dir);
    const result = spawnSync("node", [guard], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, WORKSPACEJSON_PACKER: "npm", npm_execpath: "" },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const patchManifest = (dir, fn) => {
  const p = join(dir, "package.json");
  const m = JSON.parse(readFileSync(p, "utf8"));
  fn(m);
  writeFileSync(p, JSON.stringify(m, null, 2));
};

const cases = [];
const accept = (pkg, name, mutate) => cases.push({ pkg, name, expectReject: false, needle: null, mutate });
const reject = (pkg, name, needle, mutate) => cases.push({ pkg, name, expectReject: true, needle, mutate });

// ---------------------------------------------------------------- baselines
accept("spec", "baseline: the real spec package packs and verifies", () => {});

// The fixed-group sibling pinned to an exact version is the other legitimate
// arrangement, and it must survive both the committed and the packed check.
accept("rules", "baseline: a fixed-group sibling pinned to an exact version is ACCEPTED", (d) =>
  patchManifest(d, (m) => {
    m.dependencies["@workspacejson/spec"] = m.version;
  }));

// --------------------------------------------------- bypass dependency forms
const bypassCases = [
  ["a sibling-checkout path dependency", "file:../spec", "filesystem path dependency"],
  ["a link: dependency", "link:../spec", "filesystem path dependency"],
  ["a bare relative path dependency", "../spec", "filesystem path dependency"],
  ["an unpublished git dependency", "git+https://github.com/workspacejson/standard.git#main", "unpublished git dependency"],
  ["a GitHub shorthand dependency", "github:workspacejson/standard", "unpublished git-host dependency"],
  ["a bare user/repo shorthand dependency", "workspacejson/standard", "not a registry-resolvable"],
  ["a URL tarball dependency", "https://example.invalid/pkg.tgz", "URL tarball dependency"],
];

for (const [label, specifier, needle] of bypassCases) {
  reject("spec", `${label} is refused`, needle, (d) =>
    patchManifest(d, (m) => {
      m.dependencies["some-dep"] = specifier;
    }));
}

// `workspace:` is exempted in committed source for fixed-group siblings only,
// and never in the packed manifest. On a package outside the group it is exactly
// as unresolvable as a path dependency, and the packed check refuses it first.
reject("spec", "a workspace: link to a package outside the fixed group is refused", "workspace:", (d) =>
  patchManifest(d, (m) => {
    m.dependencies["some-dep"] = "workspace:*";
  }));

// peerDependencies are installed by consumers too, so the same rule applies.
reject("spec", "a bypass specifier hiding in peerDependencies is refused", "filesystem path dependency", (d) =>
  patchManifest(d, (m) => {
    m.peerDependencies = { "some-peer": "file:../elsewhere" };
  }));

// The inverse: devDependencies are never installed by a consumer, so a path
// there is not a defect. Without this case the rule above could be "reject every
// path anywhere", which would fail legitimate packages.
accept("spec", "a path devDependency is ACCEPTED — consumers never install it", (d) =>
  patchManifest(d, (m) => {
    m.devDependencies["some-tool"] = "file:../tooling";
  }));

// -------------------------------------------------- packed workspace rewrite
// `@workspacejson/rules` commits `"@workspacejson/spec": "workspace:*"`, which is
// correct in source because the packer rewrites it to the exact version. This
// packs it with the rewrite absent, which is what a broken or misconfigured
// packer would produce, and asserts the published artifact is refused rather
// than shipped with a specifier npm cannot resolve.
reject("rules", "a workspace: protocol surviving into the packed manifest is refused", "workspace:", () => {});

// ------------------------------------------------------------- ownership
reject("spec", "a package this repository does not own is refused", "not owned by workspacejson/standard", (d) =>
  patchManifest(d, (m) => {
    m.name = "@workspacejson/cli";
  }));

reject("spec", "repository metadata pointing at the retired organization is refused", "expected", (d) =>
  patchManifest(d, (m) => {
    m.repository.url = "git+https://github.com/workspace-json/agents-audit.git";
  }));

reject("spec", "a bugs URL pointing somewhere else is refused", "bugs.url", (d) =>
  patchManifest(d, (m) => {
    m.bugs.url = "https://github.com/workspace-json/agents-audit/issues";
  }));

// ------------------------------------------------------------ runtime files
reject("spec", "dropping schema/ from files breaks validate() at runtime", "schema/v1.json", (d) =>
  patchManifest(d, (m) => {
    m.files = m.files.filter((f) => f !== "schema");
  }));

// `bin` is dropped alongside `files` because npm packs a declared bin target
// whether or not `files` lists it — leaving it in place would have packed
// dist/cli.js and made this case pass for the wrong reason.
reject("spec", "dropping dist/ from files ships a package with no code", "missing dist/", (d) =>
  patchManifest(d, (m) => {
    m.files = m.files.filter((f) => f !== "dist");
    delete m.bin;
  }));

reject("spec", "a bin target that is not packed is refused", "missing bin target", (d) =>
  patchManifest(d, (m) => {
    m.bin = { "workspacejson-spec": "./dist/not-packed.js" };
  }));

// ---------------------------------------------------------------- run
let passed = 0;
let failed = 0;
for (const c of cases) {
  const { status, out } = withPackage(c.pkg, c.mutate);
  const rejected = status !== 0;
  let ok = rejected === c.expectReject;
  if (ok && c.expectReject && c.needle) ok = out.includes(c.needle);

  if (ok) {
    passed++;
    console.log(`PASS  [${c.pkg}] ${c.expectReject ? "refused — " : ""}${c.name}`);
  } else {
    failed++;
    console.log(`FAIL  [${c.pkg}] ${c.name}`);
    console.log(`        expected ${c.expectReject ? `refusal mentioning ${JSON.stringify(c.needle)}` : "acceptance"}, got exit ${status}`);
    console.log(out.split("\n").map((l) => `        ${l}`).join("\n"));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
