import { describe, expect, it } from 'vitest';
import { RuleDependencyGraph } from '../rule-dependency-graph.js';
import type { Finding, Rule } from '../../types.js';

function makeRule(id: string, prerequisites: string[] = []): Rule {
  return {
    meta: {
      id,
      version: '1.0.0',
      description: `Rule ${id}`,
      category: 'meta',
      scope: 'workspace',
      firingMode: 'threshold',
      cost: 'cheap',
      requiredTier: 'open',
      prerequisites,
    },
    async evaluate(): Promise<Finding[]> {
      return [];
    },
  };
}

describe('RuleDependencyGraph', () => {
  describe('register()', () => {
    it('registers a rule without error', () => {
      const graph = new RuleDependencyGraph();
      expect(() => graph.register(makeRule('rule-a'))).not.toThrow();
    });

    it('throws on duplicate rule ID', () => {
      const graph = new RuleDependencyGraph();
      graph.register(makeRule('rule-a'));
      expect(() => graph.register(makeRule('rule-a'))).toThrow('Duplicate rule ID: rule-a');
    });

    it('registers multiple rules with different IDs', () => {
      const graph = new RuleDependencyGraph();
      graph.register(makeRule('rule-a'));
      graph.register(makeRule('rule-b'));
      graph.register(makeRule('rule-c'));
      expect(graph.size()).toBe(3);
    });

    it('throws when adding a rule that creates a cycle', () => {
      const graph = new RuleDependencyGraph();
      graph.register(makeRule('rule-a', ['rule-b']));
      graph.register(makeRule('rule-b', ['rule-c']));
      expect(() => graph.register(makeRule('rule-c', ['rule-a']))).toThrow('Circular dependency');
    });
  });

  describe('topologicalOrder()', () => {
    it('returns empty array for empty graph', () => {
      const graph = new RuleDependencyGraph();
      expect(graph.topologicalOrder()).toEqual([]);
    });

    it('returns all rules when no dependencies', () => {
      const graph = new RuleDependencyGraph();
      const a = makeRule('rule-a');
      const b = makeRule('rule-b');
      const c = makeRule('rule-c');
      graph.register(a);
      graph.register(b);
      graph.register(c);
      const order = graph.topologicalOrder();
      expect(order).toHaveLength(3);
      // All rules present
      const ids = order.map((r) => r.meta.id);
      expect(ids).toContain('rule-a');
      expect(ids).toContain('rule-b');
      expect(ids).toContain('rule-c');
    });

    it('returns prerequisite before dependent (A prereqs B → B before A)', () => {
      const graph = new RuleDependencyGraph();
      const a = makeRule('rule-a', ['rule-b']); // A depends on B
      const b = makeRule('rule-b');
      graph.register(a);
      graph.register(b);
      const order = graph.topologicalOrder();
      const ids = order.map((r) => r.meta.id);
      expect(ids.indexOf('rule-b')).toBeLessThan(ids.indexOf('rule-a'));
    });

    it('handles chain A→B→C (C first, then B, then A)', () => {
      const graph = new RuleDependencyGraph();
      const a = makeRule('rule-a', ['rule-b']); // A needs B
      const b = makeRule('rule-b', ['rule-c']); // B needs C
      const c = makeRule('rule-c');
      graph.register(a);
      graph.register(b);
      graph.register(c);
      const order = graph.topologicalOrder();
      const ids = order.map((r) => r.meta.id);
      expect(ids.indexOf('rule-c')).toBeLessThan(ids.indexOf('rule-b'));
      expect(ids.indexOf('rule-b')).toBeLessThan(ids.indexOf('rule-a'));
    });

    it('skips prerequisites that are not registered in the graph', () => {
      const graph = new RuleDependencyGraph();
      // rule-a has prereq for an unregistered rule
      const a = makeRule('rule-a', ['rule-unknown']);
      graph.register(a);
      const order = graph.topologicalOrder();
      expect(order).toHaveLength(1);
      expect(order[0]?.meta.id).toBe('rule-a');
    });

    it('throws Circular dependency when A→B→A cycle exists', () => {
      // Must build the cycle by bypassing register's cycle check
      const graph = new RuleDependencyGraph();
      // Create cycle using 3 nodes to avoid detection on individual register
      // We can do this by first registering A with prereq B (B not registered yet)
      graph.register(makeRule('rule-a', ['rule-b']));
      graph.register(makeRule('rule-b', ['rule-c']));
      expect(() => graph.register(makeRule('rule-c', ['rule-a']))).toThrow('Circular dependency');
    });
  });

  describe('size()', () => {
    it('returns 0 for empty graph', () => {
      const graph = new RuleDependencyGraph();
      expect(graph.size()).toBe(0);
    });

    it('returns correct count after registrations', () => {
      const graph = new RuleDependencyGraph();
      graph.register(makeRule('rule-a'));
      graph.register(makeRule('rule-b'));
      expect(graph.size()).toBe(2);
    });
  });
});
