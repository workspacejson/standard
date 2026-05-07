import type { Finding, HygieneScore, Rule, RuleContext } from '../types.js';

export class RuleEngine {
  private rules: Rule[] = [];

  register(rule: Rule): void {
    this.rules.push(rule);
  }

  async run(ctx: RuleContext): Promise<{ findings: Finding[]; durationMs: number }> {
    const start = Date.now();
    const findings: Finding[] = [];

    const results = await Promise.allSettled(this.rules.map((rule) => rule.evaluate(ctx)));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        findings.push(...result.value);
      }
    }

    return {
      findings,
      durationMs: Date.now() - start,
    };
  }
}

export function computeHygieneScore(findings: Finding[]): HygieneScore {
  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const infoCount = findings.filter((finding) => finding.severity === 'info').length;

  let score =
    100 *
    Math.max(0, 1 - errorCount / 10) *
    Math.max(0, 1 - warningCount / 50) *
    Math.max(0, 1 - infoCount / 200);

  if (errorCount > 0) {
    score = Math.min(score, 70);
  }

  score = Math.round(score);

  const grade = score >= 95 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';

  return {
    value: score,
    grade,
    errorCount,
    warningCount,
    infoCount,
  };
}
