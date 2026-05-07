import type { Rule } from '../types.js';

/**
 * Tracks rule registration and computes execution order based on prerequisites.
 * Uses Kahn's algorithm for topological sorting with cycle detection.
 */
export class RuleDependencyGraph {
  private readonly rules = new Map<string, Rule>();
  private readonly edges = new Map<string, string[]>(); // ruleId → prerequisite ids

  /**
   * Register a rule with the graph.
   * @throws {Error} if a rule with the same ID has already been registered.
   * @throws {Error} if registration would create a circular dependency.
   */
  register(rule: Rule): void {
    if (this.rules.has(rule.meta.id)) {
      throw new Error(`Duplicate rule ID: ${rule.meta.id}`);
    }
    this.rules.set(rule.meta.id, rule);
    this.edges.set(rule.meta.id, rule.meta.prerequisites ?? []);

    // Validate no cycles introduced by this registration
    this.validateNoCycles();
  }

  /**
   * Returns all registered rules in topological order (prerequisites first).
   * @throws {Error} containing 'Circular dependency' if the graph has cycles.
   */
  topologicalOrder(): Rule[] {
    if (this.rules.size === 0) return [];

    // Kahn's algorithm:
    // Build in-degree map and out-edges map where prereqs point to their dependents.
    // in-degree[id] = number of prerequisites id has that ARE registered in the graph.
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>(); // prereqId → [ids that need it]

    for (const id of this.rules.keys()) {
      inDegree.set(id, 0);
      outEdges.set(id, []);
    }

    for (const [id, prereqs] of this.edges) {
      for (const prereq of prereqs) {
        if (!this.rules.has(prereq)) continue; // skip unregistered prereqs
        outEdges.get(prereq)!.push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }

    // Start with rules that have no registered prerequisites
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const ordered: Rule[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      ordered.push(this.rules.get(id)!);
      for (const dependent of (outEdges.get(id) ?? [])) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (ordered.length !== this.rules.size) {
      throw new Error('Circular dependency detected in rule graph');
    }

    return ordered;
  }

  /**
   * Returns the number of registered rules.
   */
  size(): number {
    return this.rules.size;
  }

  private validateNoCycles(): void {
    // topologicalOrder() throws 'Circular dependency detected' on cycle.
    // We call it here to eagerly validate after each registration.
    this.topologicalOrder();
  }
}
