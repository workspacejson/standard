import { describe, expect, it } from 'vitest';
import { RuleEngine } from '../rule-engine.js';

describe('RuleEngine', () => {
  it('continues when one rule rejects', async () => {
    const engine = new RuleEngine();

    engine.register({
      id: 'healthy',
      category: 'integrity',
      severity: 'warning',
      description: 'healthy',
      async evaluate() {
        return [
          {
            ruleId: 'healthy',
            severity: 'warning',
            message: 'ok',
            evidence: {},
          },
        ];
      },
    });

    engine.register({
      id: 'broken',
      category: 'integrity',
      severity: 'warning',
      description: 'broken',
      async evaluate() {
        throw new Error('boom');
      },
    });

    const result = await engine.run({
      agentsMd: {
        raw: '',
        filePath: 'AGENTS.md',
        lastModified: new Date(),
        sections: [],
        filePaths: [],
        frameworkTokens: [],
        conventions: [],
        patterns: [],
      },
      repo: {
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
      },
      config: {
        stalenessThresholdDays: 60,
        highActivityCommitCount: 20,
        conventionMismatchPrecisionMode: true,
        failOn: null,
        save: false,
        reportDir: '.agents/audit-history',
        ignore: [],
      },
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe('healthy');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
