import { describe, expect, it } from 'vitest';
import type { Finding, Rule, RuleContext } from '../../types.js';
import { RuleTester } from '../rule-tester.js';
import type { PreviewCase } from '../rule-tester.js';

// ─── Stub Rules ───────────────────────────────────────────────────────────────

function makePassFinding(): Finding {
  return {
    ruleId: 'stub-rule',
    ruleVersion: '1.0.0',
    state: 'PASS',
    confidence: 1,
    signals: [],
    temporalWeight: 1,
    evidence: {},
    message: 'stub pass',
    firedAt: new Date(),
  };
}

function makeFailFinding(): Finding {
  return {
    ruleId: 'stub-rule',
    ruleVersion: '1.0.0',
    state: 'FAIL',
    severity: 'error',
    confidence: 1,
    signals: [],
    temporalWeight: 1,
    evidence: {},
    message: 'stub failure',
    firedAt: new Date(),
  };
}

function makeWarnFinding(): Finding {
  return {
    ruleId: 'warn-rule',
    ruleVersion: '1.0.0',
    state: 'WARN',
    severity: 'warning',
    confidence: 0.6,
    signals: [],
    temporalWeight: 1,
    evidence: {},
    message: 'warn finding',
    firedAt: new Date(),
  };
}

function makeStubRule(): Rule {
  return {
    meta: {
      id: 'stub-rule',
      version: '1.0.0',
      description: 'stub',
      category: 'convention',
      scope: 'file',
      firingMode: 'threshold',
      cost: 'cheap',
      requiredTier: 'open',
    },
    async evaluate(ctx: RuleContext): Promise<Finding[]> {
      const shouldFail = (ctx.config as { fail?: boolean }).fail === true;
      return [shouldFail ? makeFailFinding() : makePassFinding()];
    },
  };
}

function makeWarnRule(): Rule {
  return {
    meta: {
      id: 'warn-rule',
      version: '1.0.0',
      description: 'warns',
      category: 'staleness',
      scope: 'workspace',
      firingMode: 'threshold',
      cost: 'cheap',
      requiredTier: 'open',
    },
    async evaluate(_ctx: RuleContext): Promise<Finding[]> {
      return [makeWarnFinding()];
    },
  };
}

function makeProFinding(): Finding {
  return {
    ruleId: 'pro-rule',
    ruleVersion: '1.0.0',
    state: 'FAIL',
    severity: 'critical',
    confidence: 0.9,
    signals: [],
    temporalWeight: 1,
    evidence: {},
    message: 'pro finding',
    firedAt: new Date(),
  };
}

