import { describe, expect, it } from 'vitest';
import { validate, validateLegacy, version, workspaceJsonSchema } from './index.js';

const minimalV3 = {
  manual: {},
  generated: {
    specVersion: '0.3',
    generatedAt: '2026-05-22T00:00:00Z',
    by: { name: 'test', version: '0.1.0' },
    frameworkManifest: [],
    fileIndex: {},
  },
  agents: {},
  health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 },
};

describe('@workspacejson/spec smoke test', () => {
  it('exports the schema object', () => {
    expect(workspaceJsonSchema.title).toBe('agents.workspace.json');
  });
});

describe('version', () => {
  it('is 0.3.0', () => {
    expect(version).toBe('0.3.0');
  });
});

describe('validate()', () => {
  it('accepts a minimal v0.3 document', () => {
    expect(validate(minimalV3)).toBe(true);
  });

  it('rejects null', () => {
    expect(validate(null)).toBe(false);
  });

  it('rejects a v0.1 document (has version string, no four-property shape)', () => {
    expect(validate({ version: '1', generatedAt: '2026-01-01T00:00:00Z' })).toBe(false);
  });

  it('rejects a document missing generated.specVersion', () => {
    expect(validate({ manual: {}, generated: { generatedAt: '2026-05-22T00:00:00Z', by: { name: 'x', version: '0' }, frameworkManifest: [], fileIndex: {} }, agents: {}, health: { intelligenceState: 'OBSERVING', observationCount: 0, confidence: 0 } })).toBe(false);
  });

  it('rejects a document with wrong specVersion', () => {
    const bad = { ...minimalV3, generated: { ...minimalV3.generated, specVersion: '0.2' } };
    expect(validate(bad)).toBe(false);
  });
});

describe('validateLegacy()', () => {
  it('accepts a v0.1 document', () => {
    expect(validateLegacy({ version: '1', generatedAt: '2026-01-01T00:00:00Z' })).toBe(true);
  });

  it('rejects a v0.3 document', () => {
    expect(validateLegacy(minimalV3)).toBe(false);
  });

  it('rejects null', () => {
    expect(validateLegacy(null)).toBe(false);
  });
});
