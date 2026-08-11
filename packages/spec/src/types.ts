export interface WorkspaceConvention {
  raw: string;
  type: 'filename-case' | 'directory-layout' | 'naming' | 'structural' | 'other';
  canonical: string;
}

export interface WorkspaceAgentFiles {
  agentsMd?: string;
  workspaceJson?: string;
}

export interface WorkspaceGitSummary {
  nonAgentsCommitCount30Days: number;
  filesChangedLast30Days: string[];
}

export interface WorkspaceHygiene {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  failCount: number;
  warnCount: number;
  scannedAt: string;
}

export interface WorkspacePackage {
  name?: string;
  path: string;
  agentsMd?: string;
  dependencies?: string[];
  [key: string]: unknown;
}

export interface WorkspaceJson {
  version: string;
  generatedAt?: string;
  repository?: string;
  topology?: 'single-package' | 'monorepo' | 'polyglot-monorepo';
  ciProvider?: 'github-actions' | 'gitlab-ci' | 'circleci' | 'jenkins' | 'none' | 'unknown';
  agentFiles?: WorkspaceAgentFiles;
  frameworks?: string[];
  conventions?: WorkspaceConvention[];
  packages?: WorkspacePackage[];
  gitSummary?: WorkspaceGitSummary;
  hygiene?: WorkspaceHygiene;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// v0.3 types

export interface FrameworkEntry {
  name: string;
  version?: string;
  confidence: number;
}

export interface FileIndexEntry {
  fragility?: number;
  aiModificationCount?: number;
  humanModificationCount?: number;
  [key: string]: unknown;
}

export type IntelligenceState = 'INSUFFICIENT_DATA' | 'OBSERVING' | 'CONFIDENT';

export interface WorkspaceJsonV3 {
  /**
   * Optional mirror of `generated.specVersion` (ADR-004). When present it must
   * equal `generated.specVersion`; a document where the two disagree is invalid
   * and `validate()` rejects it. Absence means the producer predates this
   * profile — it is not a signal, and consumers must not branch on it.
   *
   * Read the profile from `generated.specVersion`, which remains the primary
   * declaration and stays required.
   */
  version?: '0.3';
  manual: {
    fragileFiles?: Array<{ path: string; reason?: string }>;
    coChangePatterns?: Array<{ files: string[]; note?: string }>;
    [key: string]: unknown;
  };
  generated: {
    specVersion: '0.3';
    generatedAt: string;
    by: { name: string; version: string };
    frameworkManifest: FrameworkEntry[];
    fileIndex: Record<string, FileIndexEntry>;
    topology?: { packageCount?: number; [key: string]: unknown };
    warnings?: string[];
    [key: string]: unknown;
  };
  agents: Record<string, unknown>;
  health: {
    intelligenceState: IntelligenceState;
    observationCount: number;
    confidence: number;
    averageFragility?: number;
    fragileFileCount?: number;
    [key: string]: unknown;
  };
}

/** What both co-change entry forms carry, whichever form an entry takes. */
export interface CoChangeEntryCommon {
  /**
   * The co-changing pair. **Set semantics: exactly two entries, order NOT
   * meaningful** — `files[0]` carries no positional significance and consumers
   * must join by set membership, not index. Each entry is a
   * repository-root-relative POSIX path (forward slashes, no leading "./").
   * Invariant: length === 2 (mirrors schema minItems/maxItems: 2).
   */
  files: string[];
  /**
   * The denominator. **Its referent depends on which form the entry takes**, so
   * establish the form before reading it — see
   * {@link LegacyCoChangeEntry} and {@link ObservationCoChangeEntry}. Values
   * must not be compared across the two forms.
   */
  occurrences: number;
}

/**
 * The pre-amendment entry form: a derived `rate` plus an `occurrences` whose
 * meaning was never normatively specified and must not be assumed symmetric.
 *
 * **Deprecated, and accepted only for the v0.4 transition** so that artifacts
 * published before the observation form keep validating. New producers must not
 * emit it. Removed at the next document-profile change.
 */
export interface LegacyCoChangeEntry extends CoChangeEntryCommon {
  /** @deprecated Legacy form only. Derive `support / occurrences` instead. */
  rate: number;
  /** Never present in the legacy form — the two forms are mutually exclusive. */
  support?: never;
  /**
   * `true` = tooling-coupled pair (e.g. lockfile + manifest); consumers skip these.
   *
   * **Required in this form only.** Every artifact published in the legacy form
   * already carries it and that contract is frozen until the form is removed, so
   * widening it here would loosen a shape nobody should be emitting. New
   * producers do not emit this form at all — see
   * {@link ObservationCoChangeEntry.generated} for the three-state reading that
   * applies to everything written from now on.
   */
  generated: boolean;
}

/**
 * The current entry form: raw commit counts, symmetric under swapping the pair,
 * with no derived value stored.
 */
export interface ObservationCoChangeEntry extends CoChangeEntryCommon {
  /**
   * Distinct qualifying commits in which **both** files changed.
   *
   * Commits are counted, not file events and not ordered relationships — a
   * commit touching either file more than once counts once. Symmetric: swapping
   * the two entries of `files` does not change it.
   *
   * Invariant: `support <= occurrences`, because the commits counted here are a
   * subset of the commits `occurrences` counts. JSON Schema cannot compare two
   * instance values, so `validate()` enforces this and the packaged schema does
   * not.
   */
  support: number;
  /**
   * Distinct qualifying commits in which **at least one** of the two files
   * changed — the symmetric union denominator. Commits are counted, not file
   * events. Symmetric under swapping the pair.
   *
   * A *qualifying commit* is one inside the analysis boundary declared by the
   * producer, reachable from `generated.basisRevision`. The standard does not
   * define that boundary; it requires that one boundary is applied identically
   * to `support` and `occurrences` in every entry.
   *
   * **Minimum 1**, enforced by the schema for this form only. A pair whose
   * union of qualifying commits is empty was never observed changing at all, so
   * no entry may be emitted for it — absence of an entry, not a zero
   * denominator, represents an unobserved pair. `support / occurrences` is
   * therefore always defined on a conforming artifact, and no reader can derive
   * `0/0`, `NaN` or infinity from one. TypeScript cannot express the bound; the
   * validator does.
   *
   * No derived rate, probability, lift or ranking is stored.
   */
  occurrences: number;
  /** Never present in the observation form — the two forms are mutually exclusive. */
  rate?: never;
  /**
   * Whether the pair is tooling-coupled — a lockfile and its manifest, a
   * generated file and its source — so that a consumer surfacing real source
   * couplings can skip it.
   *
   * **Optional, and three-state.** Unlike `support` and `occurrences` this is a
   * *classification*, not an observation: it cannot be read off the commit
   * graph, because it requires a judgement about what a file *is*, and this
   * standard specifies no portable deterministic classifier from public
   * repository inputs. Read it as:
   *
   * - `true` — classified as tooling-coupled;
   * - `false` — classified as **not** tooling-coupled;
   * - **absent** — no classification was performed; the producer asserts
   *   nothing.
   *
   * A reader must not collapse absent into `false`. Doing so converts a
   * producer's silence into a positive claim that the pair is a real source
   * coupling — the unsupported certainty a required boolean forced, and the
   * reason this field is optional. Use `entry.generated === true` to skip and
   * `entry.generated === false` to keep; branch separately on `undefined`
   * rather than letting it fall through a falsy test.
   *
   * A producer omits this unless it implements a public, deterministic,
   * perturbation-tested classifier. Two producers that classify the same pair
   * differently are both conformant, so this is not a comparison surface
   * between producers.
   */
  generated?: boolean;
}

/**
 * A co-change entry in either accepted form. The `?: never` members make an
 * entry carrying **both** `rate` and `support` a compile error, mirroring the
 * schema's `oneOf`; an entry carrying **neither** fails to satisfy either member.
 *
 * Narrow with `entry.support !== undefined` before reading observation-form fields.
 * An `in` check does NOT discriminate here: the `?: never` members mean both
 * union members declare both properties, so `'support' in entry` leaves the
 * union intact. Comparing against `undefined` narrows, because the property
 * collapses to `undefined` on the other member.
 */
export type CoChangeEntry = LegacyCoChangeEntry | ObservationCoChangeEntry;

export interface FragilityEntry {
  file: string;
  changeCount: number;
  revertCount: number;
  /** revertCount / changeCount */
  revertRate: number;
  /** 0-1 composite score */
  fragilityScore: number;
  /** true = generated/lock file excluded from analysis */
  excluded: boolean;
}

export interface WorkspaceJsonV4 {
  /** Optional mirror of `generated.specVersion` (ADR-004). See {@link WorkspaceJsonV3.version}. */
  version?: '0.4';
  manual: WorkspaceJsonV3['manual'];
  generated: Omit<WorkspaceJsonV3['generated'], 'specVersion'> & {
    specVersion: '0.4';
    /**
     * The revision the `generated` observations were computed from. Declared
     * once for the section, never per observation.
     *
     * **The object-ID contract is scoped to the observation form, not global.**
     * Where any `coChange` entry carries `support`, this is required and must be
     * a full-length lowercase hexadecimal Git object name — 40 characters for
     * SHA-1, 64 for SHA-256 — since a pin that does not name exactly one commit
     * permanently cannot be recounted against. Everywhere else the key is
     * unconstrained: a legacy artifact may already carry it with any value,
     * including a symbolic ref such as `"HEAD"`, and constraining it globally
     * would invalidate a document that was valid before this amendment.
     *
     * A producer emitting the observation form must declare a conforming value
     * whenever `coChange` exists at all, **including when the array is empty** —
     * a producer-profile obligation, because an empty array gives schema
     * validation nothing to discriminate on.
     */
    basisRevision?: string;
    coChange?: CoChangeEntry[];
    fragility?: FragilityEntry[];
  };
  agents: WorkspaceJsonV3['agents'];
  health: WorkspaceJsonV3['health'] & {
    workflowFragility?: number;
    codebaseHealth?: number;
    changeVolatility?: number;
  };
}
