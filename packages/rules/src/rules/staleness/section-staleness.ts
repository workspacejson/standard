import type { AuditConfig, Finding, ParsedAgentsMd, RepoState, Rule, RuleContext } from '../../types.js';

const MS_PER_DAY = 86_400_000;

export const sectionStaleness: Rule = {
  meta: {
    id: 'section-staleness',
    version: '2.0.0',
    description: 'AGENTS.md has not been updated despite significant repository activity.',
    category: 'staleness',
    scope: 'workspace',
    firingMode: 'threshold',
    cost: 'cheap',
    requiredTier: 'open',
  },

  async evaluate(ctx: RuleContext): Promise<Finding[]> {
    // v0.2 migration bridge: workspace-scoped rules access agentsMd via legacy cast.
    // TODO(v0.3): move agentsMd into WorkspaceSignals or a dedicated workspace rule context.
    const legacyCtx = ctx as unknown as {
      agentsMd: ParsedAgentsMd;
      repo: RepoState;
      config: AuditConfig;
    };
    const { agentsMd, repo, config } = legacyCtx;

    const findings: Finding[] = [];
    const now = Date.now();
    const ageDays = (now - agentsMd.lastModified.getTime()) / MS_PER_DAY;
    const thresholdDays = (config.stalenessThresholdDays as number | undefined) ?? 60;
    const highActivityCommitCount = (config.highActivityCommitCount as number | undefined) ?? 20;

    const gate1 = ageDays >= thresholdDays;
    const gate2 = repo.gitHistory.nonAgentsCommitCount30Days >= highActivityCommitCount;
    const referencedFiles = new Set(agentsMd.filePaths);
    const gate3 = repo.gitHistory.filesChangedLast30Days.some((file) => referencedFiles.has(file) || referencedFiles.has(`./${file}`));

    if (!gate1 || !gate2 || !gate3) {
      return findings;
    }

    const stalenessRatio = ageDays / thresholdDays;
    const severity = stalenessRatio >= 2 ? 'warning' : 'info';
    const commitCount = repo.gitHistory.nonAgentsCommitCount30Days;

    findings.push({
      ruleId: this.meta.id,
      ruleVersion: this.meta.version,
      state: 'WARN',
      severity,
      confidence: Math.min(1, ageDays / (thresholdDays * 2)),
      signals: [
        { name: 'age-ratio', weight: 0.5, value: Math.min(1, ageDays / thresholdDays), observedAt: new Date() },
        { name: 'commit-count', weight: 0.3, value: Math.min(1, commitCount / highActivityCommitCount), observedAt: new Date() },
        { name: 'referenced-file-changed', weight: 0.2, value: 1, observedAt: new Date() },
      ],
      temporalWeight: 1,
      evidence: {
        file: agentsMd.filePath,
        snippet: `Last modified: ${agentsMd.lastModified.toISOString().split('T')[0]}`,
      },
      message: `AGENTS.md has not been updated in ${Math.round(ageDays)} days while the repository has had ${commitCount} commits in the last 30 days.`,
      remediation: 'Review AGENTS.md to ensure it reflects current project structure, frameworks, and conventions.',
      firedAt: new Date(),
    });

    return findings;
  },
};
