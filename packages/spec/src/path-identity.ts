/**
 * Canonical stored-key validation — ADR-006.
 *
 * Stored artifact paths are data, not commands. A path-bearing value in
 * `workspace.json` must already be a canonical repository-relative key. This
 * module decides whether one is. It never produces one.
 *
 * Four properties, all load-bearing:
 *
 * - **Pure and total.** Every string gets an answer; nothing throws, nothing is
 *   memoized, nothing observes the environment.
 * - **Filesystem-free.** No `fs`, no `path`, no `process`. A key means the same
 *   thing on every platform, so deciding it must not consult one.
 * - **Applied to the original string.** Every check below runs on the input as
 *   given, before any path library sees it. That ordering is the entire defect
 *   ADR-006 was written about: the shipped consumers normalized first and
 *   validated second, so `src/../a.ts` was already `a.ts` by the time anything
 *   asked whether it was well-formed.
 * - **Never returns a repaired key.** The result carries a verdict and a
 *   reason. There is deliberately no field holding a "fixed" spelling, because
 *   a caller that has one will eventually use it.
 *
 * `canonicalizeHostQuery` is NOT here and must not be added here. Turning a
 * host path into a key needs a filesystem and a proven repository root, and
 * ADR-006 §10 assigns it to integrations and hosts. This module is the half of
 * the contract that can be decided from the string alone.
 */

/**
 * Why a stored key was rejected.
 *
 * These identifiers are the corpus's declared classifications
 * (`conformance/path-identity/corpus.json`). Two implementations that reject
 * the same key for the same cause report the same string, which is what lets a
 * producer and a reader be compared at all.
 */
export type StoredKeyRejection =
  | 'empty'
  | 'nul'
  | 'unpaired-surrogate'
  | 'unc-prefix'
  | 'drive-letter'
  | 'backslash'
  | 'absolute-posix'
  | 'leading-dot-slash'
  | 'dot-segment'
  | 'dotdot-segment'
  | 'repeated-separator'
  | 'trailing-separator';

/**
 * The verdict.
 *
 * Note what a valid result carries: the input, unchanged. Not a normalized
 * form, not a canonical spelling — the same string. `A.ts` and `a.ts` are
 * different keys and both are valid; so are the NFC and NFD spellings of
 * `café.ts`. Returning the input verbatim is how the type refuses to become a
 * repair channel.
 */
export type StoredKeyResult =
  | { readonly valid: true; readonly key: string }
  | { readonly valid: false; readonly reason: StoredKeyRejection };

const HIGH_SURROGATE_START = 0xd800;
const LOW_SURROGATE_END = 0xdfff;
const LOW_SURROGATE_START = 0xdc00;
const HIGH_SURROGATE_END = 0xdbff;

/**
 * True when the string contains a surrogate code unit that is not part of a
 * valid pair.
 *
 * `String.prototype.isWellFormed` does exactly this and is available from Node
 * 20, which is this package's floor — but it is scanned by hand here so the
 * check is auditable next to the rule it enforces, and so the reason a key is
 * rejected is visible rather than delegated.
 *
 * Why this and not a U+FFFD check: an unpaired surrogate is detectable *from
 * the string*, because no valid UTF-8 byte sequence produces one. A substituted
 * U+FFFD is not — it is indistinguishable from a U+FFFD that is genuinely in
 * the pathname, and telling them apart requires re-encoding and comparing the
 * original bytes. That comparison belongs to acquisition (ADR-006 §5) and
 * cannot happen here, where there are no bytes.
 */
function hasUnpairedSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit < HIGH_SURROGATE_START || unit > LOW_SURROGATE_END) continue;
    if (unit > HIGH_SURROGATE_END) return true; // a low surrogate with no high before it
    const next = value.charCodeAt(i + 1);
    if (Number.isNaN(next) || next < LOW_SURROGATE_START || next > LOW_SURROGATE_END) return true;
    i += 1; // a well-formed pair; step over the low half
  }
  return false;
}

/** `C:`, `c:/…`, `Z:\…` — a Windows drive designator in any spelling. */
function hasDriveLetter(value: string): boolean {
  return /^[A-Za-z]:/.test(value);
}

/**
 * Decide whether a stored artifact key is canonical.
 *
 * Pure, total, filesystem-free, and applied to `rawKey` exactly as given.
 *
 * ```ts
 * validateStoredKey('src/a.ts');    // { valid: true,  key: 'src/a.ts' }
 * validateStoredKey('src/../a.ts'); // { valid: false, reason: 'dotdot-segment' }
 * ```
 *
 * The second result is the point of the whole record: there is no `a.ts`
 * anywhere in it. A malformed key is refused, not repaired, and it matches
 * nothing — including the value normalization would have produced.
 *
 * **Ordering is part of the contract.** A malformed key often violates several
 * rules at once, and a reason is only comparable across implementations if
 * every implementation picks the same one. The precedence below is fixed and
 * runs most-fundamental first: a key that cannot be a string at all, then one
 * that cannot be POSIX, then one that is merely non-canonical.
 *
 * @param rawKey the key exactly as stored. Non-string input is rejected as
 *   `empty` rather than throwing, because this function is total.
 */
export function validateStoredKey(rawKey: string): StoredKeyResult {
  const invalid = (reason: StoredKeyRejection): StoredKeyResult => ({ valid: false, reason });

  // Totality guard. Callers reading untyped JSON reach here with anything.
  if (typeof rawKey !== 'string' || rawKey.length === 0) return invalid('empty');

  // 1. Cannot be a well-formed Unicode string at all.
  if (rawKey.includes('\u0000')) return invalid('nul');
  if (hasUnpairedSurrogate(rawKey)) return invalid('unpaired-surrogate');

  // 2. Cannot be a POSIX repository-relative path. UNC is checked before the
  //    general backslash rule so `\\unc\share\x` reports the specific cause,
  //    and the drive letter before it too — both are "absolute, non-POSIX",
  //    which is more informative than "contains a backslash".
  if (rawKey.startsWith('\\\\')) return invalid('unc-prefix');
  if (hasDriveLetter(rawKey)) return invalid('drive-letter');
  if (rawKey.includes('\\')) return invalid('backslash');
  if (rawKey.startsWith('/')) return invalid('absolute-posix');

  // 3. Is a relative POSIX path, but not a canonical one. `./x` is reported as
  //    leading-dot-slash rather than dot-segment: both are true, and the
  //    specific one tells a producer what to stop emitting.
  if (rawKey.startsWith('./')) return invalid('leading-dot-slash');
  if (rawKey.includes('//')) return invalid('repeated-separator');
  if (rawKey.endsWith('/')) return invalid('trailing-separator');

  // Segment rules last: by here the string splits cleanly on a single `/`.
  // Note `.` and `..` are matched as whole segments. `..hidden.ts` and `...`
  // are ordinary names and must survive — a substring test would eat both.
  for (const segment of rawKey.split('/')) {
    if (segment === '.') return invalid('dot-segment');
    if (segment === '..') return invalid('dotdot-segment');
  }

  // Valid. The input, unchanged — see StoredKeyResult.
  return { valid: true, key: rawKey };
}
