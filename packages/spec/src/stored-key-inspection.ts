/**
 * Path-bearing document inspection — ADR-006 §9, reader obligation 1.
 *
 * `validateStoredKey` decides one key. This decides one *document*: it walks
 * every ratified path-bearing surface and reports each malformed occurrence
 * with enough location to act on. That is the "report it" half of §9. The
 * "decline to match it" half stays with the caller, because only the caller
 * knows what a lookup is.
 *
 * ## Why this is a separate module from `path-identity.ts`
 *
 * `path-identity.ts` has no imports at all, and a mutation guard asserts it —
 * the stored-key grammar is decidable from a string and must never acquire a
 * dependency that could make it consult a filesystem or a document shape. This
 * module necessarily imports both the grammar and the document types, so it
 * lives next to that module rather than inside it.
 *
 * ## Input domain
 *
 * The parameter is a schema-validated v0.3/v0.4 document, NOT `unknown`. That
 * is a deliberate narrowing, and it is what makes an empty result mean
 * something:
 *
 * ```ts
 * if (!validate(raw)) {
 *   // Existing invalid-document handling. `raw` is not inspectable.
 * } else {
 *   const findings = inspectStoredKeys(raw);
 * }
 * ```
 *
 * - `[]` — every inspected path-bearing value in an accepted document is
 *   well-formed.
 * - a nonempty array — every malformed occurrence, one finding each.
 * - anything unvalidated or schema-invalid — outside this function's declared
 *   input domain. It is not "clean"; it was never in scope.
 *
 * This function does **not** call `validate()` internally and is not a second
 * document validator. Folding the two together would destroy exactly that
 * distinction: a caller could no longer tell "this document is fine" from "this
 * document was never checked". Two questions, two functions, composed by the
 * caller in the order shown above.
 *
 * ## What it never does
 *
 * It does not mutate the document, does not deduplicate, does not normalize,
 * and never returns a repaired spelling. `rawKey` is the stored value exactly
 * as found — the finding is a *report*, and a report that silently rewrote its
 * subject would reintroduce the defect ADR-006 exists to prevent.
 */

import { validateStoredKey } from './path-identity.js';
import type { StoredKeyRejection } from './path-identity.js';
import type { WorkspaceJsonV3, WorkspaceJsonV4 } from './types.js';

/**
 * The declared input domain: a document that `validate()` has already accepted.
 *
 * Spelled as its own alias rather than reusing the union inline, so that the
 * narrowing is visible at the call site and so a future profile is added in one
 * place.
 */
export type StoredKeyDocument = WorkspaceJsonV3 | WorkspaceJsonV4;

/**
 * Which ratified surface a finding came from.
 *
 * The four members are the four path-bearing surfaces that are ratified today.
 * They are named by their document shape rather than by a consumer, and the
 * `[]` markers are part of the identifier so a reader can tell a collection
 * element from a scalar without consulting the pointer.
 *
 * `manual.coChangePatterns` is deliberately NOT a member — see the note on
 * {@link inspectStoredKeys}.
 */
export type StoredKeySurface =
  | 'generated.fileIndex'
  | 'generated.coChange[].files[]'
  | 'generated.fragility[].file'
  | 'manual.fragileFiles[].path';

/**
 * One malformed occurrence, at one location.
 *
 * A finding is a location-bearing record, not a set member. Two identical
 * malformed spellings at two locations are two findings, because a caller
 * reporting them has to point at both places.
 */
export type StoredKeyFinding = {
  /**
   * RFC 6901 JSON Pointer to the offending value, resolved against the document
   * root. Array indexes are exact. Property tokens are escaped: `~` → `~0`,
   * `/` → `~1`.
   */
  readonly pointer: string;
  /** The ratified surface this occurrence sits on. */
  readonly surface: StoredKeySurface;
  /**
   * The stored value exactly as found — never normalized, never repaired.
   * This is the string a producer actually wrote.
   */
  readonly rawKey: string;
  /** The classification, from `validateStoredKey`. Never re-derived here. */
  readonly reason: StoredKeyRejection;
};

