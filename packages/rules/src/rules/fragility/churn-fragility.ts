import { weightedConfidence } from '../../engine/temporal-decay.js';
import type { ConfidenceSignal, Finding, Rule, RuleContext } from '../../types.js';

interface ChurnFragilityConfig {
  churnThreshold?: number;
  warnThreshold?: number;
  lookbackDays?: number;
}

export function createChurnFragilityRule(config: ChurnFragilityConfig = {}): Rule {
  const churnThreshold = config.churnThreshold ?? 0.7;
  const warnThreshold = config.warnThreshold ?? 0.5;
  const lookbackDays = config.lookbackDays ?? 90;

  return {
    meta: {
      id: 'churn-fragility',
      version: '2.0.0',
      description: 'File has high churn suggesting fragility and instability risk.',
      category: 'fragility',
      scope: 'file',
      firingMode: 'threshold',
      cost: 'moderate',
      requiredTier: 'open',
      lookbackDays,
      decayConstant: 0.01,
      configSchema: {
        churnThreshold: { type: 'number', minimum: 0, maximum: 1 },
        warnThreshold: { type: 'number', minimum: 0, maximum: 1 },
        lookbackDays: { type: 'number', minimum: 1 },
      },
    },

    async evaluate(ctx: RuleContext): Promise<Finding[]> {
      const now = new Date();

      const [rawChurn, rawAuthorCount, rawVelocity] = await Promise.all([
        ctx.git.churnScore(ctx.file.path),
        ctx.git.authorCount(ctx.file.path, lookbackDays),
        ctx.git.modificationVelocity(ctx.file.path, lookbackDays),
      ]);

      const normalizedAuthorCount = Math.min(1, rawAuthorCount / 5);

      const signals: ConfidenceSignal[] = [
        { name: 'churn-score', weight: 0.4, value: Math.min(1, Math.max(0, rawChurn)), observedAt: now },
        { name: 'author-count', weight: 0.3, value: normalizedAuthorCount, observedAt: now },
        { name: 'modification-velocity', weight: 0.3, value: Math.min(1, Math.max(0, rawVelocity)), observedAt: now },
      ];

      const confidence = weightedConfidence(signals, 0.01);

      if (confidence < warnThreshold) {
        return [{
          ruleId: 'churn-fragility',
          ruleVersion: '2.0.0',
          state: 'PASS',
          confidence,
          signals,
          temporalWeight: 1,
          evidence: { file: ctx.file.path },
          message: `File has acceptable churn levels (confidence: ${confidence.toFixed(2)})`,
          firedAt: now,
        }];
      }

      const state = confidence >= churnThreshold ? 'FAIL' : 'WARN';
      const severity = confidence >= churnThreshold ? 'error' : 'warning';

      return [{
        ruleId: 'churn-fragility',
        ruleVersion: '2.0.0',
        state,
        severity,
        confidence,
        signals,
        temporalWeight: 1,
        evidence: {
          file: ctx.file.path,
          snippet: `Churn: ${rawChurn.toFixed(2)}, Authors: ${rawAuthorCount}, Velocity: ${rawVelocity.toFixed(2)}`,
        },
        message: `File "${ctx.file.path}" has ${state === 'FAIL' ? 'high' : 'moderate'} churn fragility (confidence: ${confidence.toFixed(2)}).`,
        remediation: 'Consider refactoring frequently changed files into smaller, more stable units.',
        firedAt: now,
        sampleCount: lookbackDays,
      }];
    },
  };
}

export const churnFragility = createChurnFragilityRule();
