#!/usr/bin/env node

// Credential gate: prove the release credential reached the runner, without
// exposing it.
//
// Two distinct failures, and they need distinct answers:
//
//   1. **The secret never arrived.** GitHub expands `${{ secrets.NPM_TOKEN }}`
//      to an empty string when the secret does not exist — no warning, no error.
//      The job then runs the publish unauthenticated and fails somewhere deep
//      inside npm with a message about permissions, which reads like a scope or
//      maintainer problem rather than a missing secret. Checking presence first
//      turns a long misdiagnosis into one line.
//   2. **The secret arrived but the registry rejects it** — expired, revoked, or
//      scoped to the wrong packages. `npm whoami` answers that, and only the
//      registry can.
//
// Nothing here prints, logs, hashes or length-reports the token. The only
// derived facts emitted are presence and the username the registry returns —
// which is not a secret and is the point of the check. Command output is
// scrubbed before it is written anywhere, because an npm failure that echoed its
// own configuration would otherwise put the token in a public build log.
//
// This does NOT establish that the token may publish these specific packages.
// `npm access` does not reliably expose a granular token's effective publish
// grants, so authorization stays with npm at publish time and the post-publish
// registry install is what proves the result.

import { spawnSync } from "node:child_process";

// npm reads NODE_AUTH_TOKEN through the committed .npmrc; NPM_TOKEN is the
// repository secret's name. Either arriving means the credential is present.
const CREDENTIAL_VARIABLES = ["NODE_AUTH_TOKEN", "NPM_TOKEN"];

const present = CREDENTIAL_VARIABLES.filter((name) => (process.env[name] ?? "").trim() !== "");

if (present.length === 0) {
  console.error(
    "verify-npm-publish-access: no release credential reached this job.\n" +
      `  Checked: ${CREDENTIAL_VARIABLES.join(", ")} — all unset or empty.\n` +
      "  An unset repository secret expands to an empty string, so this is exactly what a\n" +
      "  missing NPM_TOKEN looks like. Absence is a stop condition, never a skip.",
  );
  process.exit(1);
}

console.log(`Release credential present via ${present.join(", ")}; the value is not read, logged or derived from.`);

const secrets = CREDENTIAL_VARIABLES.map((name) => process.env[name]).filter((value) => value && value.length >= 8);
const scrub = (text) => secrets.reduce((acc, secret) => acc.split(secret).join("***"), text ?? "");

const whoami = spawnSync("npm", ["whoami"], { encoding: "utf8" });
process.stdout.write(scrub(whoami.stdout));
process.stderr.write(scrub(whoami.stderr));

if (whoami.status !== 0) {
  console.error(
    "verify-npm-publish-access: the registry rejected the credential.\n" +
      "  The token arrived, but `npm whoami` failed — expired, revoked, or not a publish token.",
  );
  process.exit(whoami.status ?? 1);
}

console.log(`Verified npm publisher identity: ${scrub(whoami.stdout).trim()}`);
