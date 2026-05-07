import type { WorkspaceJson } from '@workspacejson/spec';

// ─── Section 1: Primitive types ───────────────────────────────────────────────

export type FindingState =
  | 'PASS' | 'FAIL' | 'WARN' | 'INSUFFICIENT_DATA' | 'SKIP' | 'PREVIEW';

export type Severity = 'critical' | 'error' | 'warning' | 'info';

export type RuleCategory =
  | 'fragility' | 'staleness' | 'coupling' | 'convention' | 'meta' | 'intelligence' | 'integrity';

export type FiringMode = 'threshold' | 'trend' | 'projected' | 'compound';
export type RuleScope = 'file' | 'package' | 'workspace' | 'cross-language-coupling';
export type RuleCost = 'cheap' | 'moderate' | 'expensive';
export type RequiredTier = 'open' | 'free' | 'pro' | 'team' | 'enterprise';

// ─── Section 2: Confidence + Finding ─────────────────────────────────────────

export interface ConfidenceSignal {
  name: string;
  weight: number;
  value: number;
  observedAt: Date;
}

export interface Finding {
  ruleId: string;
  ruleVersion: string;
  state: FindingState;
  severity?: Severity;        // only present when state is FAIL or WARN
  confidence: number;         // 0-1
  signals: ConfidenceSignal[];
  temporalWeight: number;
  evidence: {
    file?: string;
    line?: number;
    snippet?: string;
    path?: string;
  };
  message: string;
  remediation?: string;
  firedAt: Date;
  sampleCount?: number;
  samplesRequired?: number;
  calibrationProgress?: number;
}

// ─── Section 3: Rule contracts ────────────────────────────────────────────────

export interface RuleMeta {
  id: string;
  version: string;
  description: string;
  documentation?: string;
  category: RuleCategory;
  scope: RuleScope;
  firingMode: FiringMode;
  prerequisites?: string[];
  cost: RuleCost;
  timeoutMs?: number;
  minSamples?: number;
  calibrationWindow?: number;
  decayConstant?: number;
  lookbackDays?: number;
  configSchema?: Record<string, unknown>;
  requiredTier: RequiredTier;
  previewMessage?: (ctx: StaticRuleContext) => string;
}

export interface Rule {
  meta: RuleMeta;
  evaluate(context: RuleContext): Promise<Finding | Finding[]>;
}

export type RuleFactory<TConfig = Record<string, unknown>> = (config: TConfig) => Rule;

// ─── Section 4: FindingGraph interface ───────────────────────────────────────

export interface FindingGraph {
  findingsFor(ruleId: string): Finding[];
  findingsFor(ruleId: string, filePath: string): Finding[];
  hasFinding(ruleId: string, state: FindingState): boolean;
  confidence(ruleId: string, filePath?: string): number | null;
}

// ─── Section 5: Git + Workspace signals ───────────────────────────────────────

