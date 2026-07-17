#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const username = JSON.parse(run("npm", ["whoami", "--json"]));

// `npm access` reports package visibility or package enumeration; it does not
// reliably expose a granular token's effective publish grants. `whoami` proves
// that the workflow delivered the credential. npm then authorizes the actual
// publish, and the following registry-install verification proves its result.
console.log(`Verified npm publisher identity: ${username}`);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}
