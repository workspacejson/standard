import { weightedConfidence } from '../../engine/temporal-decay.js';
import type { ConfidenceSignal, Finding, Rule, RuleContext, StaticRuleContext } from '../../types.js';

export function createReviewTimeAnomalyRule(): Rule {
  return {
    meta: {
      id: 'review-time-anomaly',
      version: '2.0.0',
      description: 'Detects AI-assisted edits accepted unusually quickly without adequate review.',
      category: 'intelligence',
      scope: 'file',
      firingMode: 'compound',
      cost: 'expensive',
      requiredTier: 'pro',
      decayConstant: 0.01,
      previewMessage: (_ctx: StaticRuleContext) =>
        'Would analyze AI session velocity and review patterns — requires Vreko',
    },

    async evaluate(ctx: RuleContext): Promise<Finding[]> {
      if (!ctx.vreko) return [];

      const now = new Date();
      const filePath = ctx.file.path;

      const recentActivity = ctx.vreko.attribution.recentAIActivity(filePath);
      if (recentActivity.length === 0) {
        return [{
          ruleId: 'review-time-anomaly',
          ruleVersion: '2.0.0',
          state: 'INSUFFICIENT_DATA',
          confidence: 0,
          signals: [],
          temporalWeight: 1,
          evidence: { file: filePath },
          message: 'No recent AI activity detected for this file.',
          firedAt: now,
          sampleCount: 0,
          samplesRequired: 1,
          calibrationProgress: 0,
        }];
      }

      const anomalies: Finding[] = [];

      for (const activity of recentActivity) {
        const diffSize = activity.linesAdded + activity.linesRemoved;
        if (diffSize <= 500) continue;

        let reviewSeconds: number;
        try {
          const windowStart = new Date(activity.at.getTime() - 3_600_000);
          const windowEnd   = new Date(activity.at.getTime() + 3_600_000);
          const commits = await ctx.git.commitsBetween(filePath, windowStart, windowEnd);
          if (commits.length === 0) continue;
          reviewSeconds = ctx.vreko.velocity.reviewTime(commits[0]!.hash);
        } catch {
          continue;
        }

        if (reviewSeconds >= 120) continue;

        const testsAdded = ctx.repo.files.some(
          (f) =>
            (f.endsWith('.test.ts') || f.endsWith('.spec.ts') || f.endsWith('.test.js')) &&
            f.includes(filePath.replace(/\.[^.]+$/, '')),
        );
        if (testsAdded) continue;

        const diffSignalValue = Math.min(1, diffSize / 2000);
        const reviewSignalValue = Math.max(0, 1 - reviewSeconds / 120);

        const signals: ConfidenceSignal[] = [
          { name: 'diff-size', weight: 0.4, value: diffSignalValue, observedAt: activity.at },
          { name: 'review-velocity', weight: 0.4, value: reviewSignalValue, observedAt: activity.at },
          { name: 'no-tests-added', weight: 0.2, value: 1, observedAt: activity.at },
        ];

        anomalies.push({
          ruleId: 'review-time-anomaly',
          ruleVersion: '2.0.0',
          state: 'FAIL',
          severity: 'critical',
          confidence: weightedConfidence(signals, 0.01),
          signals,
          temporalWeight: 1,
          evidence: {
            file: filePath,
            snippet: `AI diff: ${diffSize} lines, review: ${reviewSeconds}s, no tests`,
          },
          message: `File "${filePath}" received a large AI-assisted change (${diffSize} lines) reviewed in only ${reviewSeconds}s with no tests added.`,
          remediation: 'Review the AI-generated changes carefully and add tests before merging.',
          firedAt: now,
        });
      }

      return anomalies;
    },
  };
}

export const reviewTimeAnomaly = createReviewTimeAnomalyRule();