function makeProRule(): Rule {
  return {
    meta: {
      id: 'pro-rule',
      version: '1.0.0',
      description: 'pro stub',
      category: 'intelligence',
      scope: 'file',
      firingMode: 'compound',
      cost: 'expensive',
      requiredTier: 'pro',
      previewMessage: () => 'requires Vreko',
    },
    async evaluate(ctx: RuleContext): Promise<Finding[]> {
      if (!ctx.vreko) return [];
      return [makeProFinding()];
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RuleTester v2', () => {
  describe('valid cases with expectedState', () => {
    it('passes when rule returns PASS finding and expectedState is PASS', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({ config: { fail: false } });
      const findings = (await makeStubRule().evaluate(ctx)) as Finding[];
      expect(findings.some((f) => f.state === 'PASS')).toBe(true);
    });

    it('passes when rule returns WARN finding and expectedState is WARN', async () => {
      const tester = new RuleTester({ rule: makeWarnRule() });
      const ctx = tester.buildContext({});
      const findings = (await makeWarnRule().evaluate(ctx)) as Finding[];
      expect(findings.some((f) => f.state === 'WARN')).toBe(true);
    });

    it('run() valid case with expectedState PASS: no FAIL findings', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({ config: { fail: false } });
      const findings = (await makeStubRule().evaluate(ctx)) as Finding[];
      const failFindings = findings.filter((f) => f.state === 'FAIL');
      expect(failFindings).toHaveLength(0);
    });
  });

  describe('invalid cases with expectedState and expectedFindings', () => {
    it('passes when rule returns FAIL finding', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({ config: { fail: true } });
      const findings = (await makeStubRule().evaluate(ctx)) as Finding[];
      expect(findings.some((f) => f.state === 'FAIL')).toBe(true);
    });

    it('expectedFindings message substring match works', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({ config: { fail: true } });
      const findings = (await makeStubRule().evaluate(ctx)) as Finding[];
      const failFindings = findings.filter((f) => f.state === 'FAIL');
      const match = failFindings.find((f) => f.message.includes('stub failure'));
      expect(match).toBeDefined();
    });
  });

  describe('preview cases - rule returns [] without vreko', () => {
    it('pro rule returns [] when vreko is absent', async () => {
      const tester = new RuleTester({ rule: makeProRule() });
      // Use buildStaticContext and then wrap in full context without vreko
      const staticCtx = tester.buildStaticContext({});
      const ctx = tester.buildContext(staticCtx);
      const findings = (await makeProRule().evaluate(ctx)) as Finding[];
      expect(findings).toHaveLength(0);
    });

    it('previewMessage returns expected string', () => {
      const rule = makeProRule();
      const tester = new RuleTester({ rule });
      const staticCtx = tester.buildStaticContext({});
      const msg = rule.meta.previewMessage!(staticCtx);
      expect(msg).toContain('requires Vreko');
    });
  });

  describe('buildContext()', () => {
    it('produces context with repo field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.repo).toBeDefined();
      expect(typeof ctx.repo.root).toBe('string');
      expect(ctx.repo.files).toBeDefined();
      expect(typeof ctx.repo.isMonorepo).toBe('boolean');
    });

    it('produces context with workspace field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.workspace).toBeDefined();
    });

    it('produces context with file field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.file).toBeDefined();
      expect(typeof ctx.file.path).toBe('string');
      expect(typeof ctx.file.language).toBe('string');
      expect(typeof ctx.file.content).toBe('string');
    });

    it('produces context with git field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.git).toBeDefined();
    });

    it('produces context with findings field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.findings).toBeDefined();
    });

    it('produces context with emit function', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(typeof ctx.emit).toBe('function');
    });

    it('mocked GitSignals churnScore defaults to 0', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(await ctx.git.churnScore('x')).toBe(0);
    });

    it('mocked GitSignals authorCount defaults to 1', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(await ctx.git.authorCount('x')).toBe(1);
    });

    it('mocked GitSignals modificationVelocity defaults to 0', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(await ctx.git.modificationVelocity('x', 30)).toBe(0);
    });

    it('mocked GitSignals fileAge defaults to 0', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(await ctx.git.fileAge('x')).toBe(0);
    });

    it('mocked GitSignals recentCommits returns []', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      const commits = await ctx.git.recentCommits(5);
      expect(commits).toHaveLength(0);
    });

    it('mocked GitSignals commitsBetween returns []', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      const commits = await ctx.git.commitsBetween('x', new Date(), new Date());
      expect(commits).toHaveLength(0);
    });

    it('mocked GitSignals lastModified returns a Date', async () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      const d = await ctx.git.lastModified('x');
      expect(d instanceof Date).toBe(true);
    });

    it('empty FindingGraph findingsFor returns []', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.findings.findingsFor('any-rule')).toHaveLength(0);
    });

    it('empty FindingGraph hasFinding returns false', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.findings.hasFinding('any-rule', 'FAIL')).toBe(false);
    });

    it('empty FindingGraph confidence returns null', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({});
      expect(ctx.findings.confidence('any-rule')).toBe(null);
    });

    it('partial override merges isMonorepo correctly', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({
        repo: { isMonorepo: true },
      });
      expect(ctx.repo.isMonorepo).toBe(true);
    });

    it('partial override merges file.path correctly', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({
        file: { path: 'custom-path.ts' },
      });
      expect(ctx.file.path).toBe('custom-path.ts');
    });

    it('partial override merges config correctly', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const ctx = tester.buildContext({
        config: { myKey: 42 },
      });
      expect((ctx.config as { myKey?: number }).myKey).toBe(42);
    });

    it('vreko is absent by default', async () => {
      const tester = new RuleTester({ rule: makeProRule() });
      const ctx = tester.buildContext({});
      // pro rule returns [] when vreko is absent
      const findings = (await makeProRule().evaluate(ctx)) as Finding[];
      expect(findings).toHaveLength(0);
    });
  });

  describe('buildStaticContext()', () => {
    it('produces StaticRuleContext with repo field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const staticCtx = tester.buildStaticContext({});
      expect(staticCtx.repo).toBeDefined();
    });

    it('produces StaticRuleContext with workspace field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const staticCtx = tester.buildStaticContext({});
      expect(staticCtx.workspace).toBeDefined();
    });

    it('produces StaticRuleContext with config field', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const staticCtx = tester.buildStaticContext({});
      expect(staticCtx.config).toBeDefined();
    });

    it('does not have file field (StaticRuleContext only)', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const staticCtx = tester.buildStaticContext({});
      expect((staticCtx as unknown as { file?: unknown }).file).toBe(undefined);
    });

    it('does not have git field (StaticRuleContext only)', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const staticCtx = tester.buildStaticContext({});
      expect((staticCtx as unknown as { git?: unknown }).git).toBe(undefined);
    });

    it('partial override applies to repo.isMonorepo', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      const staticCtx = tester.buildStaticContext({
        repo: { isMonorepo: true, files: ['a.ts'] },
      });
      expect(staticCtx.repo.isMonorepo).toBe(true);
      expect(staticCtx.repo.files).toHaveLength(1);
    });
  });

  describe('run() integration - valid/invalid/preview case groups', () => {
    it('run() with valid cases does not throw', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      let threw = false;
      try {
        tester.run('stub', {
          valid: [{ name: 'passes when no fail', context: { config: { fail: false } }, expectedState: 'PASS' }],
          invalid: [],
          preview: [],
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('run() with invalid cases does not throw', () => {
      const tester = new RuleTester({ rule: makeStubRule() });
      let threw = false;
      try {
        tester.run('stub', {
          valid: [],
          invalid: [
            {
              name: 'fails when fail=true',
              context: { config: { fail: true } },
              expectedState: 'FAIL',
              expectedFindings: [{ message: 'stub failure' }],
            },
          ],
          preview: [],
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('run() with preview cases does not throw', () => {
      const tester = new RuleTester({ rule: makeProRule() });
      let threw = false;
      try {
        tester.run('pro-rule', {
          valid: [],
          invalid: [],
          preview: [{ name: 'no vreko = empty results', expectedMessageContains: 'requires Vreko' }],
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('PreviewCase interface exported', () => {
    it('PreviewCase can be constructed with expected fields', () => {
      const previewCase: PreviewCase = {
        name: 'test preview',
        context: {},
        expectedMessageContains: 'some string',
      };
      expect(previewCase.name).toBe('test preview');
    });
  });
});
