import { createRuleCoverageGapRule } from '../rules/meta/rule-coverage-gap.js';
import { createReviewTimeAnomalyRule } from '../rules/intelligence/review-time-anomaly.js';
import { conventionMismatch } from '../rules/consistency/convention-mismatch.js';
import { frameworkDrift } from '../rules/drift/framework-drift.js';
import { missingFileReference } from '../rules/integrity/missing-file-reference.js';
import { patternZeroMatch } from '../rules/integrity/pattern-zero-match.js';
import { sectionStaleness, createSectionStalenessRule } from '../rules/staleness/section-staleness.js';
import type { Rule } from '../types.js';
import type { Preset } from '../plugin.js';

// Workspace-scoped open-tier rules (suitable for single-context audit runs)
// NOTE: churn-fragility and blast-radius are file-scoped rules that require per-file
// orchestration (run once per source file with a scoped ctx.file.path). They are
// intentionally excluded from these presets until per-file orchestration is implemented.
// See: https://github.com/your-org/agents-audit/issues/XXX
const ALL_OPEN_RULES: Rule[] = [
  missingFileReference,
  patternZeroMatch,
  frameworkDrift,
  sectionStaleness,
  conventionMismatch,
  createRuleCoverageGapRule(),
];

// preset:default — balanced thresholds, workspace-scoped open-tier rules
export const defaultPreset: Preset = {
  name: 'preset:default',
  description: 'Workspace-scoped open-tier rules with balanced default thresholds. Suitable for most projects.',
  rules: ALL_OPEN_RULES.map((r) => ({ id: r.meta.id })),
};

export function getDefaultRules(): Rule[] {
  return ALL_OPEN_RULES;
}

// preset:strict — tightened thresholds for high-hygiene projects
export const strictPreset: Preset = {
  name: 'preset:strict',
  description: 'Workspace-scoped open-tier rules with tightened thresholds. Suitable for projects with strong hygiene requirements.',
  rules: [
    { id: 'missing-file-reference' },
    { id: 'pattern-zero-match' },
    { id: 'framework-drift' },
    { id: 'section-staleness', config: { stalenessThresholdDays: 30 } },  // tightened: 30 days (default 60)
    { id: 'convention-mismatch' },
    // NOTE: churn-fragility and blast-radius require per-file orchestration (not yet implemented)
    { id: 'rule-coverage-gap' },
  ],
};

export function getStrictRules(): Rule[] {
  return [
    missingFileReference,
    patternZeroMatch,
    frameworkDrift,
    createSectionStalenessRule({ stalenessThresholdDays: 30 }),  // tightened: 30 days (preset:strict)
    conventionMismatch,
    // NOTE: churn-fragility and blast-radius require per-file orchestration (not yet implemented)
    createRuleCoverageGapRule(),
  ];
}

// preset:ci — only cheap rules for fast CI feedback loops
const CI_RULE_IDS = new Set(['missing-file-reference', 'pattern-zero-match', 'framework-drift']);

export const ciPreset: Preset = {
  name: 'preset:ci',
  description: 'Only cheap rules for fast CI pipelines. Focuses on integrity and drift detection.',
  rules: [
    { id: 'missing-file-reference' },
    { id: 'pattern-zero-match' },
    { id: 'framework-drift' },
  ],
};

export function getCiRules(): Rule[] {
  return ALL_OPEN_RULES.filter((r) => CI_RULE_IDS.has(r.meta.id));
}

export const presets = {
  default: defaultPreset,
  strict: strictPreset,
  ci: ciPreset,
} as const;

export type PresetName = keyof typeof presets;
