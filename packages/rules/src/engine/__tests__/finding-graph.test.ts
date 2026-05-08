import { describe, expect, it } from 'vitest';
import { FindingGraphImpl } from '../finding-graph.js';
import type { Finding } from '../../types.js';

function makeFinding(ruleId: string, state: Finding['state'] = 'FAIL', file?: string): Finding {
  return {
    ruleId,
    ruleVersion: '1.0.0',
    state,
    confidence: 0.9,
    signals: [],
    temporalWeight: 1.0,
    message: `Finding for ${ruleId}`,
    firedAt: new Date(),
    ...(state === 'FAIL' ? { severity: 'error' as const } : {}),
    ...(file !== undefined ? { evidence: { file } } : { evidence: {} }),
  };
}

describe('FindingGraphImpl', () => {
  describe('add()', () => {
    it('handles empty array as no-op', () => {
      const graph = new FindingGraphImpl();
      expect(() => graph.add([])).not.toThrow();
    });

    it('stores findings and allows retrieval', () => {
      const graph = new FindingGraphImpl();
      const finding = makeFinding('rule-a', 'FAIL');
      graph.add([finding]);
      const results = graph.findingsFor('rule-a');
      expect(results).toHaveLength(1);
      expect(results[0]?.ruleId).toBe('rule-a');
    });

    it('accumulates multiple findings for same rule', () => {
      const graph = new FindingGraphImpl();
      graph.add([makeFinding('rule-a', 'FAIL'), makeFinding('rule-a', 'WARN')]);
      expect(graph.findingsFor('rule-a')).toHaveLength(2);
    });
  });

  describe('findingsFor(ruleId)', () => {
    it('returns empty array for nonexistent rule', () => {
      const graph = new FindingGraphImpl();
      expect(graph.findingsFor('nonexistent')).toEqual([]);
    });

    it('returns only findings for the specified rule', () => {
      const graph = new FindingGraphImpl();
      graph.add([makeFinding('rule-a', 'FAIL'), makeFinding('rule-b', 'PASS')]);
      expect(graph.findingsFor('rule-a')).toHaveLength(1);
      expect(graph.findingsFor('rule-b')).toHaveLength(1);
    });
  });

  describe('findingsFor(ruleId, filePath)', () => {
    it('returns empty array when no findings for that file', () => {
      const graph = new FindingGraphImpl();
      graph.add([makeFinding('rule-a', 'FAIL', 'src/foo.ts')]);
      expect(graph.findingsFor('rule-a', 'src/bar.ts')).toEqual([]);
    });

    it('returns findings filtered by file', () => {
      const graph = new FindingGraphImpl();
      graph.add([
        makeFinding('rule-a', 'FAIL', 'src/foo.ts'),
        makeFinding('rule-a', 'WARN', 'src/bar.ts'),
      ]);
      const fooFindings = graph.findingsFor('rule-a', 'src/foo.ts');
      expect(fooFindings).toHaveLength(1);
      expect(fooFindings[0]?.state).toBe('FAIL');
    });

    it('returns empty array when no file field in finding evidence', () => {
      const graph = new FindingGraphImpl();
      // Finding without file
      graph.add([makeFinding('rule-a', 'FAIL')]);
      expect(graph.findingsFor('rule-a', 'src/foo.ts')).toEqual([]);
    });
  });

  describe('hasFinding()', () => {
    it('returns false when no findings', () => {
      const graph = new FindingGraphImpl();
      expect(graph.hasFinding('rule-a', 'FAIL')).toBe(false);
    });

    it('returns false when FAIL findings exist but checking for PASS', () => {
      const graph = new FindingGraphImpl();
      graph.add([makeFinding('rule-a', 'FAIL')]);
      expect(graph.hasFinding('rule-a', 'PASS')).toBe(false);
    });

    it('returns true when matching state exists', () => {
      const graph = new FindingGraphImpl();
      graph.add([makeFinding('rule-a', 'FAIL')]);
      expect(graph.hasFinding('rule-a', 'FAIL')).toBe(true);
    });

    it('returns false for nonexistent rule', () => {
      const graph = new FindingGraphImpl();
      expect(graph.hasFinding('nonexistent', 'FAIL')).toBe(false);
    });
  });

  describe('confidence()', () => {
    it('returns null when no findings', () => {
      const graph = new FindingGraphImpl();
      expect(graph.confidence('rule-a')).toBeNull();
    });

    it('returns null for nonexistent rule', () => {
      const graph = new FindingGraphImpl();
      expect(graph.confidence('nonexistent')).toBeNull();
    });

    it('returns confidence of single finding', () => {
      const graph = new FindingGraphImpl();
      const f = makeFinding('rule-a', 'FAIL');
      f.confidence = 0.75;
      graph.add([f]);
      expect(graph.confidence('rule-a')).toBe(0.75);
    });

    it('returns average confidence across multiple findings', () => {
      const graph = new FindingGraphImpl();
      const f1 = makeFinding('rule-a', 'FAIL');
      f1.confidence = 0.8;
      const f2 = makeFinding('rule-a', 'WARN');
      f2.confidence = 0.6;
      graph.add([f1, f2]);
      expect(graph.confidence('rule-a')).toBeCloseTo(0.7);
    });

    it('returns null for file-level query when no matching file findings', () => {
      const graph = new FindingGraphImpl();
      graph.add([makeFinding('rule-a', 'FAIL')]);
      expect(graph.confidence('rule-a', 'nonexistent.ts')).toBeNull();
    });
  });

  describe('readOnly()', () => {
    it('returns an object implementing FindingGraph interface', () => {
      const graph = new FindingGraphImpl();
      const f = makeFinding('rule-a', 'FAIL');
      graph.add([f]);
      const ro = graph.readOnly();
      expect(ro.findingsFor('rule-a')).toHaveLength(1);
      expect(ro.hasFinding('rule-a', 'FAIL')).toBe(true);
      expect(ro.confidence('rule-a')).toBe(0.9);
    });

    it('readOnly does not expose add()', () => {
      const graph = new FindingGraphImpl();
      const ro = graph.readOnly();
      const roView = ro as unknown as Record<string, unknown>;
      expect(roView.add).toBeUndefined();
    });

    it('reflects underlying data changes after readOnly() is called', () => {
      const graph = new FindingGraphImpl();
      const ro = graph.readOnly();
      graph.add([makeFinding('rule-a', 'PASS')]);
      // The read-only view should see updates
      expect(ro.findingsFor('rule-a')).toHaveLength(1);
    });
  });
});
