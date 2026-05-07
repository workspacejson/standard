import { describe, expect, it } from 'vitest';
import type { Finding, FindingGraph, GitSignals, RuleContext } from '../../../types.js';
import { createRuleCoverageGapRule } from '../rule-coverage-gap.js';

function makeCtx(overrides: {
  repoFiles?: string[];
  findingsForRule?: (ruleId: string) => Finding[];
}): RuleContext {
  const { repoFiles = [], findingsForRule = () => [] } = overrides;

  const git: GitSignals = {
    recentCommits: async () => [],
    fileAge: async () => 0,
    churnScore: async () => 0,
    lastModified: async () => new Date(),
    authorCount: async () => 0,
    commitsBetween: async () => [],
    modificationVelocity: async () => 0,
  };

  const findings: FindingGraph = {
    findingsFor: (ruleId: string) => findingsForRule(ruleId),
    hasFinding: () => false,
    confidence: () => null,
  };

  return {
    repo: { root: process.cwd(), files: repoFiles, isMonorepo: false },
    workspace: {
      topology: 'single-package',
      ciProvider: 'unknown',
      manifests: {},
      packages: [],
      agentFiles: {},
    },
    config: {},
    file: { path: 'AGENTS.md', language: 'unknown', content: '' },
    git,
    findings,
    emit: () => {},
  };
}

function makeFinding(file: string): Finding {
  return {
    ruleId: 'churn-fragility',
    ruleVersion: '2.0.0',
    state: 'FAIL',
    severity: 'error',
    confidence: 0.8,
    signals: [],
    temporalWeight: 1,
    evidence: { file },
    message: 'test finding',
    firedAt: new Date(),
  };
}

describe('rule-coverage-gap rule', () => {
  it('returns PASS when there are no source files', async () => {
    const rule = createRuleCoverageGapRule();
    // Only non-source files
    const ctx = makeCtx({ repoFiles: ['README.md', 'docs/guide.md', '.gitignore'] });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('PASS');
    expect(findings[0]!.ruleId).toBe('rule-coverage-gap');
  });

  it('returns PASS when gapRatio <= 0.6 (sufficient coverage)', async () => {
    const rule = createRuleCoverageGapRule();
    // 10 source files, 5 covered → gapRatio = 0.5 ≤ 0.6
    const sourceFiles = Array.from({ length: 10 }, (_, i) => `src/file-${i}.ts`);
    const coveredFiles = sourceFiles.slice(0, 5); // first 5 are covered

    const ctx = makeCtx({
      repoFiles: sourceFiles,
      findingsForRule: (ruleId) => {
        if (ruleId === 'churn-fragility') {
          return coveredFiles.map((f) => makeFinding(f));
        }
        return [];
      },
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('PASS');
    expect(findings[0]!.confidence).toBeGreaterThan(0);
  });

  it('returns WARN with confidence = gapRatio when gapRatio > 0.6', async () => {
    const rule = createRuleCoverageGapRule();
    // 10 source files, 2 covered → gapRatio = 0.8 > 0.6
    const sourceFiles = Array.from({ length: 10 }, (_, i) => `src/feature-${i}.py`);
    const coveredFiles = sourceFiles.slice(0, 2); // only 2 covered

    const ctx = makeCtx({
      repoFiles: sourceFiles,
      findingsForRule: (ruleId) => {
        if (ruleId === 'missing-file-reference') {
          return coveredFiles.map((f) => makeFinding(f));
        }
        return [];
      },
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('WARN');
    expect(findings[0]!.severity).toBe('warning');
    // confidence should equal gapRatio = 0.8
    expect(findings[0]!.confidence).toBeCloseTo(0.8, 5);
  });

  it('counts files across all coverage rules (churn-fragility, blast-radius, missing-file-reference)', async () => {
    const rule = createRuleCoverageGapRule();
    // 10 source files; 3 covered by churn, 2 by blast-radius, 2 by missing-file-reference (7 total)
    const sourceFiles = Array.from({ length: 10 }, (_, i) => `src/svc-${i}.ts`);

    const ctx = makeCtx({
      repoFiles: sourceFiles,
      findingsForRule: (ruleId) => {
        if (ruleId === 'churn-fragility') return sourceFiles.slice(0, 3).map(makeFinding);
        if (ruleId === 'blast-radius') return sourceFiles.slice(3, 5).map(makeFinding);
        if (ruleId === 'missing-file-reference') return sourceFiles.slice(5, 7).map(makeFinding);
        return [];
      },
    });

    const findings = await rule.evaluate(ctx);
    // gapRatio = (10 - 7) / 10 = 0.3 ≤ 0.6 → PASS
    expect(findings[0]!.state).toBe('PASS');
  });

  it('deduplicates covered files across rules', async () => {
    const rule = createRuleCoverageGapRule();
    // 5 source files, all 5 covered by both churn and blast-radius → gapRatio = 0
    const sourceFiles = Array.from({ length: 5 }, (_, i) => `src/dup-${i}.ts`);

    const ctx = makeCtx({
      repoFiles: sourceFiles,
      findingsForRule: (ruleId) => {
        if (ruleId === 'churn-fragility') return sourceFiles.map(makeFinding);
        if (ruleId === 'blast-radius') return sourceFiles.map(makeFinding);
        return [];
      },
    });

    const findings = await rule.evaluate(ctx);
    // gapRatio = 0 ≤ 0.6 → PASS
    expect(findings[0]!.state).toBe('PASS');
  });

  it('only counts source-extension files (not .md, .json, etc)', async () => {
    const rule = createRuleCoverageGapRule();
    // Mix of source and non-source files
    const allFiles = [
      'src/main.ts', // source
      'README.md',   // not source
      'package.json', // not source
      '.env',         // not source
    ];

    const ctx = makeCtx({
      repoFiles: allFiles,
      findingsForRule: () => [], // no coverage
    });

    const findings = await rule.evaluate(ctx);
    // Only 1 source file, 0 covered → gapRatio = 1.0 > 0.6 → WARN
    expect(findings[0]!.state).toBe('WARN');
    expect(findings[0]!.confidence).toBeCloseTo(1.0, 5);
  });

  it('has correct rule metadata', () => {
    const rule = createRuleCoverageGapRule();
    expect(rule.meta.id).toBe('rule-coverage-gap');
    expect(rule.meta.category).toBe('meta');
    expect(rule.meta.requiredTier).toBe('open');
    expect(rule.meta.scope).toBe('workspace');
  });
});
