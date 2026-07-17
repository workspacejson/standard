#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const packages = ["@workspacejson/spec", "@workspacejson/rules", "agents-audit"];
const username = JSON.parse(run("npm", ["whoami", "--json"]));
const access = JSON.parse(run("npm", ["access", "list", "packages", username, "--json"]));
const missing = packages.filter((name) => access[name] !== "read-write");

if (missing.length > 0) {
  const observed = missing.map((name) => `${name}=${JSON.stringify(access[name] ?? "none")}`).join(", ");
  throw new Error(`npm publisher ${username} lacks read-write access: ${observed}`);
}

console.log(`Verified npm read-write publish access for ${username}: ${packages.join(", ")}`);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}