/**
 * Escape one RFC 6901 reference token.
 *
 * `~` first, then `/`. The other order is the classic bug: escaping `/` to `~1`
 * first and then escaping `~` would turn that fresh `~1` into `~01`, so a key
 * containing a literal `/` would round-trip to the wrong pointer. A stored key
 * containing `~` is legal under the grammar, so this is reachable, not
 * theoretical.
 */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Report every malformed stored key on every ratified path-bearing surface of
 * an already-validated document.
 *
 * ```ts
 * if (!validate(raw)) {
 *   // Existing invalid-document handling.
 * } else {
 *   const findings = inspectStoredKeys(raw);
 * }
 * ```
 *
 * Inspected surfaces, all four of them:
 *
 * 1. keys of `generated.fileIndex`
 * 2. every element of `generated.coChange[].files`
 * 3. every `generated.fragility[].file`
 * 4. every `manual.fragileFiles[].path`
 *
 * ## `manual.coChangePatterns` is deliberately NOT inspected
 *
 * Its item shape is not ratified. ADR-003 amendment A-005 dispositions it
 * "Keep and specify" and records that items "are currently bare objects and
 * need a canonical item profile" — and the packaged schema agrees, constraining
 * items to no more than `{"type": "object"}`. The TypeScript mirror in
 * `types.ts` declares `files: string[]`, but that is an authoring-time
 * convenience that no schema and no ADR has ratified.
 *
 * Walking a presumed `files` field here would quietly promote that TypeScript
 * assumption into a normative contract: the moment this function reports a
 * finding at `/manual/coChangePatterns/0/files/0`, the standard has asserted
 * that the field exists and is path-bearing, in an implementation, ahead of the
 * record that decides it. When A-005 ratifies the item profile, the surface is
 * added here, to the corpus, and to the union above — together.
 *
 * ## Order carries no meaning
 *
 * Findings come out in traversal order, which is stable for a given document
 * but is not part of the contract. Consumers must treat the result as a bag of
 * location-bearing records and match on `pointer`, never on position.
 *
 * @param document a document `validate()` has already accepted. Values outside
 *   that domain are not this function's concern — see the module note.
 * @returns one finding per malformed occurrence; `[]` when every inspected
 *   value is well-formed. Never deduplicated, never sorted, never repaired.
 */
export function inspectStoredKeys(document: StoredKeyDocument): readonly StoredKeyFinding[] {
  const findings: StoredKeyFinding[] = [];

  /**
   * Classify one occurrence.
   *
   * Non-string values are skipped rather than reported. On a schema-validated
   * document every one of these positions is a string when it is present at
   * all, so this branch only fires for an absent optional property — and an
   * absent property has no stored value to classify and no `rawKey` to
   * preserve. Reporting one would mean inventing the very spelling this module
   * refuses to invent. Whether the property ought to be required is a schema
   * question, and is not decided here.
   */
  const inspect = (value: unknown, surface: StoredKeySurface, pointer: string): void => {
    if (typeof value !== 'string') return;
    const result = validateStoredKey(value);
    if (result.valid) return;
    findings.push({ pointer, surface, rawKey: value, reason: result.reason });
  };

  const generated: unknown = document.generated;
  if (isRecord(generated)) {
    // 1. fileIndex — the key itself is the path-bearing value, so the pointer
    //    has to address the property, with the key escaped as a reference
    //    token. A malformed key is still a real property of a real object.
    const fileIndex = generated['fileIndex'];
    if (isRecord(fileIndex)) {
      for (const rawKey of Object.keys(fileIndex)) {
        inspect(rawKey, 'generated.fileIndex', `/generated/fileIndex/${escapePointerToken(rawKey)}`);
      }
    }

    // 2. coChange[].files[] — both elements, with both indexes in the pointer.
    //    `files` is a set of exactly two with no positional meaning (see
    //    CoChangeEntryCommon), so the index is a *location*, not a role.
    const coChange = generated['coChange'];
    if (Array.isArray(coChange)) {
      coChange.forEach((entry, entryIndex) => {
        const files = isRecord(entry) ? entry['files'] : undefined;
        if (!Array.isArray(files)) return;
        files.forEach((file, fileIndexPosition) => {
          inspect(
            file,
            'generated.coChange[].files[]',
            `/generated/coChange/${entryIndex}/files/${fileIndexPosition}`,
          );
        });
      });
    }

    // 3. fragility[].file
    const fragility = generated['fragility'];
    if (Array.isArray(fragility)) {
      fragility.forEach((entry, entryIndex) => {
        inspect(
          isRecord(entry) ? entry['file'] : undefined,
          'generated.fragility[].file',
          `/generated/fragility/${entryIndex}/file`,
        );
      });
    }
  }

  // 4. manual.fragileFiles[].path — human-authored, and inspected on exactly
  //    the same terms as machine-authored keys. A hand-written malformed path
  //    matches nothing either.
  const manual: unknown = document.manual;
  if (isRecord(manual)) {
    const fragileFiles = manual['fragileFiles'];
    if (Array.isArray(fragileFiles)) {
      fragileFiles.forEach((entry, entryIndex) => {
        inspect(
          isRecord(entry) ? entry['path'] : undefined,
          'manual.fragileFiles[].path',
          `/manual/fragileFiles/${entryIndex}/path`,
        );
      });
    }
  }

  // manual.coChangePatterns: intentionally absent. A-005 has not ratified the
  // item shape. Do not add a walk here without that ratification.

  return findings;
}
