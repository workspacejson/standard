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
