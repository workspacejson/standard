import fg from 'fast-glob';
import type { Finding, Rule, RuleContext } from '../../types.js';

export const patternZeroMatch: Rule = {
  id: 'pattern-zero-match',
  category: 'integrity',
  severity: 'warning',
  description: 'A pattern referenced in AGENTS.md matches zero files in the repository.',

  async evaluate(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const pattern of ctx.agentsMd.patterns) {
      if (!pattern.glob) continue;
      if (pattern.raw.includes('example') || pattern.raw.includes('e.g.')) continue;

      const matches = await fg(pattern.glob, {
        cwd: ctx.repo.root,
        ignore: ['node_modules/**', 'dist/**', '.git/**', ...ctx.config.ignore],
        dot: true,
      });

      if (matches.length === 0) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Pattern "${pattern.raw}" in AGENTS.md matches no files in this repository.`,
          evidence: {
            file: ctx.agentsMd.filePath,
            line: pattern.lineNumber,
            snippet: pattern.raw,
          },
          remediation: `Verify the pattern is correct, or update AGENTS.md to reflect the current project structure.`,
        });
      }
    }

    return findings;
  },
};
