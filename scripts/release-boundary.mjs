#!/usr/bin/env node

// The publication boundary.
//
// Everything before this point is verification and is safe to run anywhere,
// including on a branch, a fork or a dry run. Everything after it mutates a
// public registry permanently and cannot be undone — an npm version, once
// published, is not replaceable even by its own publisher.
//
// So the decision to cross gets one place, one set of rules, and an answer that
// is printed rather than inferred from which steps happened to be skipped.
//
// Publication requires ALL of:
//
//   * an explicit non-dry run — dry run is the DEFAULT, so forgetting the flag
//     verifies instead of publishing;
//   * a tag ref, because a branch has no release identity to check a version
//     against;
//   * a package-scoped `standard-v*` tag, so this repository can never claim a
//     release belonging to workspacejson/cli or workspacejson/integrations.
//
// Anything else is a REFUSAL, not a failure: the run is green, nothing is
// published, and the reason is stated. Reserving red for genuine faults is what
// keeps a red release run meaningful.
//
// The one thing this does NOT decide is whether the credential works. That is
// verify-npm-publish-access.mjs, and it runs on the far side of this boundary so
// that no dry run ever needs a token to exist.

import { appendFileSync } from "node:fs";

const TAG_PREFIX = "standard-v";

const refType = process.env.GITHUB_REF_TYPE ?? "";
const refName = process.env.WORKSPACEJSON_RELEASE_TAG || process.env.GITHUB_REF_NAME || "";

// Dry run is the default in every direction: unset, empty, or anything that is
// not exactly "false" means verify-only. A typo cannot turn into a publication.
const dryRunInput = (process.env.WORKSPACEJSON_RELEASE_DRY_RUN ?? "").trim().toLowerCase();
const isDryRun = dryRunInput !== "false";

let proceed = false;
let reason;

if (isDryRun) {
  reason =
    `dry run (WORKSPACEJSON_RELEASE_DRY_RUN=${JSON.stringify(dryRunInput || "<unset>")}). ` +
    "Verification ran in full; the registry was not contacted for publication.";
} else if (refType !== "tag") {
  reason =
    `ref ${JSON.stringify(refName || "<unknown>")} is a ${refType || "non-tag"} ref. ` +
    "A release must be cut from a tag, because the version is checked against the tag's identity.";
} else if (!refName.startsWith(TAG_PREFIX)) {
  reason =
    `tag ${JSON.stringify(refName)} is not package-scoped. ` +
    `This repository publishes only its own fixed group and releases it as ${TAG_PREFIX}<version>.`;
} else {
  proceed = true;
  reason = `tag ${JSON.stringify(refName)} authorizes publication of the fixed group.`;
}

const verdict = proceed ? "PROCEED" : "REFUSED";
console.log(`release-boundary: ${verdict} — ${reason}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `proceed=${proceed}\n`);
}

// The step summary is what a human reads when they open the run. A refusal that
// only exists in collapsed log output is a refusal someone will misread as a
// successful release.
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Release boundary: ${verdict}\n\n${reason}\n\n` +
      (proceed ? "Publication steps will run.\n" : "**Nothing was published.**\n"),
  );
}

process.exit(0);
