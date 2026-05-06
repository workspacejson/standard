import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import fg from 'fast-glob';
import type { ConventionEntry, Finding, Rule, RuleContext } from '../../types.js';

interface ConventionMismatchRule extends Rule {
  checkConvention(convention: ConventionEntry, ctx: RuleContext): Promise<Finding | null>;
  checkColocation(convention: ConventionEntry, ctx: RuleContext): Promise<Finding | null>;
  checkTestDirectory(convention: ConventionEntry, ctx: RuleContext, expectedDir: string): Promise<Finding | null>;
  checkSourceDirectory(convention: ConventionEntry, ctx: RuleContext, expectedDir: string): Promise<Finding | null>;
  checkFilenameCase(convention: ConventionEntry, ctx: RuleContext, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): Promise<Finding | null>;
  matchesCase(name: string, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): boolean;
}

export const conventionMismatch: ConventionMismatchRule = {
  id: 'convention-mismatch',
  category: 'consistency',
  severity: 'warning',
  description: 'Repository structure contradicts an explicit convention stated in AGENTS.md.',

  async evaluate(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    for (const convention of ctx.agentsMd.conventions) {
      const finding = await this.checkConvention(convention, ctx);
      if (finding) findings.push(finding);
    }
    return findings;
  },

  async checkConvention(convention: ConventionEntry, ctx: RuleContext): Promise<Finding | null> {
    switch (convention.canonical) {
      case 'colocated-tests':
        return this.checkColocation(convention, ctx);
      case 'tests-in-dunder-tests':
        return this.checkTestDirectory(convention, ctx, '__tests__');
      case 'tests-in-tests-dir':
        return this.checkTestDirectory(convention, ctx, 'tests');
      case 'source-in-src':
        return this.checkSourceDirectory(convention, ctx, 'src');
      case 'kebab-case-filenames':
        return this.checkFilenameCase(convention, ctx, 'kebab');
      case 'camelcase-filenames':
        return this.checkFilenameCase(convention, ctx, 'camel');
      case 'pascalcase-filenames':
        return this.checkFilenameCase(convention, ctx, 'pascal');
      case 'snake-case-filenames':
        return this.checkFilenameCase(convention, ctx, 'snake');
      default:
        return null;
    }
  },

  async checkColocation(convention: ConventionEntry, ctx: RuleContext): Promise<Finding | null> {
    const separateTestDir = (await fg(['test/**/*', '__tests__/**/*', 'tests/**/*', 'spec/**/*'], {
      cwd: ctx.repo.root,
      ignore: ['node_modules/**', 'dist/**', '.git/**'],
      dot: true,
    })).length > 0;
    if (!separateTestDir) return null;

    return {
      ruleId: this.id,
      severity: 'warning',
      message: 'AGENTS.md states colocated tests, but a separate test directory was found at the repo root.',
      evidence: {
        file: ctx.agentsMd.filePath,
        line: convention.lineNumber,
        snippet: convention.raw,
      },
      remediation: 'Move tests to be colocated with source files, or update the convention in AGENTS.md.',
    };
  },

  async checkTestDirectory(convention: ConventionEntry, ctx: RuleContext, expectedDir: string): Promise<Finding | null> {
    const searchRoots = ctx.repo.isMonorepo ? ctx.repo.packages.map((pkg) => resolve(ctx.repo.root, pkg.path)) : [ctx.repo.root];
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
        ruleId: this.id,
        severity: 'warning',
        message: `AGENTS.md states tests should be in "${expectedDir}/" directories, but test files were found outside this location.`,
        evidence: {
          file: ctx.agentsMd.filePath,
          line: convention.lineNumber,
          snippet: convention.raw,
        },
        remediation: `Move test files into "${expectedDir}/" directories, or update the convention in AGENTS.md.`,
      };
    }

    return null;
  },

  async checkSourceDirectory(convention: ConventionEntry, ctx: RuleContext, expectedDir: string): Promise<Finding | null> {
    if (!existsSync(resolve(ctx.repo.root, expectedDir))) {
      return {
        ruleId: this.id,
        severity: 'warning',
        message: `AGENTS.md states source code lives in "${expectedDir}/", but that directory does not exist.`,
        evidence: {
          file: ctx.agentsMd.filePath,
          line: convention.lineNumber,
          snippet: convention.raw,
        },
        remediation: `Create the "${expectedDir}/" directory, or update the convention in AGENTS.md.`,
      };
    }

    return null;
  },

  async checkFilenameCase(convention: ConventionEntry, ctx: RuleContext, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): Promise<Finding | null> {
    const sourceFiles = await fg('src/**/*.{ts,js,tsx,jsx}', {
      cwd: ctx.repo.root,
      ignore: ['node_modules/**', 'dist/**', '**/*.d.ts'],
    });

    const violations = sourceFiles.filter((file) => {
      const name = basename(file).replace(/\.(ts|js|tsx|jsx)$/, '');
      return !this.matchesCase(name, caseType);
    });

    const violationRate = violations.length / Math.max(sourceFiles.length, 1);
    if (violationRate < 0.2) return null;

    return {
      ruleId: this.id,
      severity: 'warning',
      message: `AGENTS.md states ${caseType}-case filenames, but ${violations.length} of ${sourceFiles.length} source files do not conform.`,
      evidence: {
        file: ctx.agentsMd.filePath,
        line: convention.lineNumber,
        snippet: `Examples: ${violations.slice(0, 3).join(', ')}`,
      },
      remediation: `Rename non-conforming files to use ${caseType}-case, or update the convention in AGENTS.md.`,
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
