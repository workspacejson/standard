// HISTORICAL DEFECT WITNESS — a frozen specimen, pinned to two revisions.
//
// This is NOT the reference implementation and must never be imported as one.
// It is a reproduction of the matcher as it existed at the revisions pinned
// below, kept so that ADR-006's central claim — that stored keys were being
// silently repaired — is a measurement in this repository rather than an
// assertion about someone else's code.
//
// WHAT THIS CAN AND CANNOT DO. It is a frozen copy. It never executes either
// consumer, so it cannot observe them changing and cannot detect a future
// regression in `integrations` or `codex-mcp`. Those repositories detect their
// own regressions by running the normative corpus against their actual
// implementations, which is Phase 4 work in their own repositories. What this
// file supports is a historical claim: at the pinned revisions, the behavior
// below is what shipped.
//
// Pinned observation points:
//
//   workspacejson/integrations @ 219d3322f4fe39d21ae8a8b15b5634764b90df2c
//     src/path-match.ts                  normalizeKey, pathsMatch
//     extension/src/pathMatch.ts         normalizeKey, pathsMatch, isValidRelativeKey
//
//   workspace-json/codex-mcp   @ ddcd7b70ac231b1d8ec559bf69eea90ad8dd615d
//     src/path-match.ts                  byte-identical to the integrations copy
//     extension/src/pathMatch.ts         byte-identical to the integrations copy
//
// Byte-identity between the two repositories was verified with `diff -q` at
// those revisions on 2026-08-09.
//
// Reproduced rather than imported. The architecture guard forbids importing
// across repository boundaries, and a sibling-checkout import would make this
// evidence unrunnable outside a full multi-repository checkout. What is copied
// is the CAUSE — `node:path.normalize` applied to a stored key — which is three
// lines and was stable across both repositories at the pinned revisions.

import { isAbsolute, normalize } from "node:path";

/** `normalizeKey` as observed at the pinned revisions. Applied to BOTH query and stored key. */
export function baselineNormalizeKey(p) {
  let s = normalize(p).replace(/\\/g, "/");
  s = s.replace(/^\.\//, "");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

/** `pathsMatch` as observed at the pinned revisions, including the suffix fallback §8 forbids. */
export function baselinePathsMatch(query, storedKey) {
  const q = baselineNormalizeKey(query);
  const s = baselineNormalizeKey(storedKey);
  if (q === s) return true;
  if (isAbsolute(query) && s.includes("/") && q.endsWith(`/${s}`)) return true;
  return false;
}

/**
 * Reproduction of the extension's `isValidRelativeKey`.
 *
 * The ordering defect matters as much as the function: in the shipped consumer
 * this runs AFTER `normalizeKey` (see `extension/src/parseSnapshot.ts:66,88,147`),
 * so it cannot see malformation that normalization has already erased. A key of
 * `src/../a.ts` reaches it as `a.ts` and is pronounced valid.
 */
export function baselineIsValidRelativeKey(key) {
  return Boolean(key) && key !== "." && key !== ".." && !key.startsWith("../") && !key.startsWith("/");
}

/** The pipeline in the order observed at the pinned revisions: normalize, then validate. */
export function baselineAdmitStoredKey(rawKey) {
  const normalized = baselineNormalizeKey(rawKey);
  return { normalized, admitted: baselineIsValidRelativeKey(normalized) };
}
