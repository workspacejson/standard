import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import fg from 'fast-glob';
import type { AuditConfig, ConventionEntry, Finding, ParsedAgentsMd, RepoState, Rule, RuleContext } from '../../types.js';

interface ConventionMismatchRule extends Rule {
  checkConvention(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState): Promise<Finding | null>;
  checkColocation(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState): Promise<Finding | null>;
  checkTestDirectory(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState, expectedDir: string): Promise<Finding | null>;
  checkSourceDirectory(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState, expectedDir: string): Promise<Finding | null>;
  checkFilenameCase(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): Promise<Finding | null>;
  matchesCase(name: string, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): boolean;
}

export const conventionMismatch: ConventionMismatchRule = {
  meta: {
    id: 'convention-mismatch',
    version: '2.0.0',
    description: 'Repository structure contradicts an explicit convention stated in AGENTS.md.',
    category: 'convention',
    scope: 'workspace',
    firingMode: 'threshold',
    cost: 'moderate',
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
    for (const convention of agentsMd.conventions) {
      const finding = await this.checkConvention(convention, agentsMd, repo);
      if (finding) findings.push(finding);
    }
    return findings;
  },

  async checkConvention(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState): Promise<Finding | null> {
    switch (convention.canonical) {
      case 'colocated-tests':
        return this.checkColocation(convention, agentsMd, repo);
      case 'tests-in-dunder-tests':
        return this.checkTestDirectory(convention, agentsMd, repo, '__tests__');
      case 'tests-in-tests-dir':
        return this.checkTestDirectory(convention, agentsMd, repo, 'tests');
      case 'source-in-src':
        return this.checkSourceDirectory(convention, agentsMd, repo, 'src');
      case 'kebab-case-filenames':
        return this.checkFilenameCase(convention, agentsMd, repo, 'kebab');
      case 'camelcase-filenames':
        return this.checkFilenameCase(convention, agentsMd, repo, 'camel');
      case 'pascalcase-filenames':
        return this.checkFilenameCase(convention, agentsMd, repo, 'pascal');
      case 'snake-case-filenames':
        return this.checkFilenameCase(convention, agentsMd, repo, 'snake');
      default:
        return null;
    }
  },

  async checkColocation(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState): Promise<Finding | null> {
    const separateTestDir = (await fg(['test/**/*', '__tests__/**/*', 'tests/**/*', 'spec/**/*'], {
      cwd: repo.root,
      ignore: ['node_modules/**', 'dist/**', '.git/**'],
      dot: true,
    })).length > 0;
    if (!separateTestDir) return null;

    return {
      ruleId: this.meta.id,
      ruleVersion: this.meta.version,
      state: 'WARN',
      severity: 'warning',
      confidence: 1,
      signals: [],
      temporalWeight: 1,
      evidence: {
        file: agentsMd.filePath,
        line: convention.lineNumber,
        snippet: convention.raw,
      },
      message: 'AGENTS.md states colocated tests, but a separate test directory was found at the repo root.',
      remediation: 'Move tests to be colocated with source files, or update the convention in AGENTS.md.',
      firedAt: new Date(),
    };
  },

  async checkTestDirectory(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState, expectedDir: string): Promise<Finding | null> {
    const searchRoots = repo.isMonorepo ? repo.packages.map((pkg) => resolve(repo.root, pkg.path)) : [repo.root];
    const violations: string[] = [];

    for (const root of searchRoots) {
      const testFiles = await fg('**/*.{test,spec}.{ts,js,tsx,jsx}', {
        cwd: root,
        ignore: [`**/${expectedDir}/**`, 'node_modules/**', 'dist/**'],
      });
      if (testFiles.length > 0) {
        violations.push(root);
      }
    }

    if (violations.length > 0) {
      return {
        ruleId: this.meta.id,
        ruleVersion: this.meta.version,
        state: 'WARN',
        severity: 'warning',
        confidence: 1,
        signals: [],
        temporalWeight: 1,
        evidence: {
          file: agentsMd.filePath,
          line: convention.lineNumber,
          snippet: convention.raw,
        },
        message: `AGENTS.md states tests should be in "${expectedDir}/" directories, but test files were found outside this location.`,
        remediation: `Move test files into "${expectedDir}/" directories, or update the convention in AGENTS.md.`,
        firedAt: new Date(),
      };
    }

    return null;
  },

  async checkSourceDirectory(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState, expectedDir: string): Promise<Finding | null> {
    if (!existsSync(resolve(repo.root, expectedDir))) {
      return {
        ruleId: this.meta.id,
        ruleVersion: this.meta.version,
        state: 'WARN',
        severity: 'warning',
        confidence: 1,
        signals: [],
        temporalWeight: 1,
        evidence: {
          file: agentsMd.filePath,
          line: convention.lineNumber,
          snippet: convention.raw,
        },
        message: `AGENTS.md states source code lives in "${expectedDir}/", but that directory does not exist.`,
        remediation: `Create the "${expectedDir}/" directory, or update the convention in AGENTS.md.`,
        firedAt: new Date(),
      };
    }

    return null;
  },

  async checkFilenameCase(convention: ConventionEntry, agentsMd: ParsedAgentsMd, repo: RepoState, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): Promise<Finding | null> {
    const sourceFiles = await fg('src/**/*.{ts,js,tsx,jsx}', {
      cwd: repo.root,
      ignore: ['node_modules/**', 'dist/**', '**/*.d.ts'],
    });

    const violations = sourceFiles.filter((file) => {
      const name = basename(file).replace(/\.(ts|js|tsx|jsx)$/, '');
      return !this.matchesCase(name, caseType);
    });

    const violationRate = violations.length / Math.max(sourceFiles.length, 1);
    if (violationRate < 0.2) return null;

    return {
      ruleId: this.meta.id,
      ruleVersion: this.meta.version,
      state: 'WARN',
      severity: 'warning',
      confidence: 1,
      signals: [],
      temporalWeight: 1,
      evidence: {
        file: agentsMd.filePath,
        line: convention.lineNumber,
        snippet: `Examples: ${violations.slice(0, 3).join(', ')}`,
      },
      message: `AGENTS.md states ${caseType}-case filenames, but ${violations.length} of ${sourceFiles.length} source files do not conform.`,
      remediation: `Rename non-conforming files to use ${caseType}-case, or update the convention in AGENTS.md.`,
      firedAt: new Date(),
    };
  },

  matchesCase(name: string, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): boolean {
    switch (caseType) {
      case 'kebab':
        return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
      case 'camel':
        return /^[a-z][a-zA-Z0-9]*$/.test(name);
      case 'pascal':
        return /^[A-Z][a-zA-Z0-9]*$/.test(name);
      case 'snake':
        return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
    }
  },
};
