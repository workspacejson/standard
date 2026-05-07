import { describe, expect, it } from 'vitest';
import type { AIActivity, FindingGraph, GitSignals, RuleContext, VrekoContext } from '../../../types.js';
import { createReviewTimeAnomalyRule } from '../review-time-anomaly.js';

const COMMIT_HASH = 'abc123def456';

function makeGit(commitsBetweenResult: { hash: string; message: string; author: string; date: Date }[] = []): GitSignals {
  return {
    recentCommits: async () => [],
    fileAge: async () => 0,
    churnScore: async () => 0,
    lastModified: async () => new Date(),
    authorCount: async () => 0,
    commitsBetween: async () => commitsBetweenResult,
    modificationVelocity: async () => 0,
  };
}

function makeVreko(overrides: {
  activities?: AIActivity[];
  reviewTime?: number;
}): VrekoContext {
  const { activities = [], reviewTime = 30 } = overrides;
  return {
    session: {
      currentSession: () => null,
      recentSessions: () => [],
      sessionBoundaries: () => [],
    },
    attribution: {
      fileAttribution: () => ({ humanLines: 0, aiLines: 0 }),
      recentAIActivity: () => activities,
    },
    velocity: {
      editVelocity: () => ({ linesPerMs: 0, sampledAt: new Date(), windowMs: 0 }),
      acceptanceRate: () => 0,
      reviewTime: () => reviewTime,
    },
    knowledge: {
      getPattern: () => null,
      storePattern: () => {},
    },
  };
}

function makeActivity(overrides: {
  linesAdded?: number;
  linesRemoved?: number;
}): AIActivity {
  const { linesAdded = 600, linesRemoved = 100 } = overrides;
  return {
    tool: 'claude',
    at: new Date(),
    linesAdded,
    linesRemoved,
  };
}

function makeCtx(overrides: {
  filePath?: string;
  vreko?: VrekoContext;
  repoFiles?: string[];
  git?: GitSignals;
}): RuleContext {
  const {
    filePath = 'src/service.ts',
    vreko,
    repoFiles = [],
    git = makeGit([{ hash: COMMIT_HASH, message: 'feat: add service', author: 'dev', date: new Date() }]),
  } = overrides;

  const findings: FindingGraph = {
    findingsFor: () => [],
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
    file: { path: filePath, language: 'typescript', content: '' },
    git,
    findings,
    emit: () => {},
    vreko,
  };
}

describe('review-time-anomaly rule', () => {
  it('returns [] when ctx.vreko is undefined (defensive guard)', async () => {
    const rule = createReviewTimeAnomalyRule();
    const ctx = makeCtx({ vreko: undefined });
    const findings = await rule.evaluate(ctx);
    expect(findings).toEqual([]);
  });

  it('returns INSUFFICIENT_DATA when vreko has no recent AI activity', async () => {
    const rule = createReviewTimeAnomalyRule();
    const vreko = makeVreko({ activities: [] });
    const ctx = makeCtx({ vreko });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('INSUFFICIENT_DATA');
    expect(findings[0]!.confidence).toBe(0);
    expect(findings[0]!.sampleCount).toBe(0);
  });

  it('returns CRITICAL finding when all anomaly conditions are met', async () => {
    const rule = createReviewTimeAnomalyRule();
    // diffSize = 1500 + 600 = 2100 > 500, reviewSeconds = 30 < 120, no tests
    const activity = makeActivity({ linesAdded: 1500, linesRemoved: 600 });
    const vreko = makeVreko({ activities: [activity], reviewTime: 30 });
    const ctx = makeCtx({ vreko });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('FAIL');
    expect(findings[0]!.severity).toBe('critical');
    // With diffSize=2100 (> 2000 → saturated at 1.0), reviewSeconds=30 (very fast → high signal)
    // review signal = 1 - 30/120 = 0.75; diff signal ≈ 1.0; no-tests = 1.0
    // weightedConfidence ≈ 0.4*1.0 + 0.4*0.75 + 0.2*1.0 = 0.4 + 0.3 + 0.2 = 0.9 ≥ 0.85
    expect(findings[0]!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('returns CRITICAL with maximum confidence when signals are fully saturated', async () => {
    const rule = createReviewTimeAnomalyRule();
    // diffSize = 3000 (> 2000, saturates at 1.0), reviewTime = 0 → velocity = 1.0
    const activity = makeActivity({ linesAdded: 3000, linesRemoved: 0 });
    const vreko = makeVreko({ activities: [activity], reviewTime: 0 });
    const ctx = makeCtx({ vreko });

    const findings = await rule.evaluate(ctx);
    expect(findings[0]!.state).toBe('FAIL');
    // weightedConfidence with all signals=1.0 and decay≈1 → confidence ≈ 1.0
    expect(findings[0]!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('returns no finding when diffSize <= 500', async () => {
    const rule = createReviewTimeAnomalyRule();
    // Small diff (linesAdded=300, linesRemoved=100 → diffSize=400 ≤ 500)
    const activity = makeActivity({ linesAdded: 300, linesRemoved: 100 });
    const vreko = makeVreko({ activities: [activity], reviewTime: 10 });
    const ctx = makeCtx({ vreko });

    const findings = await rule.evaluate(ctx);
    // No anomaly because diffSize = 400 ≤ 500
    expect(findings).toHaveLength(0);
  });

  it('returns no finding when review time >= 120 seconds', async () => {
    const rule = createReviewTimeAnomalyRule();
    const activity = makeActivity({ linesAdded: 800, linesRemoved: 200 }); // diffSize=1000 > 500
    const vreko = makeVreko({ activities: [activity], reviewTime: 120 }); // exactly 120s boundary
    const ctx = makeCtx({ vreko });

    const findings = await rule.evaluate(ctx);
    // reviewSeconds >= 120 → no anomaly
    expect(findings).toHaveLength(0);
  });

  it('returns no finding when tests were added for the file', async () => {
    const rule = createReviewTimeAnomalyRule();
    const filePath = 'src/service.ts';
    const activity = makeActivity({ linesAdded: 800, linesRemoved: 200 }); // diffSize=1000 > 500
    const vreko = makeVreko({ activities: [activity], reviewTime: 30 }); // fast review

    // Add a test file matching the filePath stem
    const ctx = makeCtx({
      filePath,
      vreko,
      repoFiles: ['src/service.test.ts'], // test file exists → no anomaly
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  it('has correct rule metadata including pro tier and previewMessage', () => {
    const rule = createReviewTimeAnomalyRule();
    expect(rule.meta.id).toBe('review-time-anomaly');
    expect(rule.meta.requiredTier).toBe('pro');
    expect(rule.meta.category).toBe('intelligence');
    expect(rule.meta.scope).toBe('file');
    expect(typeof rule.meta.previewMessage).toBe('function');

    // previewMessage should return a descriptive string
    const mockCtx = {
      repo: { root: '', files: [], isMonorepo: false },
      workspace: { topology: 'single-package' as const, ciProvider: 'unknown' as const, manifests: {}, packages: [], agentFiles: {} },
      config: {},
    };
    const msg = rule.meta.previewMessage!(mockCtx);
    expect(msg).toContain('Vreko');
  });

  it('returns [] when no recent commits found during review time check', async () => {
    const rule = createReviewTimeAnomalyRule();
    const activity = makeActivity({ linesAdded: 800, linesRemoved: 200 }); // diffSize=1000 > 500
    const vreko = makeVreko({ activities: [activity], reviewTime: 30 });

    // No commits returned → rule skips this activity
    const ctx = makeCtx({
      vreko,
      git: makeGit([]), // no commits
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });
});
