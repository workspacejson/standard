import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IncrementalCache } from '../incremental-cache.js';
import type { Finding } from '../../types.js';

function makeFinding(ruleId: string): Finding {
  return {
    ruleId,
    ruleVersion: '1.0.0',
    state: 'FAIL',
    severity: 'error',
    confidence: 0.9,
    signals: [],
    temporalWeight: 1.0,
    evidence: { file: 'src/foo.ts' },
    message: 'Test finding',
    firedAt: new Date('2025-01-01T00:00:00Z'),
  };
}

describe('IncrementalCache', () => {
  describe('get()', () => {
    it('returns null on cache miss (no entry exists)', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        const result = cache.get(targetFile, 'rule-a', '1.0.0');
        expect(result).toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns null for a different rule version (cache invalidation)', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        const findings = [makeFinding('rule-a')];
        cache.set(targetFile, 'rule-a', '1.0.0', findings);
        const result = cache.get(targetFile, 'rule-a', '2.0.0');
        expect(result).toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns null when file content changes after set()', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        const findings = [makeFinding('rule-a')];
        cache.set(targetFile, 'rule-a', '1.0.0', findings);
        writeFileSync(targetFile, 'export const x = 2; // modified');
        const result = cache.get(targetFile, 'rule-a', '1.0.0');
        expect(result).toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns null for missing files gracefully', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const cache = new IncrementalCache(tmpDir);
        const result = cache.get('/nonexistent/file.ts', 'rule-a', '1.0.0');
        expect(result).toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('set() + get()', () => {
    it('returns stored findings on cache hit', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        const findings = [makeFinding('rule-a')];
        cache.set(targetFile, 'rule-a', '1.0.0', findings);
        const result = cache.get(targetFile, 'rule-a', '1.0.0');
        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result![0]?.ruleId).toBe('rule-a');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('stores and retrieves empty findings array', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        cache.set(targetFile, 'rule-a', '1.0.0', []);
        const result = cache.get(targetFile, 'rule-a', '1.0.0');
        expect(result).not.toBeNull();
        expect(result).toHaveLength(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('stores multiple findings correctly', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        const findings = [makeFinding('rule-a'), makeFinding('rule-a')];
        cache.set(targetFile, 'rule-a', '1.0.0', findings);
        const result = cache.get(targetFile, 'rule-a', '1.0.0');
        expect(result).toHaveLength(2);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('different rule IDs have independent cache entries', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        cache.set(targetFile, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
        cache.set(targetFile, 'rule-b', '1.0.0', []);

        const resultA = cache.get(targetFile, 'rule-a', '1.0.0');
        const resultB = cache.get(targetFile, 'rule-b', '1.0.0');
        expect(resultA).toHaveLength(1);
        expect(resultB).toHaveLength(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('different file paths have independent cache entries', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const fileA = join(tmpDir, 'file-a.ts');
        const fileB = join(tmpDir, 'file-b.ts');
        writeFileSync(fileA, 'export const a = 1;');
        writeFileSync(fileB, 'export const b = 2;');

        const cache = new IncrementalCache(tmpDir);
        cache.set(fileA, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
        cache.set(fileB, 'rule-a', '1.0.0', []);

        const resultA = cache.get(fileA, 'rule-a', '1.0.0');
        const resultB = cache.get(fileB, 'rule-a', '1.0.0');
        expect(resultA).toHaveLength(1);
        expect(resultB).toHaveLength(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('cache directory creation', () => {
    it('creates cache directory automatically on set()', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
      try {
        const targetFile = join(tmpDir, 'test-file.ts');
        writeFileSync(targetFile, 'export const x = 1;');
        const cache = new IncrementalCache(tmpDir);
        cache.set(targetFile, 'rule-a', '1.0.0', []);
        const result = cache.get(targetFile, 'rule-a', '1.0.0');
        expect(result).not.toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
