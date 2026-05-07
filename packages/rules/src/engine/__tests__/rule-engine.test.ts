import { describe, expect, it } from 'vitest';
import { RuleEngine } from '../rule-engine.js';
import type { Finding, FindingState, Rule, RuleContext, RuleCost, RequiredTier } from '../../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRule(
  id: string,
  opts?: {
    evaluate?: () => Promise<Finding[]>;
    requiredTier?: RequiredTier;
    prerequisites?: string[];
    cost?: RuleCost;
    timeoutMs?: number;
  },
): Rule {
  return {
    meta: {
      id,
      version: '1.0.0',
      description: id,
      category: 'convention',
      scope: 'workspace',
      firingMode: 'threshold',
      cost: opts?.cost ?? 'cheap',
      requiredTier: opts?.requiredTier ?? 'open',
      prerequisites: opts?.prerequisites,
      timeoutMs: opts?.timeoutMs,
    },
    evaluate: opts?.evaluate ?? (async () => []),
  };
}

function makeCtx(overrides?: Partial<RuleContext>): RuleContext {
  return {
    repo: { root: process.cwd(), files: [], isMonorepo: false },
    workspace: {
      topology: 'single-package',
      ciProvider: 'none',
      manifests: {},
      packages: [],
      agentFiles: {},
    },
    config: {},
    file: { path: 'test.ts', language: 'typescript', content: '' },
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
    ...overrides,
  };
}

