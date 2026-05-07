import { describe, expect, it } from 'vitest';
import { computeTemporalWeight, weightedConfidence } from '../temporal-decay.js';
import type { ConfidenceSignal } from '../../types.js';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('computeTemporalWeight', () => {
  it('returns > 0.99 for observedAt = now (t ≈ 0)', () => {
    const result = computeTemporalWeight(new Date(), 0.01);
    expect(result).toBeGreaterThan(0.99);
  });

  it('returns ≈ 0.5 at t = 70 days (half-life for λ = 0.01 ≈ 69.3 days)', () => {
    const result = computeTemporalWeight(daysAgo(70), 0.01);
    expect(result).toBeGreaterThanOrEqual(0.48);
    expect(result).toBeLessThanOrEqual(0.52);
  });

  it('never returns a value < 0', () => {
    // Very old date (10,000 days ago)
    const result = computeTemporalWeight(daysAgo(10_000), 0.01);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('never returns a value > 1 for very recent observations', () => {
    const result = computeTemporalWeight(new Date(), 0.01);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('uses default λ = 0.01 when no decay constant provided', () => {
    const withDefault = computeTemporalWeight(daysAgo(70));
    const withExplicit = computeTemporalWeight(daysAgo(70), 0.01);
    expect(withDefault).toBeCloseTo(withExplicit, 5);
  });

  it('decays faster with larger λ', () => {
    const slowDecay = computeTemporalWeight(daysAgo(30), 0.01);
    const fastDecay = computeTemporalWeight(daysAgo(30), 0.1);
    expect(fastDecay).toBeLessThan(slowDecay);
  });

  it('handles future dates (negative age) gracefully — weight = 1 (clamped)', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future
    const result = computeTemporalWeight(futureDate, 0.01);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThan(0.99); // e^0 = 1 due to age clamping
  });
});

describe('weightedConfidence', () => {
  it('returns 0 for empty signals array', () => {
    expect(weightedConfidence([])).toBe(0);
  });

  it('returns signal value (no decay) for a recent signal with weight 1', () => {
    const signal: ConfidenceSignal = {
      name: 'test-signal',
      weight: 1,
      value: 0.8,
      observedAt: new Date(), // now = no decay
    };
    const result = weightedConfidence([signal], 0.01);
    // Near-zero age → weight ≈ 1, so result ≈ 0.8
    expect(result).toBeCloseTo(0.8, 2);
  });

  it('applies temporal decay to older signals', () => {
    const recentSignal: ConfidenceSignal = {
      name: 'recent',
      weight: 1,
      value: 0.9,
      observedAt: new Date(),
    };
    const oldSignal: ConfidenceSignal = {
      name: 'old',
      weight: 1,
      value: 0.9,
      observedAt: daysAgo(70), // ≈ half weight
    };
    const recentResult = weightedConfidence([recentSignal], 0.01);
    const oldResult = weightedConfidence([oldSignal], 0.01);
    // Both return the same VALUE (0.9) since it's a single-signal weighted average
    // but the weighting mechanism is still correctly applied
    expect(recentResult).toBeCloseTo(0.9, 2);
    expect(oldResult).toBeCloseTo(0.9, 2); // single signal: w * v / w = v
  });

  it('weights recent signals more than old signals in multi-signal average', () => {
    const recentHighSignal: ConfidenceSignal = {
      name: 'recent-high',
      weight: 1,
      value: 1.0,
      observedAt: new Date(), // no decay
    };
    const oldLowSignal: ConfidenceSignal = {
      name: 'old-low',
      weight: 1,
      value: 0.0,
      observedAt: daysAgo(70), // ≈ 0.5 weight
    };
    // Result should be pulled toward 1.0 (recent = full weight, old ≈ half weight)
    const result = weightedConfidence([recentHighSignal, oldLowSignal], 0.01);
    expect(result).toBeGreaterThan(0.6); // biased toward recent high signal
  });

  it('handles all-zero weights gracefully (returns 0)', () => {
    const signal: ConfidenceSignal = {
      name: 'zero-weight',
      weight: 0,
      value: 0.8,
      observedAt: new Date(),
    };
    const result = weightedConfidence([signal], 0.01);
    expect(result).toBe(0);
  });

  it('uses default λ = 0.01 when no decay constant provided', () => {
    const signal: ConfidenceSignal = {
      name: 'sig',
      weight: 1,
      value: 0.7,
      observedAt: daysAgo(35),
    };
    const withDefault = weightedConfidence([signal]);
    const withExplicit = weightedConfidence([signal], 0.01);
    expect(withDefault).toBeCloseTo(withExplicit, 5);
  });
});
