import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FindingGraph, GitSignals, RuleContext } from '../../../types.js';
import { createBlastRadiusRule } from '../blast-radius.js';

function makeCtx(overrides: {
  filePath?: string;
  repoFiles?: string[];
  hasFinding?: boolean;
  rootDir: string;
}): RuleContext {
  const {
    filePath = join(overrides.rootDir, 'target.ts'),
    repoFiles = [],
    hasFinding = false,
    rootDir,
  } = overrides;

  const git: GitSignals = {
    recentCommits: async () => [],
    fileAge: async () => 0,
    churnScore: async () => 0,
    lastModified: async () => new Date(),
    authorCount: async () => 0,
    commitsBetween: async () => [],
    modificationVelocity: async () => 0,
  };

  const findings: FindingGraph = {
    findingsFor: () => [],
    hasFinding: (_ruleId: string, state: string) =>
      hasFinding && (state === 'FAIL' || state === 'WARN'),
    confidence: () => null,
  };

  return {
    repo: { root: rootDir, files: repoFiles, isMonorepo: false },
    workspace: {
      topology: 'single-package',
      ciProvider: 'unknown',
      manifests: {},
      packages: [],
      agentFiles: {},
    },
    config: {},
    file: { path: filePath, language: 'typescript', content: '' },
    git,
    findings,
    emit: () => {},
  };
}

describe('blast-radius rule', () => {
  it('has missing-file-reference as a prerequisite', () => {
    const rule = createBlastRadiusRule();
    expect(rule.meta.prerequisites).toContain('missing-file-reference');
  });

  it('returns PASS when fan-in < minImporters (default 5)', async () => {
    const TEST_DIR = join(tmpdir(), `blast-radius-test-${process.pid}-${Date.now()}`);
    mkdirSync(TEST_DIR, { recursive: true });
    try {
    const rule = createBlastRadiusRule();
    const targetFile = join(TEST_DIR, 'low-fanin.ts');
    writeFileSync(targetFile, 'export const x = 1;');

    // Create 3 importing files (< 5)
    const importers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const f = join(TEST_DIR, `importer-low-${i}.ts`);
      writeFileSync(f, `import { x } from '${targetFile}';`);
      importers.push(f);
    }

      const ctx = makeCtx({ rootDir: TEST_DIR, filePath: targetFile, repoFiles: [...importers, targetFile] });
      const findings = await rule.evaluate(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.state).toBe('PASS');
    } finally {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('returns WARN when fan-in >= minImporters but no churn concern', async () => {
    const TEST_DIR = join(tmpdir(), `blast-radius-test-${process.pid}-${Date.now()}`);
    mkdirSync(TEST_DIR, { recursive: true });
    try {
    const rule = createBlastRadiusRule();
    const targetFile = join(TEST_DIR, 'high-fanin-no-churn.ts');
    writeFileSync(targetFile, 'export const y = 2;');

    // Create 5 importing files (= minImporters)
    const importers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const f = join(TEST_DIR, `importer-nochurn-${i}.ts`);
      writeFileSync(f, `import { y } from '${targetFile}';`);
      importers.push(f);
    }

      const ctx = makeCtx({
        rootDir: TEST_DIR,
        filePath: targetFile,
        repoFiles: [...importers, targetFile],
        hasFinding: false,
      });
      const findings = await rule.evaluate(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.state).toBe('WARN');
      expect(findings[0]!.severity).toBe('warning');
    } finally {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('returns FAIL when fan-in >= minImporters AND churn concern present', async () => {
    const TEST_DIR = join(tmpdir(), `blast-radius-test-${process.pid}-${Date.now()}`);
    mkdirSync(TEST_DIR, { recursive: true });
    try {
    const rule = createBlastRadiusRule();
    const targetFile = join(TEST_DIR, 'high-fanin-with-churn.ts');
    writeFileSync(targetFile, 'export const z = 3;');

    // Create 5 importing files (= minImporters)
    const importers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const f = join(TEST_DIR, `importer-churn-${i}.ts`);
      writeFileSync(f, `import { z } from '${targetFile}';`);
      importers.push(f);
    }

      const ctx = makeCtx({
        rootDir: TEST_DIR,
        filePath: targetFile,
        repoFiles: [...importers, targetFile],
        hasFinding: true, // simulates churn-fragility FAIL/WARN finding
      });
      const findings = await rule.evaluate(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.state).toBe('FAIL');
      expect(findings[0]!.severity).toBe('error');
    } finally {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('respects custom minImporters threshold', async () => {
    const TEST_DIR = join(tmpdir(), `blast-radius-test-${process.pid}-${Date.now()}`);
    mkdirSync(TEST_DIR, { recursive: true });
    try {
    const rule = createBlastRadiusRule({ minImporters: 2 });
    const targetFile = join(TEST_DIR, 'custom-threshold.ts');
    writeFileSync(targetFile, 'export const q = 4;');

    // Create 3 importing files (>= custom threshold of 2, < default 5)
    const importers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const f = join(TEST_DIR, `importer-custom-${i}.ts`);
      writeFileSync(f, `import { q } from '${targetFile}';`);
      importers.push(f);
    }

      const ctx = makeCtx({
        rootDir: TEST_DIR,
        filePath: targetFile,
        repoFiles: [...importers, targetFile],
        hasFinding: false,
      });
      const findings = await rule.evaluate(ctx);
      // Should be WARN with custom threshold=2 and fan-in=3
      expect(findings[0]!.state).toBe('WARN');
    } finally {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('ignores non-source-extension files when counting fan-in', async () => {
    const TEST_DIR = join(tmpdir(), `blast-radius-test-${process.pid}-${Date.now()}`);
    mkdirSync(TEST_DIR, { recursive: true });
    try {
    const rule = createBlastRadiusRule({ minImporters: 2 });
    const targetFile = join(TEST_DIR, 'ignored-ext-target.ts');
    writeFileSync(targetFile, 'export const r = 5;');

    // Create files with non-source extensions that reference targetFile
    const repoFiles: string[] = [targetFile];
    for (let i = 0; i < 3; i++) {
      const f = join(TEST_DIR, `importer-ignored-${i}.md`);
      writeFileSync(f, `See [file](${targetFile})`);
      repoFiles.push(f);
    }

      const ctx = makeCtx({ rootDir: TEST_DIR, filePath: targetFile, repoFiles });
      const findings = await rule.evaluate(ctx);
      // .md files are not counted, so fan-in = 0 < 2 → PASS
      expect(findings[0]!.state).toBe('PASS');
    } finally {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('has correct rule metadata', () => {
    const rule = createBlastRadiusRule();
    expect(rule.meta.id).toBe('blast-radius');
    expect(rule.meta.category).toBe('fragility');
    expect(rule.meta.requiredTier).toBe('open');
    expect(rule.meta.scope).toBe('file');
  });
});
