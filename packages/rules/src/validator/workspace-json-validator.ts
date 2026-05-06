import Ajv2020 from 'ajv/dist/2020.js';
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
    const valid = this.validateFn(value);
    return {
      valid: Boolean(valid),
      errors: this.validateFn.errors?.map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`) ?? [],
    };
  }
}
