import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Finding, ParsedAgentsMd, AuditConfig, RepoState, Rule, RuleContext } from '../../types.js';

export const missingFileReference: Rule = {
  meta: {
    id: 'missing-file-reference',
    version: '2.0.0',
    description: 'AGENTS.md references a file path that does not exist on disk.',
    category: 'integrity',
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
    const { agentsMd, repo } = legacyCtx;

    const findings: Finding[] = [];

    for (const filePath of agentsMd.filePaths) {
      if (filePath.startsWith('http') || filePath.startsWith('#')) continue;
      if (filePath.includes('*') || filePath.includes('{')) continue;

      const normalized = filePath.replace(/^\.\//, '');
      const absolute = resolve(repo.root, normalized);

      if (!existsSync(absolute)) {
        findings.push({
          ruleId: this.meta.id,
          ruleVersion: this.meta.version,
          state: 'FAIL',
          severity: 'error',
          confidence: 1,
          signals: [],
          temporalWeight: 1,
          evidence: {
            file: agentsMd.filePath,
            path: filePath,
          },
          message: `File path "${filePath}" referenced in AGENTS.md does not exist.`,
          remediation: `Either create the file at "${filePath}" or remove the reference from AGENTS.md.`,
          firedAt: new Date(),
        });
      }
    }

    return findings;
  },
};
