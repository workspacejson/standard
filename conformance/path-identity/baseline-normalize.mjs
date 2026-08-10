// WATCHED-RED BASELINE — the defect, reproduced so it can be measured.
//
// This is NOT the reference implementation and must never be imported as one.
// It is a faithful reproduction of the matcher that ships TODAY in the two
// consumers, kept here so ADR-006's central claim — that stored keys are being
// silently repaired — is a measurement in this repository rather than an
// assertion about someone else's.
//
// Reproduced rather than imported. The architecture guard forbids importing
// across repository boundaries, and a sibling-checkout import would make this
// evidence unrunnable outside a full multi-repository checkout. What is copied
// is the CAUSE (`node:path.normalize` applied to a stored key), which is three
// lines and stable; the consumers are cited by location so a reader can verify
// the reproduction is faithful:
//
//   workspacejson/integrations  src/path-match.ts:15-20  (MCP server)
//   workspacejson/integrations  extension/src/pathMatch.ts:10-15  (VS Code)
//   workspace-json/codex-mcp    same two files, byte-identical
//
// Verified byte-identical between the two repositories at
// integrations 219d3322 and codex-mcp ddcd7b70 (`diff -q`, 2026-08-09).
//
// When Phase 4 replaces those matchers, this file stays. It is the regression
// witness: if a future reader reintroduces normalize-on-stored-key, the receipt
// this produces changes and the gate notices.

import { isAbsolute, normalize } from "node:path";

/** Reproduction of `normalizeKey` as shipped. Applied to BOTH query and stored key. */
export function baselineNormalizeKey(p) {
  let s = normalize(p).replace(/\\/g, "/");
  s = s.replace(/^\.\//, "");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

/** Reproduction of `pathsMatch` as shipped, including the suffix fallback §8 forbids. */
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

/** The shipped pipeline, in the shipped order: normalize, then validate. */
export function baselineAdmitStoredKey(rawKey) {
  const normalized = baselineNormalizeKey(rawKey);
  return { normalized, admitted: baselineIsValidRelativeKey(normalized) };
}
