import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Finding, Rule, RuleContext } from '../../types.js';

export const missingFileReference: Rule = {
  id: 'missing-file-reference',
  category: 'integrity',
  severity: 'error',
  description: 'AGENTS.md references a file path that does not exist on disk.',

  async evaluate(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const filePath of ctx.agentsMd.filePaths) {
      if (filePath.startsWith('http') || filePath.startsWith('#')) continue;
      if (filePath.includes('*') || filePath.includes('{')) continue;

      const normalized = filePath.replace(/^\.\//, '');
      const absolute = resolve(ctx.repo.root, normalized);

      if (!existsSync(absolute)) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          message: `File path "${filePath}" referenced in AGENTS.md does not exist.`,
          evidence: {
            file: ctx.agentsMd.filePath,
            path: filePath,
          },
          remediation: `Either create the file at "${filePath}" or remove the reference from AGENTS.md.`,
        });
      }
    }

    return findings;
  },
};
