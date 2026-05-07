// Engine
export { RuleEngine } from './engine/rule-engine.js';
export type { EngineResult } from './engine/rule-engine.js';
export { computeHygieneScore } from './engine/hygiene-score.js';
export { RuleDependencyGraph } from './engine/rule-dependency-graph.js';
export { FindingGraphImpl } from './engine/finding-graph.js';
export { computeTemporalWeight, weightedConfidence } from './engine/temporal-decay.js';
// NOTE: IncrementalCache is not exported here because it is not yet wired into RuleEngine.
// It is an @internal implementation detail until per-rule caching is fully integrated.
// export { IncrementalCache } from './engine/incremental-cache.js';

// Parsers / Scanners / Validators (unchanged from v0.1)
export { AgentsMdParser } from './parser/agents-md-parser.js';
export { RepoScanner } from './scanner/repo-scanner.js';
export { WorkspaceJsonValidator } from './validator/workspace-json-validator.js';

// Rules — migrated (v0.1 → v0.2)
export { missingFileReference } from './rules/integrity/missing-file-reference.js';
export { patternZeroMatch } from './rules/integrity/pattern-zero-match.js';
export { frameworkDrift } from './rules/drift/framework-drift.js';
export { sectionStaleness, createSectionStalenessRule } from './rules/staleness/section-staleness.js';
export { conventionMismatch } from './rules/consistency/convention-mismatch.js';

// Rules — new in v0.2
export { churnFragility, createChurnFragilityRule } from './rules/fragility/churn-fragility.js';
export { blastRadius, createBlastRadiusRule } from './rules/fragility/blast-radius.js';
export { ruleCoverageGap, createRuleCoverageGapRule } from './rules/meta/rule-coverage-gap.js';
export { reviewTimeAnomaly, createReviewTimeAnomalyRule } from './rules/intelligence/review-time-anomaly.js';

// Presets
export { defaultPreset, strictPreset, ciPreset, presets, getDefaultRules, getStrictRules, getCiRules } from './presets/index.js';
export type { PresetName } from './presets/index.js';

// Plugin API
export type { RulePack, Preset } from './plugin.js';

// Types — all v0.2 public types
export type {
  // Primitive types
  FindingState,
  Severity,
  RuleCategory,
  FiringMode,
  RuleScope,
  RuleCost,
  RequiredTier,
  // Finding types
  ConfidenceSignal,
  Finding,
  // Rule types
  RuleMeta,
  Rule,
  RuleFactory,
  // Graph types
  FindingGraph,
  // Signal types
  Commit,
  GitSignals,
  ManifestMap,
  DetectedAgentFiles,
  DetectedLanguage,
  WorkspaceSignals,
  // Context types
  StaticRuleContext,
  RuleContext,
  // Vreko (interface-only, no implementation)
  VrekoContext,
  SessionSummary,
  SessionBoundary,
  AITool,
  AttributionMap,
  AIActivity,
  VelocityMetric,
  AggregatedTeamSignal,
  StoredPattern,
  // Score + Audit
  HygieneScore,
  AuditResult,
  // Legacy types (kept for backward compat with agents-audit CLI)
  ParsedAgentsMd,
  AgentsMdSection,
  ConventionEntry,
  PatternEntry,
  RepoState,
  PackageInfo,
  ManifestInfo,
  GitHistory,
  AuditConfig,
} from './types.js';
