import type { Finding, HygieneScore } from '../types.js';

const SEVERITY_WEIGHTS = {
  critical: 15,
  error: 10,
  warning: 5,
  info: 2,
} as const;

/**
 * Compute a hygiene score from rule findings.
 *
 * @deprecated Scheduled for removal at the next document-profile boundary, per
 * ADR-003 amendment A-002. A letter grade is a judgement, and this standard is
 * descriptive: it reports what a repository *is*, not what a team must do about
 * it. Scoring belongs to the consumer that reads the descriptive fields.
 *
 * To migrate, read the findings directly and apply your own weighting. Every
 * input this function uses is already public — `Finding.state`, `.severity`,
 * `.confidence` and `.temporalWeight` — so nothing is lost by moving the
 * judgement to the side that owns it:
 *
 * ```ts
 * const failures = findings.filter((f) => f.state === 'FAIL');
 * const critical = failures.filter((f) => f.severity === 'critical');
 * ```
 *
 * Returns `null` when the scan observed nothing, rather than a perfect score
 * over an empty observation. See the note on the return type below.
 */
export function computeHygieneScore(
  findings: Finding[],
  totalRepoFiles?: number,
): HygieneScore | null {
  // A score asserted over an empty observation is a fabrication, not a pass.
  // With no findings AND no known denominator, this function has been handed no
  // evidence that anything was examined at all — the previous behavior returned
  // `{ value: 100, grade: 'A' }` for exactly that input, which is how a scan
  // that looked at nothing came to certify a repository as flawless in a
  // published artifact.
  //
  // Absence is reported as absence. `null` is not a bad score; it is the
  // statement that there is no score to give, and a caller has to decide what
  // to do about that rather than inherit an 'A'.
  const observedNothing = findings.length === 0 && (totalRepoFiles === undefined || totalRepoFiles === 0);
  if (observedNothing) return null;

  const breakdown = {
    failCount: 0,
    warnCount: 0,
    insufficientDataCount: 0,
    skipCount: 0,
    previewCount: 0,
  };

  let totalPenalty = 0;
  let hasCriticalFail = false;
  let hasAnyFail = false;

  for (const f of findings) {
    switch (f.state) {
      case 'FAIL':
        breakdown.failCount++;
        hasAnyFail = true;
        if (f.severity === 'critical') hasCriticalFail = true;
        totalPenalty += (SEVERITY_WEIGHTS[f.severity ?? 'error'] ?? SEVERITY_WEIGHTS.error) * f.confidence * f.temporalWeight;
        break;
      case 'WARN':
        breakdown.warnCount++;
        totalPenalty += 3 * f.confidence * f.temporalWeight;
        break;
      case 'INSUFFICIENT_DATA':
        breakdown.insufficientDataCount++;
        break;
      case 'SKIP':
        breakdown.skipCount++;
        break;
      case 'PREVIEW':
        breakdown.previewCount++;
        break;
    }
  }

  // Normalize: assume 100 penalty points = 0 score
  let value = Math.max(0, Math.round(100 - totalPenalty));

  // Apply floors
  if (hasCriticalFail) value = Math.min(value, 50);
  else if (hasAnyFail) value = Math.min(value, 70);

  value = Math.max(0, Math.min(100, value));

  const grade =
    value >= 95 ? 'A' : value >= 80 ? 'B' : value >= 65 ? 'C' : value >= 50 ? 'D' : 'F';

  // Coverage ratio: unique files appearing in evidence / total repo files.
  //
  // `undefined` when no denominator was supplied, because "we did not measure
  // coverage" and "coverage was zero" are different claims and the previous
  // code reported both as `0`. Every current caller omits the argument, so that
  // zero was never a measurement — it was the default arriving unchanged.
  const coveredFiles = new Set(
    findings.filter((f) => f.evidence.file).map((f) => f.evidence.file!),
  );
  // Left `undefined` unless a denominator was actually supplied. Written as a
  // guard rather than a nested conditional so that the three states — not
  // measured, measured as zero, measured as a ratio — are each visible on their
  // own line.
  let coverageRatio: number | undefined;
  if (totalRepoFiles !== undefined) {
    coverageRatio = totalRepoFiles > 0 ? coveredFiles.size / totalRepoFiles : 0;
  }

  return { value, grade, breakdown, coverageRatio };
}
