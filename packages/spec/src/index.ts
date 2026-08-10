import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileSchemaValidator } from './validator.js';

export { workspaceJsonSchema } from './schema.js';
export { validateStoredKey } from './path-identity.js';
export type { StoredKeyResult, StoredKeyRejection } from './path-identity.js';
export type {
  WorkspaceJson,
  WorkspacePackage,
  WorkspaceConvention,
  WorkspaceAgentFiles,
  WorkspaceGitSummary,
  WorkspaceHygiene,
  WorkspaceJsonV3,
  FrameworkEntry,
  FileIndexEntry,
  IntelligenceState,
  CoChangeEntry,
  CoChangeEntryCommon,
  LegacyCoChangeEntry,
  ObservationCoChangeEntry,
  FragilityEntry,
  WorkspaceJsonV4,
} from './types.js';

import type { WorkspaceJsonV3, WorkspaceJsonV4 } from './types.js';

type WorkspaceJsonDocument = WorkspaceJsonV3 | WorkspaceJsonV4;

// The runtime validator consumes the schema artifact that is published with
// the package, rather than the authoring-time TypeScript mirror.
const packagedSchema = JSON.parse(
  readFileSync(fileURLToPath(new URL('../schema/v1.json', import.meta.url)), 'utf8'),
) as object;
const validateSchema = compileSchemaValidator<WorkspaceJsonDocument>(packagedSchema);

/**
 * The package version, read from the packaged manifest rather than duplicated
 * here.
 *
 * It used to be a hardcoded literal, with a unit test asserting the literal.
 * That pair passes only while someone remembers to edit both during a release —
 * and Changesets rewrites `package.json` and `CHANGELOG.md`, never a constant in
 * source. The first release to move the number would have shipped a package
 * reporting the previous version, or gone red on a test asserting a string
 * nobody updated. Deriving it removes the second source of truth; the test now
 * asserts parity with the manifest instead of a literal.
 *
 * `package.json` is always present in an npm tarball, so this resolves in a
 * consumer's `node_modules` exactly as it does here.
 */
const packagedManifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string };

export const version: string = packagedManifest.version;

/**
 * The one co-change counting invariant JSON Schema cannot express.
 *
 * `support` counts the qualifying commits in which BOTH files changed;
 * `occurrences` counts those in which AT LEAST ONE did. The first set is a
 * subset of the second, so `support > occurrences` is not a debatable value —
 * it is arithmetically impossible, and it marks a producer that counted file
 * events, ordered relationships or two different analysis boundaries.
 *
 * Draft 2020-12 has no way to compare two instance values, so this lives beside
 * the schema rather than inside it. It is declared as an out-of-schema producer
 * obligation in ADR-003 amendment A-009, because an implementer validating with
 * a bare JSON Schema validator will not catch it and must be told so.
 *
 * OBSERVATION-FORM ONLY. A legacy entry has no `support`, and its `occurrences`
 * carries the pre-amendment meaning — never specified, not necessarily a union,
 * and therefore not something this invariant can be applied to. Skipping those
 * entries is what keeps this release a widening: no artifact that validated
 * before now fails here.
 *
 * Shape is not re-checked: this runs only after the schema has accepted the
 * document, so both fields are known to be integers when an entry is
 * well-formed. Anything that is not an entry-shaped object is left alone.
 */
function coChangeCountsAreCoherent(data: unknown): boolean {
  const generated = (data as { generated?: { coChange?: unknown } })?.generated;
  const entries = generated?.coChange;
  if (!Array.isArray(entries)) return true;
  return entries.every((entry) => {
    const { support, occurrences } = (entry ?? {}) as { support?: unknown; occurrences?: unknown };
    if (typeof support !== 'number' || typeof occurrences !== 'number') return true;
    return support <= occurrences;
  });
}

export function validate(data: unknown): data is WorkspaceJsonV3 | WorkspaceJsonV4 {
  return validateSchema(data) && coChangeCountsAreCoherent(data);
}

export function validateV4(data: unknown): data is WorkspaceJsonV4 {
  if (!validate(data)) return false;
  const g = (data as WorkspaceJsonV4).generated;
  return g.specVersion === '0.4';
}

export function validateLegacy(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d['version'] !== 'string') return false;

  // A root `version` no longer identifies the pre-v0.3 shape on its own: ADR-004
  // makes it a legal optional mirror on v0.3/v0.4 documents. The distinguishing
  // property is the absence of `generated.specVersion`.
  //
  // Without this check a document whose two profile declarations disagree —
  // invalid under ADR-004 §4, so `validate()` rejects it — would fall through to
  // `!validate(data)` and be reported as a legacy v0.1/v0.2 document. That would
  // convert a detectable producer defect into a silent consumer misread, which
  // is the exact failure §4 exists to prevent.
  const generated = d['generated'];
  const declaresSpecVersion =
    typeof generated === 'object' &&
    generated !== null &&
    'specVersion' in (generated as Record<string, unknown>);
  if (declaresSpecVersion) return false;

  return !validate(data);
}
