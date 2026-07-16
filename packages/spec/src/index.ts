import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileSchemaValidator } from './validator.js';

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

type WorkspaceJsonDocument = WorkspaceJsonV3 | WorkspaceJsonV4;

// The runtime validator consumes the schema artifact that is published with
// the package, rather than the authoring-time TypeScript mirror.
const packagedSchema = JSON.parse(
  readFileSync(fileURLToPath(new URL('../schema/v1.json', import.meta.url)), 'utf8'),
) as object;
const validateSchema = compileSchemaValidator<WorkspaceJsonDocument>(packagedSchema);

export const version = '0.4.1';

export function validate(data: unknown): data is WorkspaceJsonV3 | WorkspaceJsonV4 {
  return validateSchema(data);
}

export function validateV4(data: unknown): data is WorkspaceJsonV4 {
  if (!validate(data)) return false;
  const g = (data as WorkspaceJsonV4).generated;
  return g.specVersion === '0.4';
}

export function validateLegacy(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  // v0.1/v0.2 shape has top-level `version` string but no specVersion
  return typeof d['version'] === 'string' && !validate(data);
}
