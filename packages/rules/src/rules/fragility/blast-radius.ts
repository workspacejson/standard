import { readFileSync, existsSync } from 'node:fs';
import type { Finding, Rule, RuleContext } from '../../types.js';

interface BlastRadiusConfig {
  minImporters?: number;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'];

export function createBlastRadiusRule(config: BlastRadiusConfig = {}): Rule {
  const minImporters = config.minImporters ?? 5;

  return {
    meta: {
      id: 'blast-radius',
      version: '2.0.0',
      description: 'File is imported by many other files, giving it high blast radius on change.',
      category: 'fragility',
      scope: 'file',
      firingMode: 'threshold',
      prerequisites: ['missing-file-reference'],
      cost: 'moderate',
      requiredTier: 'open',
    },

    async evaluate(ctx: RuleContext): Promise<Finding[]> {
      const now = new Date();
      const filePath = ctx.file.path;
      const basename = filePath.replace(/\.[^.]+$/, '');

      const importers: string[] = [];
      for (const repoFile of ctx.repo.files) {
        if (!SOURCE_EXTENSIONS.some((ext) => repoFile.endsWith(ext))) continue;
        if (repoFile === filePath) continue;

        try {
          const content = existsSync(repoFile) ? readFileSync(repoFile, 'utf8') : '';
          if (
            content.includes(`'${filePath}'`) ||
            content.includes(`"${filePath}"`) ||
            content.includes(`'${basename}'`) ||
            content.includes(`"${basename}"`)
          ) {
            importers.push(repoFile);
          }
        } catch {
          // Unreadable files are skipped
        }
      }

      const fanIn = importers.length;

      if (fanIn < minImporters) {
        return [{
          ruleId: 'blast-radius',
          ruleVersion: '2.0.0',
          state: 'PASS',
          confidence: 1,
          signals: [],
          temporalWeight: 1,
          evidence: { file: filePath, snippet: `Fan-in: ${fanIn}` },
          message: `File "${filePath}" has acceptable fan-in (${fanIn} importers).`,
          firedAt: now,
        }];
      }

      const hasChurnConcern =
        ctx.findings.hasFinding('churn-fragility', 'FAIL') ||
        ctx.findings.hasFinding('churn-fragility', 'WARN');

      const state = hasChurnConcern ? 'FAIL' : 'WARN';
      const severity = hasChurnConcern ? 'error' : 'warning';

      return [{
        ruleId: 'blast-radius',
        ruleVersion: '2.0.0',
        state,
        severity,
        confidence: Math.min(1, fanIn / (minImporters * 2)),
        signals: [],
        temporalWeight: 1,
        evidence: {
          file: filePath,
          snippet: `Fan-in: ${fanIn} importers${hasChurnConcern ? ' + high churn' : ''}`,
        },
        message: `File "${filePath}" has high blast radius (${fanIn} importers)${hasChurnConcern ? ' combined with high churn' : ''}.`,
        remediation: 'Consider splitting this file into smaller modules to reduce coupling.',
        firedAt: now,
      }];
    },
  };
}

export const blastRadius = createBlastRadiusRule();
