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
