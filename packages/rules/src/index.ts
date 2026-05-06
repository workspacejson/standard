export { RuleEngine, computeHygieneScore } from './engine/rule-engine.js';
export { AgentsMdParser } from './parser/agents-md-parser.js';
export { RepoScanner } from './scanner/repo-scanner.js';
export { WorkspaceJsonValidator } from './validator/workspace-json-validator.js';
export { missingFileReference } from './rules/integrity/missing-file-reference.js';
export { patternZeroMatch } from './rules/integrity/pattern-zero-match.js';
export { frameworkDrift } from './rules/drift/framework-drift.js';
export { sectionStaleness } from './rules/staleness/section-staleness.js';
export { conventionMismatch } from './rules/consistency/convention-mismatch.js';
export type {
  AuditConfig,
  AuditResult,
  ConventionEntry,
  Finding,
  GitHistory,
  HygieneScore,
  ManifestInfo,
  PackageInfo,
  ParsedAgentsMd,
  PatternEntry,
  RepoState,
  Rule,
  RuleCategory,
  RuleContext,
  Severity,
} from './types.js';
