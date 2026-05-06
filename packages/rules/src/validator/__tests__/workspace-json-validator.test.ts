import { describe, expect, it } from 'vitest';
import { WorkspaceJsonValidator } from '../../validator/workspace-json-validator.js';

describe('WorkspaceJsonValidator', () => {
  it('accepts a valid workspace payload with optional fields', () => {
    const validator = new WorkspaceJsonValidator();
    const result = validator.validate({
      version: '1',
      generatedAt: '2026-05-06T00:00:00.000Z',
      repository: 'https://example.com/workspace',
      packages: [{ path: 'packages/app', name: 'app' }],
      metadata: { source: 'test' },
      extra: true,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects payloads missing required fields', () => {
    const validator = new WorkspaceJsonValidator();
    const result = validator.validate({});

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('version');
  });

  it('rejects packages missing a path', () => {
    const validator = new WorkspaceJsonValidator();
    const result = validator.validate({
      version: '1',
      packages: [{ name: 'missing-path' }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('path');
  });
});
