import { createBlastRadiusRule } from '../rules/fragility/blast-radius.js';
import { createChurnFragilityRule } from '../rules/fragility/churn-fragility.js';
import { createRuleCoverageGapRule } from '../rules/meta/rule-coverage-gap.js';
import { createReviewTimeAnomalyRule } from '../rules/intelligence/review-time-anomaly.js';
import { conventionMismatch } from '../rules/consistency/convention-mismatch.js';
import { frameworkDrift } from '../rules/drift/framework-drift.js';
import { missingFileReference } from '../rules/integrity/missing-file-reference.js';
import { patternZeroMatch } from '../rules/integrity/pattern-zero-match.js';
import { sectionStaleness, createSectionStalenessRule } from '../rules/staleness/section-staleness.js';
import type { Rule } from '../types.js';
import type { Preset } from '../plugin.js';

// All 8 open-tier rules (review-time-anomaly is pro-tier — excluded from open presets)
const ALL_OPEN_RULES: Rule[] = [
  missingFileReference,
  patternZeroMatch,
  frameworkDrift,
  sectionStaleness,
  conventionMismatch,
  createChurnFragilityRule(),           // balanced defaults: churnThreshold=0.7, warnThreshold=0.5
  createBlastRadiusRule(),              // balanced defaults: minImporters=5
  createRuleCoverageGapRule(),
];

// preset:default — balanced thresholds, all 8 open-tier rules
export const defaultPreset: Preset = {
  name: 'preset:default',
  description: 'All open-tier rules with balanced default thresholds. Suitable for most projects.',
  rules: ALL_OPEN_RULES.map((r) => ({ id: r.meta.id })),
};

export function getDefaultRules(): Rule[] {
  return ALL_OPEN_RULES;
}

// preset:strict — tightened thresholds for high-hygiene projects
export const strictPreset: Preset = {
  name: 'preset:strict',
  description: 'All open-tier rules with tightened thresholds. Suitable for projects with strong hygiene requirements.',
  rules: [
    { id: 'missing-file-reference' },
    { id: 'pattern-zero-match' },
    { id: 'framework-drift' },
    { id: 'section-staleness', config: { stalenessThresholdDays: 30 } },  // tightened: 30 days (default 60)
    { id: 'convention-mismatch' },
    { id: 'churn-fragility', config: { churnThreshold: 0.5, warnThreshold: 0.3 } }, // tightened
    { id: 'blast-radius', config: { minImporters: 3 } },  // tightened: 3 importers (default 5)
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
    createChurnFragilityRule({ churnThreshold: 0.5, warnThreshold: 0.3 }),
    createBlastRadiusRule({ minImporters: 3 }),
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
