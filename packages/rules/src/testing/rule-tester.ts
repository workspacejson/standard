import { describe, expect, it } from 'vitest';
import type {
  AuditConfig,
  Commit,
  DetectedLanguage,
  Finding,
  FindingGraph,
  FindingState,
  GitSignals,
  ParsedAgentsMd,
  RepoState,
  Rule,
  RuleContext,
  StaticRuleContext,
  WorkspaceSignals,
} from '../types.js';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

// LegacyFields: extra fields for backward compatibility with migrated v0.1 workspace rules.
// These rules use a bridge cast to access agentsMd/repo/config from ctx.
// TODO(v0.3): remove once all rules read from WorkspaceSignals.
type LegacyFields = {
  agentsMd?: DeepPartial<ParsedAgentsMd>;
  repo?: DeepPartial<RepoState>;
  config?: DeepPartial<AuditConfig> | Record<string, unknown>;
};

// TestContext: v0.2 RuleContext fields with optional legacy bridge fields.
export type TestContext = DeepPartial<RuleContext> & LegacyFields;

export interface ValidCase {
  name: string;
  context: TestContext;
  expectedState?: 'PASS' | 'WARN' | 'INSUFFICIENT_DATA' | 'SKIP';
}

export interface InvalidCase {
  name: string;
  context: TestContext;
  expectedState?: 'FAIL';
  expectedFindings?: Array<Partial<Finding>>;
}

export interface PreviewCase {
  name: string;
  context?: DeepPartial<StaticRuleContext>;
  expectedMessageContains?: string;
}

export interface InvariantCase {
  name: string;
  run: (tester: RuleTester) => Promise<void>;
}

export interface RuleTesterConfig {
  rule: Rule;
  defaultContext?: TestContext;
}

const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  stalenessThresholdDays: 60,
  highActivityCommitCount: 20,
  conventionMismatchPrecisionMode: true,
  failOn: null,
  save: false,
  reportDir: '.agents/audit-history',
  ignore: [],
};

export class RuleTester {
  private readonly rule: Rule;
  private readonly defaultCtx: TestContext;

  constructor(config: RuleTesterConfig) {
    this.rule = config.rule;
    this.defaultCtx = config.defaultContext ?? {};
  }

  run(
    name: string,
    cases: {
      valid?: ValidCase[];
      invalid?: InvalidCase[];
      preview?: PreviewCase[];
      invariants?: InvariantCase[];
    },
  ): void {
    describe(`Rule: ${name} (${this.rule.meta.id})`, () => {
      if (cases.valid && cases.valid.length > 0) {
        describe('valid cases - expect no FAIL findings', () => {
          for (const validCase of cases.valid!) {
            it(validCase.name, async () => {
              const ctx = this.buildContext(validCase.context);
              const raw = await this.rule.evaluate(ctx);
              const findings = Array.isArray(raw) ? raw : [raw];

              // No FAIL findings expected
              const failFindings = findings.filter((f) => f.state === 'FAIL');
              expect(failFindings).toHaveLength(0);

              // If expectedState is specified, at least one finding must match
              if (validCase.expectedState) {
                const matchingState = findings.find((f) => f.state === validCase.expectedState);
                expect(matchingState).toBeDefined();
              }
            });
          }
        });
      }

      if (cases.invalid && cases.invalid.length > 0) {
        describe('invalid cases - expect FAIL findings', () => {
          for (const invalidCase of cases.invalid!) {
            it(invalidCase.name, async () => {
              const ctx = this.buildContext(invalidCase.context);
              const raw = await this.rule.evaluate(ctx);
              const findings = Array.isArray(raw) ? raw : [raw];

              const failFindings = findings.filter((f) => f.state === 'FAIL');
              expect(failFindings.length).toBeGreaterThan(0);

              if (invalidCase.expectedFindings && invalidCase.expectedFindings.length > 0) {
                for (const expected of invalidCase.expectedFindings) {
                  const match = failFindings.find(
                    (f) =>
                      (!expected.ruleId || f.ruleId === expected.ruleId) &&
                      (!expected.message || f.message.includes(expected.message)) &&
                      (!expected.severity || f.severity === expected.severity),
                  );
                  expect(match).toBeDefined();
                }
              }
            });
          }
        });
      }

      if (cases.preview && cases.preview.length > 0) {
        describe('preview cases - expect empty results (engine handles PREVIEW)', () => {
          for (const previewCase of cases.preview!) {
            it(previewCase.name, async () => {
              // Build a context WITHOUT vreko (engine emits PREVIEW before calling evaluate)
              const staticCtx = this.buildStaticContext(previewCase.context);
              // Spread staticCtx — vreko is omitted (not present) so ctx.vreko will be absent
              const ctx = this.buildContext({ ...staticCtx });
              const raw = await this.rule.evaluate(ctx);
              const findings = Array.isArray(raw) ? raw : [raw];

              // Rule must return [] defensively when vreko is absent
              expect(findings).toHaveLength(0);

              // Verify previewMessage exists and optionally contains expected string
              if (previewCase.expectedMessageContains) {
                expect(this.rule.meta.previewMessage).toBeDefined();
                const previewMsg = this.rule.meta.previewMessage!(staticCtx);
                expect(previewMsg).toContain(previewCase.expectedMessageContains);
              }
            });
          }
        });
      }

      if (cases.invariants && cases.invariants.length > 0) {
        describe('invariants', () => {
          for (const invariant of cases.invariants!) {
            it(invariant.name, async () => {
              await invariant.run(this);
            });
          }
        });
      }
    });
  }

