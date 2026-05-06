import type { Finding, Rule, RuleContext } from '../../types.js';

const MS_PER_DAY = 86_400_000;

export const sectionStaleness: Rule = {
  id: 'section-staleness',
  category: 'staleness',
  severity: 'warning',
  description: 'AGENTS.md has not been updated despite significant repository activity.',

  async evaluate(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const now = Date.now();
    const ageDays = (now - ctx.agentsMd.lastModified.getTime()) / MS_PER_DAY;
    const thresholdDays = ctx.config.stalenessThresholdDays ?? 60;
    const highActivityCommitCount = ctx.config.highActivityCommitCount ?? 20;

    const gate1 = ageDays >= thresholdDays;
    const gate2 = ctx.repo.gitHistory.nonAgentsCommitCount30Days >= highActivityCommitCount;
    const referencedFiles = new Set(ctx.agentsMd.filePaths);
    const gate3 = ctx.repo.gitHistory.filesChangedLast30Days.some((file) => referencedFiles.has(file) || referencedFiles.has(`./${file}`));

    if (!gate1 || !gate2 || !gate3) {
      return findings;
    }

    const stalenessRatio = ageDays / thresholdDays;
    const severity = stalenessRatio >= 2 ? 'warning' : 'info';

    findings.push({
      ruleId: this.id,
      severity,
      message: `AGENTS.md has not been updated in ${Math.round(ageDays)} days while the repository has had ${ctx.repo.gitHistory.nonAgentsCommitCount30Days} commits in the last 30 days.`,
      evidence: {
        file: ctx.agentsMd.filePath,
        snippet: `Last modified: ${ctx.agentsMd.lastModified.toISOString().split('T')[0]}`,
      },
      remediation: 'Review AGENTS.md to ensure it reflects current project structure, frameworks, and conventions.',
    });

    return findings;
  },
};
