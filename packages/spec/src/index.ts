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
  CoChangeEntry,
  FragilityEntry,
  WorkspaceJsonV4,
} from './types.js';

import type { WorkspaceJsonV3, WorkspaceJsonV4 } from './types.js';

export const version = '0.4.0';

export function validate(data: unknown): data is WorkspaceJsonV3 | WorkspaceJsonV4 {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (!('manual' in d && 'generated' in d && 'agents' in d && 'health' in d)) return false;
  const gen = d['generated'];
  if (typeof gen !== 'object' || gen === null) return false;
  const g = gen as Record<string, unknown>;
  return (g['specVersion'] === '0.3' || g['specVersion'] === '0.4') &&
    typeof g['generatedAt'] === 'string';
}

export function validateV4(data: unknown): data is WorkspaceJsonV4 {
  if (!validate(data)) return false;
  const g = (data as WorkspaceJsonV4).generated;
  return g.specVersion === '0.4' &&
    Array.isArray(g.coChange) &&
    Array.isArray(g.fragility);
}

export function validateLegacy(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  // v0.1/v0.2 shape has top-level `version` string but no specVersion
  return typeof d['version'] === 'string' && !validate(data);
}