  buildContext(partial?: TestContext): RuleContext {
    // Merge default context with partial; legacy fields are handled separately below.
    const merged = this.mergeDeep(this.defaultCtx as DeepPartial<RuleContext>, (partial ?? {}) as DeepPartial<RuleContext>) as DeepPartial<RuleContext>;

    // Collect legacy fields from both defaultCtx and partial (for the bridge cast).
    const legacyAgentsMd: DeepPartial<ParsedAgentsMd> = {
      ...this.defaultCtx.agentsMd,
      ...(partial as LegacyFields | undefined)?.agentsMd,
    };
    const legacyRepo: DeepPartial<RepoState> = {
      ...this.defaultCtx.repo,
      ...(partial as LegacyFields | undefined)?.repo,
    };
    const legacyConfig: AuditConfig = {
      ...DEFAULT_AUDIT_CONFIG,
      ...(this.defaultCtx.config as Partial<AuditConfig> | undefined),
      ...((partial as LegacyFields | undefined)?.config as Partial<AuditConfig> | undefined),
    };

    // Build the full ParsedAgentsMd legacy object.
    // Cast required: DeepPartial spread may leave optional fields on a required-field type.
    const agentsMd: ParsedAgentsMd = {
      raw: '',
      filePath: 'AGENTS.md',
      lastModified: new Date(),
      sections: [],
      filePaths: [],
      frameworkTokens: [],
      conventions: [],
      patterns: [],
      ...(legacyAgentsMd as Partial<ParsedAgentsMd>),
    } as ParsedAgentsMd;

    // Build the full RepoState legacy object.
    const repo: RepoState = {
      root: process.cwd(),
      files: [],
      isMonorepo: false,
      packages: [],
      manifests: [],
      gitHistory: {
        agentsMdLastModified: new Date(),
        nonAgentsCommitCount30Days: 0,
        filesChangedLast30Days: [],
        ...(legacyRepo?.gitHistory as Partial<{ agentsMdLastModified: Date; nonAgentsCommitCount30Days: number; filesChangedLast30Days: string[] }> | undefined),
      },
      ...(legacyRepo as Partial<RepoState>),
    } as RepoState;

    const workspace: WorkspaceSignals = {
      topology: repo.isMonorepo ? 'monorepo' : 'single-package',
      ciProvider: 'unknown',
      manifests: {},
      packages: repo.packages,
      agentFiles: {},
      ...(merged.workspace as Partial<WorkspaceSignals>),
    };

    const defaultGit: GitSignals = {
      recentCommits: async (_n: number): Promise<Commit[]> => [],
      fileAge: async (_path: string): Promise<number> => 0,
      churnScore: async (_path: string): Promise<number> => 0,
      lastModified: async (_path: string): Promise<Date> => new Date(0),
      authorCount: async (_path: string, _lookback?: number): Promise<number> => 1,
      commitsBetween: async (_path: string, _from: Date, _to: Date): Promise<Commit[]> => [],
      modificationVelocity: async (_path: string, _windowDays: number): Promise<number> => 0,
    };

    const emptyFindingGraph: FindingGraph = {
      findingsFor: (_ruleId: string, _filePath?: string): Finding[] => [],
      hasFinding: (_ruleId: string, _state: FindingState): boolean => false,
      confidence: (_ruleId: string, _filePath?: string): number | null => null,
    };

    const ctx: RuleContext = {
      repo: {
        root: repo.root,
        files: repo.files,
        isMonorepo: repo.isMonorepo,
        ...(merged.repo as Partial<{ root: string; files: string[]; isMonorepo: boolean }>),
      },
      workspace,
      config: merged.config ?? (legacyConfig as unknown as Record<string, unknown>),
      file: {
        path: agentsMd.filePath,
        language: 'unknown' as DetectedLanguage,
        content: agentsMd.raw,
        ...(merged.file as Partial<{ path: string; language: DetectedLanguage; content: string }>),
      },
      git: { ...defaultGit, ...(merged.git as Partial<GitSignals>) },
      findings: (merged.findings as FindingGraph | undefined) ?? emptyFindingGraph,
      emit: (merged.emit as RuleContext['emit'] | undefined) ?? (() => {}),
    };

    if (merged.vreko !== undefined) {
      // only attach if explicitly provided (undefined means "not set")
      (ctx as { vreko?: unknown }).vreko = merged.vreko;
    }

    // Attach legacy fields for the bridge cast used by migrated workspace-scoped rules.
    // TODO(v0.3): remove once all rules access agentsMd via WorkspaceSignals.
    // Only set config on the legacy attachment if the caller did not explicitly provide one,
    // so that test-specified ctx.config values are not overwritten by legacyConfig.
    const legacyAttachment: Record<string, unknown> = { agentsMd, repo };
    if (merged.config === undefined) {
      legacyAttachment.config = legacyConfig;
    }
    return Object.assign(ctx, legacyAttachment) as RuleContext;
  }

  buildStaticContext(partial?: DeepPartial<StaticRuleContext>): StaticRuleContext {
    return {
      repo: {
        root: process.cwd(),
        files: [],
        isMonorepo: false,
        ...partial?.repo,
      },
      workspace: {
        topology: 'single-package',
        ciProvider: 'none',
        manifests: {},
        packages: [],
        agentFiles: {},
        ...(partial?.workspace as Partial<WorkspaceSignals>),
      },
      config: partial?.config ?? {},
    };
  }

  private mergeDeep<T extends object>(base: T, override: DeepPartial<T>): T {
    const result = { ...base } as T;
    for (const key of Object.keys(override) as (keyof T)[]) {
      const overrideVal = override[key];
      const baseVal = base[key];
      if (
        overrideVal !== null &&
        typeof overrideVal === 'object' &&
        !Array.isArray(overrideVal) &&
        typeof baseVal === 'object' &&
        baseVal !== null
      ) {
        (result as Record<string, unknown>)[key as string] = this.mergeDeep(
          baseVal as object,
          overrideVal as DeepPartial<object>,
        );
      } else if (overrideVal !== undefined) {
        (result as Record<string, unknown>)[key as string] = overrideVal;
      }
    }
    return result;
  }
}
