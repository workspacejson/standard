import { describe, expect, it } from 'vitest';
import { WorkspaceJsonValidator } from '../../validator/workspace-json-validator.js';

describe('WorkspaceJsonValidator', () => {
  const validator = new WorkspaceJsonValidator();

  it('accepts a valid workspace payload with optional fields', () => {
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

  it('rejects payloads with invalid fields', () => {
    const cases: Array<{ name: string; value: Record<string, unknown>; error: string }> = [
      { name: 'missing version', value: {}, error: 'version' },
      { name: 'missing package path', value: { version: '1', packages: [{ name: 'missing-path' }] }, error: 'path' },
      { name: 'absolute package path', value: { version: '1', packages: [{ path: '/etc/passwd' }] }, error: 'relative path' },
      { name: 'traversal package path', value: { version: '1', packages: [{ path: '../passwd' }] }, error: 'traversal' },
      { name: 'invalid generatedAt', value: { version: '1', generatedAt: 'not-a-date' }, error: 'date-time' },
    ];

    for (const { value, error } of cases) {
      const result = validator.validate(value);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain(error);
    }
  });

  it('locks the table-driven spec MUSTs', () => {
    const cases = [
      {
        name: 'valid baseline',
        value: {
          version: '1',
          generatedAt: '2026-05-06T00:00:00.000Z',
          packages: [{ path: 'packages/app' }],
        },
        valid: true,
      },
      {
        name: 'version is required',
        value: {
          packages: [{ path: 'packages/app' }],
        },
        valid: false,
      },
      {
        name: 'package path is required',
        value: {
          version: '1',
          packages: [{ name: 'app' }],
        },
        valid: false,
      },
      {
        name: 'generatedAt must be a date-time',
        value: {
          version: '1',
          generatedAt: '2026-05-06',
          packages: [{ path: 'packages/app' }],
        },
        valid: false,
      },
      {
        name: 'package path must be relative',
        value: {
          version: '1',
          packages: [{ path: '/etc/passwd' }],
        },
        valid: false,
      },
      {
        name: 'package path must not traverse',
        value: {
          version: '1',
          packages: [{ path: 'packages/../passwd' }],
        },
        valid: false,
      },
    ] as const;

    for (const testCase of cases) {
      const result = validator.validate(testCase.value);
      expect(result.valid).toBe(testCase.valid);
    }
  });

  it('allows optional metadata without imposing extra secret heuristics', () => {
    const result = validator.validate({
      version: '1',
      packages: [{ path: 'packages/app', name: 'app' }],
      metadata: { source: 'test', token: 'ghp_1234567890abcdef' },
    });

    expect(result.valid).toBe(true);
  });
});
