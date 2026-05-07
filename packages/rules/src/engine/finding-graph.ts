import type { Finding, FindingGraph, FindingState } from '../types.js';

/**
 * Mutable implementation of the FindingGraph interface.
 * Stores findings indexed by ruleId and (ruleId, filePath) for efficient lookup.
 */
export class FindingGraphImpl implements FindingGraph {
  private readonly byRule = new Map<string, Finding[]>(); // ruleId → findings
  private readonly byRuleFile = new Map<string, Finding[]>(); // `${ruleId}::${file}` → findings

  /**
   * Add findings to the graph. Empty arrays are a no-op.
   */
  add(findings: Finding[]): void {
    for (const finding of findings) {
      // Index by ruleId
      const byRule = this.byRule.get(finding.ruleId) ?? [];
      byRule.push(finding);
      this.byRule.set(finding.ruleId, byRule);

      // Index by ruleId + file
      const file = finding.evidence.file;
      if (file !== undefined) {
        const key = `${finding.ruleId}::${file}`;
        const byFile = this.byRuleFile.get(key) ?? [];
        byFile.push(finding);
        this.byRuleFile.set(key, byFile);
      }
    }
  }

  /**
   * Returns all findings for a given rule, optionally filtered by file.
   */
  findingsFor(ruleId: string): Finding[];
  findingsFor(ruleId: string, filePath: string): Finding[];
  findingsFor(ruleId: string, filePath?: string): Finding[] {
    if (filePath !== undefined) {
      return this.byRuleFile.get(`${ruleId}::${filePath}`) ?? [];
    }
    return this.byRule.get(ruleId) ?? [];
  }

  /**
   * Returns true if any finding for the given rule matches the provided state.
   */
  hasFinding(ruleId: string, state: FindingState): boolean {
    return (this.byRule.get(ruleId) ?? []).some((f) => f.state === state);
  }

  /**
   * Returns the average confidence across findings for the rule (and optionally file).
   * Returns null when no findings match.
   */
  confidence(ruleId: string, filePath?: string): number | null {
    const findings = this.findingsFor(ruleId, filePath as string);
    if (findings.length === 0) return null;
    const sum = findings.reduce((acc, f) => acc + f.confidence, 0);
    return sum / findings.length;
  }

  /**
   * Returns a read-only view of this graph implementing the FindingGraph interface.
   * The view reflects the live state of the graph.
   */
  readOnly(): FindingGraph {
    return {
      findingsFor: (ruleId: string, filePath?: string) =>
        this.findingsFor(ruleId, filePath as string),
      hasFinding: (ruleId: string, state: FindingState) => this.hasFinding(ruleId, state),
      confidence: (ruleId: string, filePath?: string) => this.confidence(ruleId, filePath),
    };
  }
}
