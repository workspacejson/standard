import type { ConfidenceSignal } from '../types.js';

const MS_PER_DAY = 86_400_000;

/**
 * Computes exponential temporal weight: w(t) = e^(-λt)
 * where t is the age of the observation in days.
 *
 * Default λ = 0.01 gives a half-life of ≈ 69.3 days.
 *
 * @param observedAt - When the observation was made
 * @param decayConstant - λ (default 0.01)
 * @returns Weight in [0, 1]
 */
export function computeTemporalWeight(observedAt: Date, decayConstant = 0.01): number {
  const ageMs = Date.now() - observedAt.getTime();
  // Clamp negative age (future dates) to 0 so weight = e^0 = 1
  const ageDays = Math.max(0, ageMs / MS_PER_DAY);
  return Math.exp(-decayConstant * ageDays);
}

/**
 * Computes weighted confidence from a set of signals, applying temporal decay
 * to each signal's weight.
 *
 * Formula: Σ(w_i * decay_i * v_i) / Σ(w_i * decay_i)
 *
 * Returns 0 for empty signal arrays or when all effective weights are zero.
 *
 * @param signals - Array of confidence signals
 * @param decayConstant - λ for temporal decay (default 0.01)
 * @returns Weighted confidence in [0, 1]
 */
export function weightedConfidence(signals: ConfidenceSignal[], decayConstant = 0.01): number {
  if (signals.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const decay = computeTemporalWeight(signal.observedAt, decayConstant);
    const effectiveWeight = signal.weight * decay;
    weightedSum += effectiveWeight * signal.value;
    totalWeight += effectiveWeight;
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}
