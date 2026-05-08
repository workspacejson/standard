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

function withTempDir(fn: (dir: string) => void): () => void {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'agents-audit-cache-test-'));
    try {
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

describe('IncrementalCache', () => {
  describe('get()', () => {
    it('returns null on cache miss (no entry exists)', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      expect(new IncrementalCache(dir).get(file, 'rule-a', '1.0.0')).toBeNull();
    }));

    it('returns null for a different rule version (cache invalidation)', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      const cache = new IncrementalCache(dir);
      cache.set(file, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
      expect(cache.get(file, 'rule-a', '2.0.0')).toBeNull();
    }));

    it('returns null when file content changes after set()', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      const cache = new IncrementalCache(dir);
      cache.set(file, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
      writeFileSync(file, 'export const x = 2; // modified');
      expect(cache.get(file, 'rule-a', '1.0.0')).toBeNull();
    }));

    it('returns null for missing files gracefully', withTempDir((dir) => {
      expect(new IncrementalCache(dir).get('/nonexistent/file.ts', 'rule-a', '1.0.0')).toBeNull();
    }));
  });

  describe('set() + get()', () => {
    it('returns stored findings on cache hit', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      const cache = new IncrementalCache(dir);
      cache.set(file, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
      const result = cache.get(file, 'rule-a', '1.0.0');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]?.ruleId).toBe('rule-a');
    }));

    it('stores and retrieves empty findings array', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      const cache = new IncrementalCache(dir);
      cache.set(file, 'rule-a', '1.0.0', []);
      const result = cache.get(file, 'rule-a', '1.0.0');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(0);
    }));

    it('stores multiple findings correctly', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      const cache = new IncrementalCache(dir);
      cache.set(file, 'rule-a', '1.0.0', [makeFinding('rule-a'), makeFinding('rule-a')]);
      expect(cache.get(file, 'rule-a', '1.0.0')).toHaveLength(2);
    }));

    it('different rule IDs have independent cache entries', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      const cache = new IncrementalCache(dir);
      cache.set(file, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
      cache.set(file, 'rule-b', '1.0.0', []);
      expect(cache.get(file, 'rule-a', '1.0.0')).toHaveLength(1);
      expect(cache.get(file, 'rule-b', '1.0.0')).toHaveLength(0);
    }));

    it('different file paths have independent cache entries', withTempDir((dir) => {
      const fileA = join(dir, 'file-a.ts');
      const fileB = join(dir, 'file-b.ts');
      writeFileSync(fileA, 'export const a = 1;');
      writeFileSync(fileB, 'export const b = 2;');
      const cache = new IncrementalCache(dir);
      cache.set(fileA, 'rule-a', '1.0.0', [makeFinding('rule-a')]);
      cache.set(fileB, 'rule-a', '1.0.0', []);
      expect(cache.get(fileA, 'rule-a', '1.0.0')).toHaveLength(1);
      expect(cache.get(fileB, 'rule-a', '1.0.0')).toHaveLength(0);
    }));
  });

  describe('cache directory creation', () => {
    it('creates cache directory automatically on set()', withTempDir((dir) => {
      const file = join(dir, 'test-file.ts');
      writeFileSync(file, 'export const x = 1;');
      const cache = new IncrementalCache(dir);
      cache.set(file, 'rule-a', '1.0.0', []);
      expect(cache.get(file, 'rule-a', '1.0.0')).not.toBeNull();
    }));
  });
});
