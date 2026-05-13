export { workspaceJsonSchema } from './schema.js';
export type {
  WorkspaceJson,
  WorkspacePackage,
  WorkspaceConvention,
  WorkspaceAgentFiles,
  WorkspaceGitSummary,
  WorkspaceHygiene,
  WorkspaceJsonV3,
  FrameworkEntry,
  FileIndexEntry,
  IntelligenceState,
} from './types.js';

import type { WorkspaceJsonV3 } from './types.js';

export const version = '0.3.0';

export function validate(data: unknown): data is WorkspaceJsonV3 {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (!('manual' in d && 'generated' in d && 'agents' in d && 'health' in d)) return false;
  const gen = d['generated'];
  if (typeof gen !== 'object' || gen === null) return false;
  const g = gen as Record<string, unknown>;
  return g['specVersion'] === '0.3' && typeof g['generatedAt'] === 'string';
}

export function validateLegacy(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  // v0.1/v0.2 shape has top-level `version` string but no specVersion
  return typeof d['version'] === 'string' && !validate(data);
}
