import type { Finding, HygieneScore } from '../types.js';

const SEVERITY_WEIGHTS = {
  critical: 15,
  error: 10,
  warning: 5,
  info: 2,
} as const;

export function computeHygieneScore(
  findings: Finding[],
  totalRepoFiles = 0,
): HygieneScore {
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

  // Coverage ratio: unique files appearing in evidence / total repo files
  const coveredFiles = new Set(
    findings.filter((f) => f.evidence.file).map((f) => f.evidence.file!),
  );
  const coverageRatio =
    totalRepoFiles > 0 ? coveredFiles.size / totalRepoFiles : 0;

  return { value, grade, breakdown, coverageRatio };
}
