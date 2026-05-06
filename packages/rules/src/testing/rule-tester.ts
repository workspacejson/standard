import { describe, expect, it } from 'vitest';
import type { AuditConfig, Finding, Rule, RuleContext } from '../types.js';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface ValidCase {
  name: string;
  context: DeepPartial<RuleContext>;
}

export interface InvalidCase {
  name: string;
  context: DeepPartial<RuleContext>;
  expectedFindings: Partial<Finding>[];
}

export interface RuleTesterConfig {
  rule: Rule;
  defaultContext?: DeepPartial<RuleContext>;
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
  private readonly defaultCtx: DeepPartial<RuleContext>;

  constructor(config: RuleTesterConfig) {
    this.rule = config.rule;
    this.defaultCtx = config.defaultContext ?? {};
  }

  run(name: string, cases: { valid: ValidCase[]; invalid: InvalidCase[] }): void {
    describe(`Rule: ${name} (${this.rule.id})`, () => {
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

  private buildContext(partial: DeepPartial<RuleContext>): RuleContext {
    const agentsMd = {
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
    } as RuleContext['agentsMd'];

    const repo = {
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
    } as RuleContext['repo'];

    const config = {
      ...DEFAULT_CONFIG,
      ...this.defaultCtx.config,
      ...partial.config,
    } as AuditConfig;

    const context: RuleContext = {
      agentsMd,
      repo,
      config,
    };

    const workspace = partial.workspace ?? this.defaultCtx.workspace;
    if (workspace !== undefined) {
      context.workspace = workspace;
    }

    return context;
  }
}
