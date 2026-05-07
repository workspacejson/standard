import { FindingGraphImpl } from './finding-graph.js';
import { RuleDependencyGraph } from './rule-dependency-graph.js';
import { computeTemporalWeight } from './temporal-decay.js';
import type { Finding, Rule, RuleContext } from '../types.js';

export interface EngineResult {
  findings: Finding[];
  skipped: Array<{ ruleId: string; reason: string }>;
  previewed: Array<{ ruleId: string; message: string }>;
  durationMs: number;
}

export class RuleEngine {
  private readonly rdg = new RuleDependencyGraph();

  register(rule: Rule): void {
    this.rdg.register(rule); // throws on duplicate
  }

  async run(ctx: RuleContext): Promise<EngineResult> {
    const start = Date.now();
    const findingGraph = new FindingGraphImpl();
    const allFindings: Finding[] = [];
    const skipped: EngineResult['skipped'] = [];
    const previewed: EngineResult['previewed'] = [];

    let orderedRules: Rule[];
    try {
      orderedRules = this.rdg.topologicalOrder();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        findings: [],
        skipped: [{ ruleId: '__graph__', reason }],
        previewed: [],
        durationMs: Date.now() - start,
      };
    }

    for (const rule of orderedRules) {
      // PREVIEW: rule requires non-open tier and vreko is absent
      if (rule.meta.requiredTier !== 'open' && !ctx.vreko) {
        const message = rule.meta.previewMessage
          ? rule.meta.previewMessage(ctx)
          : `Rule "${rule.meta.id}" requires ${rule.meta.requiredTier} tier`;
        previewed.push({ ruleId: rule.meta.id, message });

        const previewFinding: Finding = {
          ruleId: rule.meta.id,
          ruleVersion: rule.meta.version,
          state: 'PREVIEW',
          confidence: 1,
          signals: [],
          temporalWeight: 1,
          evidence: {},
          message,
          firedAt: new Date(),
        };
        allFindings.push(previewFinding);
        findingGraph.add([previewFinding]);
        continue;
      }

      // SKIP: prerequisite rules did not PASS or WARN
      if (rule.meta.prerequisites && rule.meta.prerequisites.length > 0) {
        const prereqsMet = rule.meta.prerequisites.every(
          (prereqId) =>
            findingGraph.hasFinding(prereqId, 'PASS') ||
            findingGraph.hasFinding(prereqId, 'WARN'),
        );
        if (!prereqsMet) {
          const reason = `Prerequisites not met: ${rule.meta.prerequisites.join(', ')}`;
          skipped.push({ ruleId: rule.meta.id, reason });
          const skipFinding: Finding = {
            ruleId: rule.meta.id,
            ruleVersion: rule.meta.version,
            state: 'SKIP',
            confidence: 0,
            signals: [],
            temporalWeight: 0,
            evidence: {},
            message: reason,
            firedAt: new Date(),
          };
          allFindings.push(skipFinding);
          findingGraph.add([skipFinding]);
          continue;
        }
      }

      // TIMEOUT: wrap evaluate() in a race
      const timeoutMs =
        rule.meta.timeoutMs ?? (rule.meta.cost === 'expensive' ? 5000 : 1000);

      let timerId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<Finding[]>((_, reject) => {
        timerId = setTimeout(
          () =>
            reject(
              new Error(`Rule "${rule.meta.id}" timed out after ${timeoutMs}ms`),
            ),
          timeoutMs,
        );
      });

      let rawFindings: Finding[];
      try {
        const result = await Promise.race([
          Promise.resolve(rule.evaluate(ctx)).then((r) =>
            Array.isArray(r) ? r : [r],
          ),
          timeoutPromise,
        ]);
        clearTimeout(timerId);
        rawFindings = result;
      } catch (err) {
        clearTimeout(timerId);
        const reason = err instanceof Error ? err.message : String(err);
        skipped.push({ ruleId: rule.meta.id, reason });
        const skipFinding: Finding = {
          ruleId: rule.meta.id,
          ruleVersion: rule.meta.version,
          state: 'SKIP',
          confidence: 0,
          signals: [],
          temporalWeight: 0,
          evidence: {},
          message: reason,
          firedAt: new Date(),
        };
        allFindings.push(skipFinding);
        findingGraph.add([skipFinding]);
        continue;
      }

      // Apply temporal decay to each finding
      const decayed = rawFindings.map((f) => ({
        ...f,
        temporalWeight: computeTemporalWeight(
          f.firedAt,
          rule.meta.decayConstant ?? 0.01,
        ),
      }));

      allFindings.push(...decayed);
      findingGraph.add(decayed);
    }

    return {
      findings: allFindings,
      skipped,
      previewed,
      durationMs: Date.now() - start,
    };
  }
}
