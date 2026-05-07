import fg from 'fast-glob';
import type { AuditConfig, Finding, ParsedAgentsMd, RepoState, Rule, RuleContext } from '../../types.js';

export const patternZeroMatch: Rule = {
  meta: {
    id: 'pattern-zero-match',
    version: '2.0.0',
    description: 'A pattern referenced in AGENTS.md matches zero files in the repository.',
    category: 'convention',
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

    for (const pattern of agentsMd.patterns) {
      if (!pattern.glob) continue;
      if (pattern.raw.includes('example') || pattern.raw.includes('e.g.')) continue;

      const matches = await fg(pattern.glob, {
        cwd: repo.root,
        ignore: ['node_modules/**', 'dist/**', '.git/**', ...config.ignore],
        dot: true,
      });

      if (matches.length === 0) {
        findings.push({
          ruleId: this.meta.id,
          ruleVersion: this.meta.version,
          state: 'WARN',
          severity: 'warning',
          confidence: 1,
          signals: [],
          temporalWeight: 1,
          evidence: {
            file: agentsMd.filePath,
            line: pattern.lineNumber,
            snippet: pattern.raw,
          },
          message: `Pattern "${pattern.raw}" in AGENTS.md matches no files in this repository.`,
          remediation: `Verify the pattern is correct, or update AGENTS.md to reflect the current project structure.`,
          firedAt: new Date(),
        });
      }
    }

    return findings;
  },
};