export interface Commit {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

export interface GitSignals {
  recentCommits(n: number): Promise<Commit[]>;
  fileAge(path: string): Promise<number>;
  churnScore(path: string): Promise<number>;
  lastModified(path: string): Promise<Date>;
  authorCount(path: string, lookback?: number): Promise<number>;
  commitsBetween(path: string, from: Date, to: Date): Promise<Commit[]>;
  modificationVelocity(path: string, windowDays: number): Promise<number>;
}

export type ManifestMap = Record<string, string[]>;  // package name → dependency list

export interface DetectedAgentFiles {
  agentsMd?: string;
  workspaceJson?: string;
}

export type DetectedLanguage = 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'ruby' | 'java' | 'kotlin' | 'csharp' | 'unknown';

export interface WorkspaceSignals {
  topology: 'single-package' | 'monorepo' | 'polyglot-monorepo';
  ciProvider: 'github-actions' | 'gitlab-ci' | 'circleci' | 'jenkins' | 'none' | 'unknown';
  manifests: ManifestMap;
  packages: PackageInfo[];
  agentFiles: DetectedAgentFiles;
}

// ─── Section 6: Context types ─────────────────────────────────────────────────

export interface StaticRuleContext {
  repo: {
    root: string;
    files: string[];
    isMonorepo: boolean;
  };
  workspace: WorkspaceSignals;
  config: Record<string, unknown>;
}

export interface RuleContext extends StaticRuleContext {
  file: {
    path: string;
    language: DetectedLanguage;
    content: string;
  };
  git: GitSignals;
  findings: FindingGraph;
  emit: (finding: Omit<Finding, 'ruleId' | 'ruleVersion' | 'firedAt'>) => void;
  vreko?: VrekoContext;
}

// ─── Section 7: VrekoContext (forward declaration, NO implementation) ─────────

// VrekoContext is declared here as an interface contract only.
// It is implemented exclusively in the Vreko daemon — NOT in this package.
export interface SessionSummary {
  sessionId: string;
  startedAt: Date;
  endedAt?: Date;
  filesEdited: string[];
}

export interface SessionBoundary {
  at: Date;
  kind: 'start' | 'end';
}

export type AITool = 'copilot' | 'cursor' | 'claude' | 'codeium' | 'tabnine' | 'other';

export interface AttributionMap {
  humanLines: number;
  aiLines: number;
  tool?: AITool;
}

export interface AIActivity {
  tool: AITool;
  at: Date;
  linesAdded: number;
  linesRemoved: number;
}

export interface VelocityMetric {
  linesPerMs: number;
  sampledAt: Date;
  windowMs: number;
}

export interface AggregatedTeamSignal {
  signal: string;
  value: number;
  contributors: number;
}

export interface StoredPattern {
  id: string;
  description: string;
  createdAt: Date;
  payload: unknown;
}

export interface VrekoContext {
  session: {
    currentSession(): SessionSummary | null;
    recentSessions(n: number): SessionSummary[];
    sessionBoundaries(): SessionBoundary[];
  };
  attribution: {
    fileAttribution(path: string): AttributionMap;
    recentAIActivity(path: string): AIActivity[];
  };
  velocity: {
    editVelocity(path: string, windowMs: number): VelocityMetric;
    acceptanceRate(tool: AITool, path?: string): number;
    reviewTime(commitHash: string): number;
  };
  knowledge: {
    getPattern(id: string): StoredPattern | null;
    storePattern(pattern: StoredPattern): void;
  };
  team?: {
    aggregatedSignals(signal: string): AggregatedTeamSignal;
  };
}

// ─── Section 8: Score + Audit ─────────────────────────────────────────────────

export interface HygieneScore {
  value: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    failCount: number;
    warnCount: number;
    insufficientDataCount: number;
    skipCount: number;
    previewCount: number;
  };
  coverageRatio: number;
}

// ─── Section 9: Keep ALL v0.1 types still needed downstream ──────────────────

export interface ParsedAgentsMd {
  raw: string;
  filePath: string;
  lastModified: Date;
  sections: AgentsMdSection[];
  filePaths: string[];
  frameworkTokens: string[];
  conventions: ConventionEntry[];
  patterns: PatternEntry[];
}

export interface AgentsMdSection {
  heading: string;
  depth: number;
  content: string;
  lineStart: number;
  lineEnd: number;
}

export interface ConventionEntry {
  raw: string;
  type: 'filename-case' | 'directory-layout' | 'naming' | 'structural' | 'other';
  canonical: string;
  lineNumber: number;
}

export interface PatternEntry {
  raw: string;
  glob?: string;
  lineNumber: number;
}

export interface RepoState {
  root: string;
  files: string[];
  isMonorepo: boolean;
  packages: PackageInfo[];
  manifests: ManifestInfo[];
  gitHistory: GitHistory;
}

export interface PackageInfo {
  name: string;
  path: string;
  agentsMd?: string;
}

export interface ManifestInfo {
  type: 'package.json' | 'pyproject.toml' | 'requirements.txt' | 'Cargo.toml' | 'go.mod' | 'Gemfile';
  path: string;
  dependencies: string[];
}

export interface GitHistory {
  agentsMdLastModified: Date;
  nonAgentsCommitCount30Days: number;
  filesChangedLast30Days: string[];
}

export interface AuditConfig {
  stalenessThresholdDays: number;
  highActivityCommitCount: number;
  conventionMismatchPrecisionMode: boolean;
  failOn: Severity | null;
  save: boolean;
  reportDir: string;
  ignore: string[];
}

export interface AuditResult {
  findings: Finding[];
  score: HygieneScore;
  agentsMdPath: string;
  workspaceJsonFound: boolean;
  workspaceJsonStale: boolean;
  workspaceJsonStatus: 'missing' | 'invalid' | 'stale' | 'fresh';
  workspaceJsonErrors: string[];
  runAt: Date;
  durationMs: number;
}
