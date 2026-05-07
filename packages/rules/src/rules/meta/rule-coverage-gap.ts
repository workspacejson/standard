import type { Finding, Rule, RuleContext } from '../../types.js';

const SOURCE_EXTENSIONS = ['.ts', '.js', '.py', '.rs', '.go', '.rb', '.java', '.kt', '.cs'];
const COVERAGE_RULES = ['churn-fragility', 'blast-radius', 'missing-file-reference'];

export function createRuleCoverageGapRule(): Rule {
  return {
    meta: {
      id: 'rule-coverage-gap',
      version: '2.0.0',
      description: 'A significant portion of source files have no rule findings, indicating audit coverage gaps.',
      category: 'meta',
      scope: 'workspace',
      firingMode: 'threshold',
      prerequisites: ['churn-fragility', 'blast-radius', 'missing-file-reference'],
      cost: 'cheap',
      requiredTier: 'open',
    },

    async evaluate(ctx: RuleContext): Promise<Finding[]> {
      const now = new Date();

      const sourceFiles = ctx.repo.files.filter((f) =>
        SOURCE_EXTENSIONS.some((ext) => f.endsWith(ext)),
      );

      if (sourceFiles.length === 0) {
        return [{
          ruleId: 'rule-coverage-gap',
          ruleVersion: '2.0.0',
          state: 'PASS',
          confidence: 1,
          signals: [],
          temporalWeight: 1,
          evidence: {},
          message: 'No source files detected; coverage gap check skipped.',
          firedAt: now,
        }];
      }

      const coveredFiles = new Set<string>();
      for (const ruleId of COVERAGE_RULES) {
        for (const f of ctx.findings.findingsFor(ruleId)) {
          if (f.evidence.file) coveredFiles.add(f.evidence.file);
        }
      }

      const rawGap = (sourceFiles.length - coveredFiles.size) / sourceFiles.length;
      const gapRatio = Math.max(0, Math.min(1, rawGap));

      if (gapRatio <= 0.6) {
        return [{
          ruleId: 'rule-coverage-gap',
          ruleVersion: '2.0.0',
          state: 'PASS',
          confidence: 1 - gapRatio,
          signals: [],
          temporalWeight: 1,
          evidence: {},
          message: `Coverage gap is acceptable (${(gapRatio * 100).toFixed(1)}% of files uncovered).`,
          firedAt: now,
        }];
      }

      return [{
        ruleId: 'rule-coverage-gap',
        ruleVersion: '2.0.0',
        state: 'WARN',
        severity: 'warning',
        confidence: gapRatio,
        signals: [],
        temporalWeight: 1,
        evidence: {
          snippet: `${sourceFiles.length} source files, ${coveredFiles.size} covered, ${(gapRatio * 100).toFixed(1)}% gap`,
        },
        message: `Rule coverage gap: ${(gapRatio * 100).toFixed(1)}% of source files have no audit findings.`,
        remediation: 'Enable churn-fragility and blast-radius rules to increase file-level coverage.',
        firedAt: now,
      }];
    },
  };
}

export const ruleCoverageGap = createRuleCoverageGapRule();
