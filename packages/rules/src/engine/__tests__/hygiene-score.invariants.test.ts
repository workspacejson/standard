import { describe, expect, it } from 'vitest';
import { computeHygieneScore } from '../hygiene-score.js';
import type { Finding, FindingState, Severity } from '../../types.js';

// ── Helper ───────────────────────────────────────────────────────────────────

function makeFinding(state: FindingState, severity?: Severity): Finding {
  return {
    ruleId: 'test',
    ruleVersion: '1.0.0',
    state,
    confidence: 1,
    signals: [],
    temporalWeight: 1,
    evidence: {},
    message: 'test',
    firedAt: new Date(),
    ...(severity !== undefined ? { severity } : {}),
  };
}

// ── Invariants ────────────────────────────────────────────────────────────────

// A scan that observed nothing has no score. These are the assertions that used
// to run the other way: `computeHygieneScore([])` returned `{ value: 100,
// grade: 'A' }`, and a test named "clean repo scores 100" pinned it there. An
// empty findings array is not a clean repository — it is an absence of
// evidence, and the two were indistinguishable in the return value.
describe('HygieneScore — absence is not a pass', () => {
  it('returns null when nothing was observed and no denominator was given', () => {
    expect(computeHygieneScore([])).toBeNull();
  });

  it('returns null for the exact input that certified an empty scan', () => {
    // The defect as traced in the removal record: no findings, no files.
    expect(computeHygieneScore([], 0)).toBeNull();
  });

  it('scores a repository that was scanned and found clean', () => {
    // No findings, but a known denominator — something WAS examined, so a score
    // is defensible here in a way it is not above.
    const score = computeHygieneScore([], 100);
    expect(score).not.toBeNull();
    expect(score!.value).toBe(100);
    expect(score!.grade).toBe('A');
    expect(score!.coverageRatio).toBe(0);
  });

  it('reports unmeasured coverage as undefined, not as zero', () => {
    const score = computeHygieneScore([makeFinding('WARN', 'warning')]);
    expect(score).not.toBeNull();
    expect(score!.coverageRatio).toBeUndefined();
  });
});

describe('HygieneScore invariants', () => {
  it('score is always between 0 and 100', () => {
    for (let fails = 0; fails <= 20; fails += 1) {
      for (let warns = 0; warns <= 100; warns += 10) {
        const findings = [
          ...Array.from({ length: fails }, () => makeFinding('FAIL', 'error')),
          ...Array.from({ length: warns }, () => makeFinding('WARN', 'warning')),
        ];
        // The empty corner is covered above and has no score by construction.
        if (findings.length === 0) continue;
        const score = computeHygieneScore(findings);
        expect(score).not.toBeNull();
        expect(score!.value).toBeGreaterThanOrEqual(0);
        expect(score!.value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('any error caps score at 70', () => {
    const score = computeHygieneScore([makeFinding('FAIL', 'error')]);
    expect(score!.value).toBeLessThanOrEqual(70);
  });

  it('grade boundaries are correct', () => {
    // 5 WARN findings: penalty = 5 * 3 = 15, score = 85, grade B
    const score85 = computeHygieneScore(
      Array.from({ length: 5 }, () => makeFinding('WARN', 'warning')),
    );
    expect(['A', 'B']).toContain(score85!.grade);
  });

  it('is deterministic - same input always same output', () => {
    const findings = [makeFinding('FAIL', 'error'), makeFinding('WARN', 'warning')];
    const score1 = computeHygieneScore(findings);
    const score2 = computeHygieneScore(findings);
    expect(score1!.value).toBe(score2!.value);
    expect(score1!.grade).toBe(score2!.grade);
  });

  it('counts are accurate', () => {
    const findings = [
      makeFinding('FAIL', 'error'),
      makeFinding('FAIL', 'error'),
      makeFinding('WARN', 'warning'),
      makeFinding('WARN', 'info'), // info-severity WARN still increments warnCount
    ];
    const score = computeHygieneScore(findings);
    expect(score!.breakdown.failCount).toBe(2);
    expect(score!.breakdown.warnCount).toBe(2);
    // Verify no legacy flat count fields
    const scoreView = score as unknown as Record<string, unknown>;
    expect(scoreView.errorCount).toBeUndefined();
    expect(scoreView.warningCount).toBeUndefined();
    expect(scoreView.infoCount).toBeUndefined();
  });

  it('more errors = lower or equal score', () => {
    const oneError = computeHygieneScore([makeFinding('FAIL', 'error')]);
    const twoErrors = computeHygieneScore([
      makeFinding('FAIL', 'error'),
      makeFinding('FAIL', 'error'),
    ]);
    expect(twoErrors!.value).toBeLessThanOrEqual(oneError!.value);
  });

  it('critical FAIL caps score at 50', () => {
    const score = computeHygieneScore([makeFinding('FAIL', 'critical')]);
    expect(score!.value).toBeLessThanOrEqual(50);
  });

  it('breakdown tracks all five states', () => {
    const findings = [
      makeFinding('FAIL', 'error'),
      makeFinding('WARN', 'warning'),
      makeFinding('INSUFFICIENT_DATA'),
      makeFinding('SKIP'),
      makeFinding('PREVIEW'),
    ];
    const score = computeHygieneScore(findings);
    expect(score!.breakdown.failCount).toBe(1);
    expect(score!.breakdown.warnCount).toBe(1);
    expect(score!.breakdown.insufficientDataCount).toBe(1);
    expect(score!.breakdown.skipCount).toBe(1);
    expect(score!.breakdown.previewCount).toBe(1);
  });

  it('an all-zero breakdown is reachable only over a scanned repository', () => {
    // This assertion used to be made against `computeHygieneScore([])`, which
    // now has no score at all. The empty breakdown is still a real state — it
    // just requires evidence that a scan happened.
    const score = computeHygieneScore([], 100);
    expect(score!.breakdown).toEqual({
      failCount: 0,
      warnCount: 0,
      insufficientDataCount: 0,
      skipCount: 0,
      previewCount: 0,
    });
    expect(score!.coverageRatio).toBe(0);
  });
});
