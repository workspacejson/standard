import type { WorkspaceJson } from '@workspacejson/spec';

export type Severity = 'error' | 'warning' | 'info';

export type RuleCategory = 'staleness' | 'integrity' | 'consistency' | 'coverage' | 'drift';

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  evidence: {
    file?: string;
    line?: number;
    snippet?: string;
    path?: string;
  };
  remediation?: string;
}

export interface Rule {
  id: string;
  category: RuleCategory;
  severity: Severity;
  description: string;
  evaluate(ctx: RuleContext): Promise<Finding[]>;
}

export interface RuleContext {
  agentsMd: ParsedAgentsMd;
  workspace?: WorkspaceJson;
  repo: RepoState;
  config: AuditConfig;
}

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

export interface HygieneScore {
  value: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  errorCount: number;
  warningCount: number;
  infoCount: number;
}
