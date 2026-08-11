/**
 * Compile-time assertions about the exported types.
 *
 * WHY THIS FILE EXISTS: `packages/spec/tsconfig.json` excludes `src/**\/*.test.ts`
 * from compilation, so a type-level assertion written in a test is never checked
 * by `tsc` — it is a comment that looks like a guarantee. The co-change contract
 * relies on type-level exclusivity (an entry carries `rate` XOR `support`), and
 * a claim that strong needs a checker, not a convention.
 *
 * These assertions run at `pnpm run build` and `pnpm run typecheck`. Emit is a
 * single empty module; nothing here exists at runtime, and nothing imports it.
 * Behavioral coverage of the same contract lives in `index.test.ts` — this file
 * covers only what a runtime test structurally cannot.
 */

import type {
  CoChangeEntry,
  LegacyCoChangeEntry,
  ObservationCoChangeEntry,
  WorkspaceJsonV4,
} from './types.js';

/** Fails to compile unless `T` is exactly `true`. */
type Assert<T extends true> = T;
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
  ? true
  : false;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

// ── The union admits each form on its own ────────────────────────────────────

type _LegacyIsAnEntry = Assert<IsAssignable<LegacyCoChangeEntry, CoChangeEntry>>;
type _ObservationIsAnEntry = Assert<IsAssignable<ObservationCoChangeEntry, CoChangeEntry>>;

// ── …and rejects an entry carrying BOTH representations ──────────────────────
// The `?: never` members are what make this fail. Without them a "both" object
// would satisfy `LegacyCoChangeEntry` structurally, and the type would permit a
// shape the schema's `oneOf` rejects — a split contract between the two.

type BothForms = { files: string[]; occurrences: number; generated: boolean; rate: number; support: number };
type _BothFormsRejected = Assert<Equals<IsAssignable<BothForms, CoChangeEntry>, false>>;

// ── …and an entry carrying NEITHER ───────────────────────────────────────────

type NeitherForm = { files: string[]; occurrences: number; generated: boolean };
type _NeitherFormRejected = Assert<Equals<IsAssignable<NeitherForm, CoChangeEntry>, false>>;

// ── Reading a form-specific field requires narrowing ─────────────────────────
// This is the source-level break that justifies the package minor bump: `rate`
// was `number` on the old single interface and is `number | undefined` on the
// union, so a consumer assigning it to `number` without narrowing stops
// compiling. Asserted rather than described, so the changeset's claim is checked.

type RateOnUnion = CoChangeEntry['rate'];
type _RateIsOptionalOnTheUnion = Assert<Equals<RateOnUnion, number | undefined>>;
type _RateIsNotBareNumber = Assert<Equals<Equals<RateOnUnion, number>, false>>;

type SupportOnUnion = CoChangeEntry['support'];
type _SupportIsOptionalOnTheUnion = Assert<Equals<SupportOnUnion, number | undefined>>;

// Narrowing recovers the concrete types, so the migration path is real and not
// merely "cast it".
//
// THE IDIOM IS `entry.support !== undefined`, NOT `'support' in entry`. The
// `?: never` members mean both union members *declare* the property, so an `in`
// check does not discriminate and leaves the union intact — this assertion
// caught exactly that mistake in the first draft of these types, where the
// documented idiom would not have compiled for a consumer. Comparing against
// `undefined` does discriminate, because `never | undefined` collapses to
// `undefined` on the other member.
//
// Stated as type-level extraction rather than as a narrowing function with a
// body. A function would be EMITTED: `tsc` compiles non-exported function
// declarations too, so an earlier draft of this file shipped a callable
// `narrowingRecoversTheForm` into `dist/`. Nothing in this file may exist at
// runtime, so the same property is asserted where it costs no emit.
//
// `Extract<CoChangeEntry, { support: number }>` is the type-system answer to
// "what is left after you discriminate on `support`". That it equals exactly
// `ObservationCoChangeEntry` — not the whole union — is the assertion that
// failed under the `'support' in entry` idiom and holds under
// `entry.support !== undefined`.

type _DiscriminatingOnSupportYieldsTheObservationForm = Assert<
  Equals<Extract<CoChangeEntry, { support: number }>, ObservationCoChangeEntry>
>;
type _DiscriminatingOnRateYieldsTheLegacyForm = Assert<
  Equals<Extract<CoChangeEntry, { rate: number }>, LegacyCoChangeEntry>
>;

// ── `generated` is three-state on the observation form, and only there ────────
// A-010. The flag is a classification, not an observation: absent means "not
// classified", which is a third state and not a synonym for `false`. The type
// has to carry that or a consumer writing `if (!entry.generated)` compiles
// cleanly while silently treating silence as a positive claim.

type GeneratedOnUnion = CoChangeEntry['generated'];
type _GeneratedIsOptionalOnTheUnion = Assert<Equals<GeneratedOnUnion, boolean | undefined>>;
type _GeneratedIsNotBareBoolean = Assert<Equals<Equals<GeneratedOnUnion, boolean>, false>>;

// An observation entry that classified nothing is a legal entry. This is the
// shape the amendment exists to admit, asserted rather than described.
type ObservationWithoutGenerated = { files: string[]; occurrences: number; support: number };
type _ObservationWithoutGeneratedIsAnEntry = Assert<
  IsAssignable<ObservationWithoutGenerated, CoChangeEntry>
>;

// …while the deprecated legacy form still demands it, so widening the current
// form did not quietly loosen the frozen one.
type LegacyWithoutGenerated = { files: string[]; occurrences: number; rate: number };
type _LegacyWithoutGeneratedIsRejected = Assert<
  Equals<IsAssignable<LegacyWithoutGenerated, CoChangeEntry>, false>
>;

// …and that discrimination actually removes something. If either extraction
// returned the full union, the checks above could pass vacuously on a union that
// had collapsed into a single permissive member.
type _ExtractionIsNotTheWholeUnion = Assert<
  Equals<Equals<Extract<CoChangeEntry, { support: number }>, CoChangeEntry>, false>
>;

// ── basisRevision is optional on the document type ───────────────────────────
// Required by the schema only under the observation form, so a legacy document
// that omits it — or carries `"HEAD"` — must still typecheck.

type _BasisRevisionOptional = Assert<
  IsAssignable<
    {
      version?: '0.4';
      manual: WorkspaceJsonV4['manual'];
      generated: {
        specVersion: '0.4';
        generatedAt: string;
        by: { name: string; version: string };
        frameworkManifest: [];
        fileIndex: Record<string, never>;
        basisRevision: 'HEAD';
        coChange: LegacyCoChangeEntry[];
      };
      agents: Record<string, unknown>;
      health: WorkspaceJsonV4['health'];
    },
    WorkspaceJsonV4
  >
>;
