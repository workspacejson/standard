import { describe, expect, it } from 'vitest';
import { WorkspaceJsonValidator } from '../../validator/workspace-json-validator.js';

describe('WorkspaceJsonValidator', () => {
  const validator = new WorkspaceJsonValidator();

  const validV3 = {
    manual: {},
    generated: {
      specVersion: '0.3',
      generatedAt: '2026-05-06T00:00:00.000Z',
      by: { name: 'agents-audit', version: '0.2.1' },
      frameworkManifest: [],
      fileIndex: {},
    },
    agents: {},
    health: { intelligenceState: 'INSUFFICIENT_DATA', observationCount: 0, confidence: 0 },
  };

  it('accepts a valid v0.3 workspace payload', () => {
    const result = validator.validate(validV3);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts optional manual and generated fields', () => {
    const result = validator.validate({
      ...validV3,
      manual: {
        fragileFiles: [{ path: 'src/index.ts', reason: 'core entry point' }],
        coChangePatterns: [{ files: ['a.ts', 'b.ts'], note: 'always change together' }],
      },
      generated: {
        ...validV3.generated,
        frameworkManifest: [{ name: 'react', version: '18.0.0', confidence: 0.9 }],
        fileIndex: { 'src/index.ts': { fragility: 0.8, aiModificationCount: 3, humanModificationCount: 1 } },
        warnings: ['example warning'],
      },
      agents: { 'some-tool': { setting: 'value' } },
      health: {
        intelligenceState: 'OBSERVING',
        observationCount: 5,
        confidence: 0.4,
        averageFragility: 0.3,
        fragileFileCount: 2,
      },
    });

    expect(result.valid).toBe(true);
  });

  it('rejects payloads missing required top-level properties', () => {
    const cases: Array<{ name: string; value: Record<string, unknown> }> = [
      { name: 'empty object', value: {} },
      { name: 'missing manual', value: { generated: validV3.generated, agents: {}, health: validV3.health } },
      { name: 'missing generated', value: { manual: {}, agents: {}, health: validV3.health } },
      { name: 'missing agents', value: { manual: {}, generated: validV3.generated, health: validV3.health } },
      { name: 'missing health', value: { manual: {}, generated: validV3.generated, agents: {} } },
    ];

    for (const { value } of cases) {
      const result = validator.validate(value);
      expect(result.valid).toBe(false);
    }
  });

  it('rejects a v0.2 document (flat version field, no four-section shape)', () => {
    const result = validator.validate({
      version: '1',
      generatedAt: '2026-05-06T00:00:00.000Z',
      packages: [{ path: 'packages/app' }],
    });

    expect(result.valid).toBe(false);
  });

  it('locks the table-driven spec MUSTs', () => {
    const cases = [
      {
        name: 'valid v0.3 baseline',
        value: validV3,
        valid: true,
      },
      {
        name: 'wrong specVersion',
        value: { ...validV3, generated: { ...validV3.generated, specVersion: '0.2' } },
        valid: false,
      },
      {
        name: 'missing generated.specVersion',
        value: {
          ...validV3,
          generated: {
            generatedAt: validV3.generated.generatedAt,
            by: validV3.generated.by,
            frameworkManifest: [],
            fileIndex: {},
          },
        },
        valid: false,
      },
      {
        name: 'missing generated.by',
        value: {
          ...validV3,
          generated: {
            specVersion: '0.3',
            generatedAt: validV3.generated.generatedAt,
            frameworkManifest: [],
            fileIndex: {},
          },
        },
        valid: false,
      },
      {
        name: 'additionalProperties at root are rejected',
        value: { ...validV3, extraField: 'not-allowed' },
        valid: false,
      },
    ] as const;

    for (const testCase of cases) {
      const result = validator.validate(testCase.value);
      expect(result.valid).toBe(testCase.valid);
    }
  });

  it('allows arbitrary agent configuration under agents key', () => {
    const result = validator.validate({
      ...validV3,
      agents: {
        'claude-code': { fragileFiles: ['src/extension.ts'] },
        'cursor': { conventions: ['use-pnpm'] },
      },
    });

    expect(result.valid).toBe(true);
  });
});
