import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  let tmpDir: string;
  let targetFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
    targetFile = join(tmpDir, 'test-file.ts');
    writeFileSync(targetFile, 'export const x = 1;');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('get()', () => {
    it('returns null on cache miss (no entry exists)', () => {
      const cache = new IncrementalCache(tmpDir);
      const result = cache.get(targetFile, 'rule-a', '1.0.0');
      expect(result).toBeNull();
    });

    it('returns null for a different rule version (cache invalidation)', () => {
      const cache = new IncrementalCache(tmpDir);
      const findings = [makeFinding('rule-a')];
      cache.set(targetFile, 'rule-a', '1.0.0', findings);
      // Now retrieve with different version
      const result = cache.get(targetFile, 'rule-a', '2.0.0');
      expect(result).toBeNull();
    });

    it('returns null when file content changes after set()', () => {
      const cache = new IncrementalCache(tmpDir);
      const findings = [makeFinding('rule-a')];
      cache.set(targetFile, 'rule-a', '1.0.0', findings);
      // Modify the file
      writeFileSync(targetFile, 'export const x = 2; // modified');
      const result = cache.get(targetFile, 'rule-a', '1.0.0');
      expect(result).toBeNull();
    });

    it('returns null for missing files gracefully', () => {
      const cache = new IncrementalCache(tmpDir);
      const result = cache.get('/nonexistent/file.ts', 'rule-a', '1.0.0');
      expect(result).toBeNull();
    });
  });

  describe('set() + get()', () => {
    it('returns stored findings on cache hit', () => {
      const cache = new IncrementalCache(tmpDir);
      const findings = [makeFinding('rule-a')];
      cache.set(targetFile, 'rule-a', '1.0.0', findings);
      const result = cache.get(targetFile, 'rule-a', '1.0.0');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]?.ruleId).toBe('rule-a');
    });

    it('stores and retrieves empty findings array', () => {
      const cache = new IncrementalCache(tmpDir);
      cache.set(targetFile, 'rule-a', '1.0.0', []);
      const result = cache.get(targetFile, 'rule-a', '1.0.0');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(0);
    });

    it('stores multiple findings correctly', () => {
      const cache = new IncrementalCache(tmpDir);
      const findings = [makeFinding('rule-a'), makeFinding('rule-a')];
      cache.set(targetFile, 'rule-a', '1.0.0', findings);
      const result = cache.get(targetFile, 'rule-a', '1.0.0');
      expect(result).toHaveLength(2);
    });

    it('different rule IDs have independent cache entries', () => {
      const cache = new IncrementalCache(tmpDir);
      cache.set(targetFile, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
      cache.set(targetFile, 'rule-b', '1.0.0', []);

      const resultA = cache.get(targetFile, 'rule-a', '1.0.0');
      const resultB = cache.get(targetFile, 'rule-b', '1.0.0');
      expect(resultA).toHaveLength(1);
      expect(resultB).toHaveLength(0);
    });

    it('different file paths have independent cache entries', () => {
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
    });
  });

  describe('cache directory creation', () => {
    it('creates cache directory automatically on set()', () => {
      const nestedDir = join(tmpDir, 'nested', 'repo');
      // nestedDir doesn't exist — cache should create .agentsaudit-cache inside it
      // We use the parent tmpDir as the "repo root" for the cache
      const cache = new IncrementalCache(tmpDir);
      cache.set(targetFile, 'rule-a', '1.0.0', []);
      const result = cache.get(targetFile, 'rule-a', '1.0.0');
      expect(result).not.toBeNull();
    });
  });
});
