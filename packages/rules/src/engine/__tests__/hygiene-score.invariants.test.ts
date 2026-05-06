import { describe, expect, it } from 'vitest';
import { computeHygieneScore } from '../rule-engine.js';

describe('HygieneScore invariants', () => {
  it('clean repo scores 100', () => {
    const score = computeHygieneScore([]);
    expect(score.value).toBe(100);
    expect(score.grade).toBe('A');
  });

  it('score is always between 0 and 100', () => {
    for (let errors = 0; errors <= 20; errors += 1) {
      for (let warnings = 0; warnings <= 100; warnings += 10) {
        const findings = [
          ...Array.from({ length: errors }, () => ({ severity: 'error' as const })),
          ...Array.from({ length: warnings }, () => ({ severity: 'warning' as const })),
        ];
        const score = computeHygieneScore(findings as never[]);
        expect(score.value).toBeGreaterThanOrEqual(0);
        expect(score.value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('any error caps score at 70', () => {
    const score = computeHygieneScore([
      { severity: 'error', ruleId: 'test', message: 'test', evidence: {} },
    ]);
    expect(score.value).toBeLessThanOrEqual(70);
  });

  it('grade boundaries are correct', () => {
    expect(computeHygieneScore([]).grade).toBe('A');

    const score85 = computeHygieneScore(
      Array(7).fill({ severity: 'warning', ruleId: 'test', message: 'test', evidence: {} }),
    );
    expect(['A', 'B']).toContain(score85.grade);
  });

  it('is deterministic - same input always same output', () => {
    const findings = [
      { severity: 'error' as const, ruleId: 'test', message: 'test', evidence: {} },
      { severity: 'warning' as const, ruleId: 'test', message: 'test', evidence: {} },
    ];
    const score1 = computeHygieneScore(findings);
    const score2 = computeHygieneScore(findings);
    expect(score1.value).toBe(score2.value);
    expect(score1.grade).toBe(score2.grade);
  });

  it('counts are accurate', () => {
    const findings = [
      { severity: 'error' as const, ruleId: 'test', message: 'test', evidence: {} },
      { severity: 'error' as const, ruleId: 'test', message: 'test', evidence: {} },
      { severity: 'warning' as const, ruleId: 'test', message: 'test', evidence: {} },
      { severity: 'info' as const, ruleId: 'test', message: 'test', evidence: {} },
    ];
    const score = computeHygieneScore(findings);
    expect(score.errorCount).toBe(2);
    expect(score.warningCount).toBe(1);
    expect(score.infoCount).toBe(1);
  });

  it('more errors = lower or equal score', () => {
    const oneError = computeHygieneScore([
      { severity: 'error' as const, ruleId: 'test', message: 'test', evidence: {} },
    ]);
    const twoErrors = computeHygieneScore([
      { severity: 'error' as const, ruleId: 'test', message: 'test', evidence: {} },
      { severity: 'error' as const, ruleId: 'test', message: 'test', evidence: {} },
    ]);
    expect(twoErrors.value).toBeLessThanOrEqual(oneError.value);
  });
});
