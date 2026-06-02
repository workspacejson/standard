export interface WorkspaceConvention {
  raw: string;
  type: 'filename-case' | 'directory-layout' | 'naming' | 'structural' | 'other';
  canonical: string;
}

export interface WorkspaceAgentFiles {
  agentsMd?: string;
  workspaceJson?: string;
}

export interface WorkspaceGitSummary {
  nonAgentsCommitCount30Days: number;
  filesChangedLast30Days: string[];
}

export interface WorkspaceHygiene {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  failCount: number;
  warnCount: number;
  scannedAt: string;
}

export interface WorkspacePackage {
  name?: string;
  path: string;
  agentsMd?: string;
  dependencies?: string[];
  [key: string]: unknown;
}

export interface WorkspaceJson {
  version: string;
  generatedAt?: string;
  repository?: string;
  topology?: 'single-package' | 'monorepo' | 'polyglot-monorepo';
  ciProvider?: 'github-actions' | 'gitlab-ci' | 'circleci' | 'jenkins' | 'none' | 'unknown';
  agentFiles?: WorkspaceAgentFiles;
  frameworks?: string[];
  conventions?: WorkspaceConvention[];
  packages?: WorkspacePackage[];
  gitSummary?: WorkspaceGitSummary;
  hygiene?: WorkspaceHygiene;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// v0.3 types

export interface FrameworkEntry {
  name: string;
  version?: string;
  confidence: number;
}

export interface FileIndexEntry {
  fragility?: number;
  aiModificationCount?: number;
  humanModificationCount?: number;
  [key: string]: unknown;
}

export type IntelligenceState = 'INSUFFICIENT_DATA' | 'OBSERVING' | 'CONFIDENT';

export interface WorkspaceJsonV3 {
  manual: {
    fragileFiles?: Array<{ path: string; reason?: string }>;
    coChangePatterns?: Array<{ files: string[]; note?: string }>;
    [key: string]: unknown;
  };
  generated: {
    specVersion: '0.3';
    generatedAt: string;
    by: { name: string; version: string };
    frameworkManifest: FrameworkEntry[];
    fileIndex: Record<string, FileIndexEntry>;
    topology?: { packageCount?: number; [key: string]: unknown };
    warnings?: string[];
    [key: string]: unknown;
  };
  agents: Record<string, unknown>;
  health: {
    intelligenceState: IntelligenceState;
    observationCount: number;
    confidence: number;
    averageFragility?: number;
    fragileFileCount?: number;
    [key: string]: unknown;
  };
}

export interface CoChangeEntry {
  files: [string, string];
  rate: number;
  occurrences: number;
  /** true = tooling-coupled pair (e.g. lockfile + package.json); consumers skip these */
  generated: boolean;
}

export interface FragilityEntry {
  file: string;
  changeCount: number;
  revertCount: number;
  /** revertCount / changeCount */
  revertRate: number;
  /** 0-1 composite score */
  fragilityScore: number;
  /** true = generated/lock file excluded from analysis */
  excluded: boolean;
}

export interface WorkspaceJsonV4 {
  manual: WorkspaceJsonV3['manual'];
  generated: Omit<WorkspaceJsonV3['generated'], 'specVersion'> & {
    specVersion: '0.4';
    coChange: CoChangeEntry[];
    fragility: FragilityEntry[];
  };
  agents: WorkspaceJsonV3['agents'];
  health: WorkspaceJsonV3['health'] & {
    workflowFragility?: number;
    codebaseHealth?: number;
    changeVolatility?: number;
  };
}
