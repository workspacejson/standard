import { describe, expect, it } from 'vitest';
import type { AuditConfig, Finding, ParsedAgentsMd, RepoState, Rule, RuleContext } from '../types.js';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

// LegacyTestContext: union of v0.2 RuleContext fields and legacy v0.1 fields used by tests.
// Tests pass partial agentsMd/repo/config objects; buildContext merges them into a full
// v0.2 RuleContext with legacy fields attached for the bridge cast.
// TODO(v0.3): remove legacy fields once all rules are migrated to WorkspaceSignals.
type LegacyTestContext = DeepPartial<RuleContext> & {
  agentsMd?: DeepPartial<ParsedAgentsMd>;
  repo?: DeepPartial<RepoState>;
  config?: DeepPartial<AuditConfig>;
};

export interface ValidCase {
  name: string;
  context: LegacyTestContext;
}

export interface InvalidCase {
  name: string;
  context: LegacyTestContext;
  expectedFindings: Partial<Finding>[];
}

export interface RuleTesterConfig {
  rule: Rule;
  defaultContext?: LegacyTestContext;
}

const DEFAULT_CONFIG: AuditConfig = {
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
  private readonly defaultCtx: LegacyTestContext;

  constructor(config: RuleTesterConfig) {
    this.rule = config.rule;
    this.defaultCtx = config.defaultContext ?? {};
  }

  run(name: string, cases: { valid: ValidCase[]; invalid: InvalidCase[] }): void {
    describe(`Rule: ${name} (${this.rule.meta.id})`, () => {
      describe('valid cases - expect zero findings', () => {
        for (const validCase of cases.valid) {
          it(validCase.name, async () => {
            const ctx = this.buildContext(validCase.context);
            const findings = await this.rule.evaluate(ctx);
            expect(findings).toHaveLength(0);
          });
        }
      });

      describe('invalid cases - expect specific findings', () => {
        for (const invalidCase of cases.invalid) {
          it(invalidCase.name, async () => {
            const ctx = this.buildContext(invalidCase.context);
            const findings = await this.rule.evaluate(ctx);

            expect(findings.length).toBeGreaterThanOrEqual(invalidCase.expectedFindings.length);

            for (const expected of invalidCase.expectedFindings) {
              const match = findings.find(
                (finding) =>
                  (!expected.ruleId || finding.ruleId === expected.ruleId) &&
                  (!expected.severity || finding.severity === expected.severity) &&
                  (!expected.message || finding.message.includes(expected.message)),
              );
              expect(match).toBeDefined();
            }
          });
        }
      });
    });
  }

  private buildContext(partial: LegacyTestContext): RuleContext {
    const agentsMd: ParsedAgentsMd = {
      raw: '',
      filePath: 'AGENTS.md',
      lastModified: new Date(),
      sections: [],
      filePaths: [],
      frameworkTokens: [],
      conventions: [],
      patterns: [],
      ...this.defaultCtx.agentsMd,
      ...partial.agentsMd,
    };

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
      },
      ...this.defaultCtx.repo,
      ...partial.repo,
    };

    const config: AuditConfig = {
      ...DEFAULT_CONFIG,
      ...this.defaultCtx.config,
      ...partial.config,
    };

    // v0.2 RuleContext base — workspace-scoped rules use the legacy bridge cast
    // to access agentsMd/repo/config; per-file git/file fields are stubs.
    const base: RuleContext = {
      repo: {
        root: repo.root,
        files: repo.files,
        isMonorepo: repo.isMonorepo,
      },
      workspace: {
        topology: repo.isMonorepo ? 'monorepo' : 'single-package',
        ciProvider: 'unknown',
        manifests: {},
        packages: repo.packages,
        agentFiles: {},
      },
      config: config as unknown as Record<string, unknown>,
      file: {
        path: agentsMd.filePath,
        language: 'unknown',
        content: agentsMd.raw,
      },
      git: {
        recentCommits: async () => [],
        fileAge: async () => 0,
        churnScore: async () => 0,
        lastModified: async () => new Date(),
        authorCount: async () => 0,
        commitsBetween: async () => [],
        modificationVelocity: async () => 0,
      },
      findings: {
        findingsFor: () => [],
        hasFinding: () => false,
        confidence: () => null,
      },
      emit: () => {},
    };

    // Attach legacy fields for the bridge cast used by migrated workspace-scoped rules.
    // TODO(v0.3): remove once all rules access agentsMd via WorkspaceSignals.
    return Object.assign(base, { agentsMd, repo, config }) as RuleContext;
  }
}
