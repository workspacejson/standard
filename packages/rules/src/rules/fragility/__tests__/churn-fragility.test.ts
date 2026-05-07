import { describe, expect, it } from 'vitest';
import type { FindingGraph, GitSignals, RuleContext } from '../../../types.js';
import { createChurnFragilityRule } from '../churn-fragility.js';

// Minimal mock RuleContext for churn-fragility (file-scoped rule)
function makeCtx(
  overrides: {
    churnScore?: number;
    authorCount?: number;
    modificationVelocity?: number;
    filePath?: string;
  } = {},
): RuleContext {
  const {
    churnScore = 0,
    authorCount = 0,
    modificationVelocity = 0,
    filePath = 'src/example.ts',
  } = overrides;

  const git: GitSignals = {
    recentCommits: async () => [],
    fileAge: async () => 0,
    churnScore: async () => churnScore,
    lastModified: async () => new Date(),
    authorCount: async () => authorCount,
    commitsBetween: async () => [],
    modificationVelocity: async () => modificationVelocity,
  };

  const findings: FindingGraph = {
    findingsFor: () => [],
    hasFinding: () => false,
    confidence: () => null,
  };

  return {
    repo: { root: process.cwd(), files: [], isMonorepo: false },
    workspace: {
      topology: 'single-package',
      ciProvider: 'unknown',
      manifests: {},
      packages: [],
      agentFiles: {},
    },
    config: {},
    file: { path: filePath, language: 'typescript', content: '' },
    git,
    findings,
    emit: () => {},
  };
}

describe('churn-fragility rule', () => {
  it('returns PASS when all signals are low (confidence < 0.5)', async () => {
    const rule = createChurnFragilityRule();
    // churnScore=0.1, authorCount=1 (norm=0.2), velocity=0.1
    // confidence ≈ 0.4*0.1 + 0.3*0.2 + 0.3*0.1 = 0.04+0.06+0.03 = 0.13
    const ctx = makeCtx({ churnScore: 0.1, authorCount: 1, modificationVelocity: 0.1 });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('PASS');
    expect(findings[0]!.ruleId).toBe('churn-fragility');
    expect(findings[0]!.confidence).toBeLessThan(0.5);
  });

  it('returns WARN when confidence >= 0.5 and < 0.7', async () => {
    const rule = createChurnFragilityRule();
    // churnScore=0.7, authorCount=3 (norm=0.6), velocity=0.4
    // confidence ≈ 0.4*0.7 + 0.3*0.6 + 0.3*0.4 = 0.28+0.18+0.12 = 0.58
    const ctx = makeCtx({ churnScore: 0.7, authorCount: 3, modificationVelocity: 0.4 });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('WARN');
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(findings[0]!.confidence).toBeLessThan(0.7);
  });

  it('returns FAIL when confidence >= 0.7', async () => {
    const rule = createChurnFragilityRule();
    // churnScore=1, authorCount=5 (norm=1), velocity=1
    // confidence = 0.4*1 + 0.3*1 + 0.3*1 = 1.0
    const ctx = makeCtx({ churnScore: 1, authorCount: 5, modificationVelocity: 1 });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('FAIL');
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('uses three signals with weights 0.4 / 0.3 / 0.3', async () => {
    const rule = createChurnFragilityRule();
    const ctx = makeCtx({ churnScore: 0.8, authorCount: 4, modificationVelocity: 0.6 });
    const findings = await rule.evaluate(ctx);
    const signals = findings[0]!.signals;
    expect(signals).toHaveLength(3);

    const churnSig = signals.find((s) => s.name === 'churn-score');
    const authorSig = signals.find((s) => s.name === 'author-count');
    const velocitySig = signals.find((s) => s.name === 'modification-velocity');

    expect(churnSig).toBeDefined();
    expect(churnSig!.weight).toBe(0.4);
    expect(authorSig).toBeDefined();
    expect(authorSig!.weight).toBe(0.3);
    expect(velocitySig).toBeDefined();
    expect(velocitySig!.weight).toBe(0.3);
  });

  it('respects custom thresholds', async () => {
    const rule = createChurnFragilityRule({ churnThreshold: 0.9, warnThreshold: 0.8 });
    // At confidence ≈ 0.58 (from WARN test above), should now be PASS
    const ctx = makeCtx({ churnScore: 0.7, authorCount: 3, modificationVelocity: 0.4 });
    const findings = await rule.evaluate(ctx);
    expect(findings[0]!.state).toBe('PASS');
  });

  it('normalizes author count (caps at 5 = 1.0)', async () => {
    const rule = createChurnFragilityRule();
    // authorCount=10 should be treated same as 5 (normalized to 1.0)
    const ctx10 = makeCtx({ churnScore: 1, authorCount: 10, modificationVelocity: 1 });
    const ctx5 = makeCtx({ churnScore: 1, authorCount: 5, modificationVelocity: 1 });
    const f10 = await rule.evaluate(ctx10);
    const f5 = await rule.evaluate(ctx5);
    // Both should yield the same confidence (both normalized to 1.0)
    expect(f10[0]!.confidence).toBeCloseTo(f5[0]!.confidence, 5);
  });

  it('has correct rule metadata', () => {
    const rule = createChurnFragilityRule();
    expect(rule.meta.id).toBe('churn-fragility');
    expect(rule.meta.category).toBe('fragility');
    expect(rule.meta.requiredTier).toBe('open');
    expect(rule.meta.scope).toBe('file');
  });
});
