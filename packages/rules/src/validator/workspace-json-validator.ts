import Ajv2020 from 'ajv/dist/2020.js';
import { isAbsolute, win32 } from 'node:path';
import { workspaceJsonSchema } from '@workspacejson/spec';
import type { WorkspaceJson } from '@workspacejson/spec';

export class WorkspaceJsonValidator {
  private readonly ajv: Ajv2020;
  private readonly validateFn;

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    this.validateFn = this.ajv.compile<WorkspaceJson>(workspaceJsonSchema);
  }

  validate(value: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const valid = this.validateFn(value);
    if (!valid) {
      errors.push(...(this.validateFn.errors?.map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`) ?? []));
    }

    errors.push(...collectCustomErrors(value));

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

function collectCustomErrors(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const errors: string[] = [];
  const workspace = value as { generatedAt?: unknown; packages?: unknown };

  if (typeof workspace.generatedAt === 'string' && !isDateTimeString(workspace.generatedAt)) {
    errors.push('/generatedAt must be a valid date-time');
  }

  if (!Array.isArray(workspace.packages)) {
    return errors;
  }

  workspace.packages.forEach((pkg, index) => {
    if (typeof pkg !== 'object' || pkg === null) {
      return;
    }

    const pathValue = Reflect.get(pkg, 'path');
    if (typeof pathValue !== 'string') {
      return;
    }

    if (isAbsolute(pathValue) || win32.isAbsolute(pathValue)) {
      errors.push(`/packages/${index}/path must be a relative path`);
      return;
    }

    const normalized = pathValue.replaceAll('\\', '/');
    const segments = normalized.split('/').filter(Boolean);
    if (isAbsolute(normalized) || normalized.startsWith('../') || normalized === '..' || normalized.endsWith('/..') || normalized.includes('/../') || segments.includes('..')) {
      errors.push(`/packages/${index}/path must not contain traversal segments`);
    }
  });

  return errors;
}

function isDateTimeString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}