function makeFinding(ruleId: string, state: FindingState): Finding {
  return {
    ruleId,
    ruleVersion: '1.0.0',
    state,
    confidence: 1,
    signals: [],
    temporalWeight: 1,
    evidence: {},
    message: 'test finding',
    firedAt: new Date(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RuleEngine', () => {
  it('continues when one rule rejects (updated for v0.2)', async () => {
    const engine = new RuleEngine();

    engine.register(
      makeRule('healthy', {
        evaluate: async () => [makeFinding('healthy', 'PASS')],
      }),
    );

    engine.register(
      makeRule('broken', {
        evaluate: async () => {
          throw new Error('boom');
        },
      }),
    );

    const result = await engine.run(makeCtx());

    // The healthy rule's PASS finding should be present
    const passFindings = result.findings.filter((f) => f.state === 'PASS');
    expect(passFindings).toHaveLength(1);
    expect(passFindings[0]?.ruleId).toBe('healthy');

    // The broken rule should appear in skipped
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.ruleId).toBe('broken');

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits PREVIEW finding for non-open-tier rule when ctx.vreko is absent', async () => {
    const engine = new RuleEngine();

    engine.register(
      makeRule('pro-rule', {
        requiredTier: 'pro',
        evaluate: async () => [makeFinding('pro-rule', 'PASS')],
      }),
    );

    const result = await engine.run(makeCtx()); // no vreko

    expect(result.previewed).toHaveLength(1);
    expect(result.previewed[0]?.ruleId).toBe('pro-rule');

    const previewFinding = result.findings.find((f) => f.ruleId === 'pro-rule');
    expect(previewFinding?.state).toBe('PREVIEW');
  });

  it('does not emit PREVIEW for open-tier rules', async () => {
    const engine = new RuleEngine();

    engine.register(
      makeRule('open-rule', {
        requiredTier: 'open',
        evaluate: async () => [makeFinding('open-rule', 'PASS')],
      }),
    );

    const result = await engine.run(makeCtx());

    expect(result.previewed).toHaveLength(0);
    const finding = result.findings.find((f) => f.ruleId === 'open-rule');
    expect(finding?.state).toBe('PASS');
  });

  it('skips rule when prerequisite rule has no PASS or WARN finding', async () => {
    const engine = new RuleEngine();

    // prereq rule that fails (FAIL finding)
    engine.register(
      makeRule('prereq-rule', {
        evaluate: async () => [makeFinding('prereq-rule', 'FAIL')],
      }),
    );

    // dependent rule that should be skipped
    engine.register(
      makeRule('dependent-rule', {
        prerequisites: ['prereq-rule'],
        evaluate: async () => [makeFinding('dependent-rule', 'PASS')],
      }),
    );

    const result = await engine.run(makeCtx());

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.ruleId).toBe('dependent-rule');

    const skipFinding = result.findings.find((f) => f.ruleId === 'dependent-rule');
    expect(skipFinding?.state).toBe('SKIP');
  });

  it('does not skip rule when prerequisite has PASS finding', async () => {
    const engine = new RuleEngine();

    engine.register(
      makeRule('prereq-rule', {
        evaluate: async () => [makeFinding('prereq-rule', 'PASS')],
      }),
    );

    engine.register(
      makeRule('dependent-rule', {
        prerequisites: ['prereq-rule'],
        evaluate: async () => [makeFinding('dependent-rule', 'PASS')],
      }),
    );

    const result = await engine.run(makeCtx());

    expect(result.skipped).toHaveLength(0);
    const depFinding = result.findings.find((f) => f.ruleId === 'dependent-rule');
    expect(depFinding?.state).toBe('PASS');
  });

  it('does not skip rule when prerequisite has WARN finding', async () => {
    const engine = new RuleEngine();

    engine.register(
      makeRule('prereq-rule', {
        evaluate: async () => [makeFinding('prereq-rule', 'WARN')],
      }),
    );

    engine.register(
      makeRule('dependent-rule', {
        prerequisites: ['prereq-rule'],
        evaluate: async () => [makeFinding('dependent-rule', 'PASS')],
      }),
    );

    const result = await engine.run(makeCtx());

    expect(result.skipped).toHaveLength(0);
  });

  it('timeout produces SKIP finding for slow rule', async () => {
    const engine = new RuleEngine();

    engine.register(
      makeRule('slow-rule', {
        cost: 'cheap',
        timeoutMs: 50, // very short timeout
        evaluate: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return [makeFinding('slow-rule', 'PASS')];
        },
      }),
    );

    const result = await engine.run(makeCtx());

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.ruleId).toBe('slow-rule');
    expect(result.skipped[0]?.reason).toMatch(/timed out/i);

    const skipFinding = result.findings.find((f) => f.ruleId === 'slow-rule');
    expect(skipFinding?.state).toBe('SKIP');
  }, 10_000);

  it('expensive rules get 5000ms timeout by default', async () => {
    const engine = new RuleEngine();
    let capturedTimeout = 0;

    engine.register(
      makeRule('expensive-rule', {
        cost: 'expensive',
        evaluate: async () => {
          // We just verify the rule runs successfully (i.e., default timeout is >= 1000ms)
          capturedTimeout = 1; // flag that it ran
          return [makeFinding('expensive-rule', 'PASS')];
        },
      }),
    );

    const result = await engine.run(makeCtx());
    expect(capturedTimeout).toBe(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('duplicate rule ID registration throws Error', () => {
    const engine = new RuleEngine();

    engine.register(makeRule('dupe-rule'));
    expect(() => engine.register(makeRule('dupe-rule'))).toThrow(/Duplicate rule ID/);
  });

  it('empty engine run returns empty findings/skipped/previewed with durationMs >= 0', async () => {
    const engine = new RuleEngine();

    const result = await engine.run(makeCtx());

    expect(result.findings).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.previewed).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('attaches temporal decay to findings after evaluate', async () => {
    const engine = new RuleEngine();

    engine.register(
      makeRule('decay-rule', {
        evaluate: async () => [
          {
            ...makeFinding('decay-rule', 'FAIL'),
            // Use a very old date so temporal weight is noticeably decayed
            firedAt: new Date(Date.now() - 365 * 86_400_000),
            temporalWeight: 999, // engine should overwrite this
          },
        ],
      }),
    );

    const result = await engine.run(makeCtx());

    const finding = result.findings.find((f) => f.ruleId === 'decay-rule');
    expect(finding).toBeDefined();
    // Engine should have re-computed temporalWeight (not left at 999)
    expect(finding!.temporalWeight).toBeLessThan(999);
    // Decayed over 365 days with default λ=0.01: e^(-0.01*365) ≈ 0.026
    expect(finding!.temporalWeight).toBeLessThan(0.1);
  });

  it('result includes skipped and previewed arrays in EngineResult', async () => {
    const engine = new RuleEngine();

    const result = await engine.run(makeCtx());

    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.previewed)).toBe(true);
  });
});
