import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validate, validateLegacy, version, workspaceJsonSchema } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_JSON_PATH = resolve(__dirname, '../schema/v1.json');
const CHANGELOG_PATH = resolve(__dirname, '../CHANGELOG.md');
const PKG_PATH = resolve(__dirname, '../package.json');

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

// ─── Schema identity invariants ──────────────────────────────────────────────
// These tests are the single source of truth for the canonical $id URL.
// If any of them fail, you have a $id drift problem — fix the source, not the test.
const CANONICAL_ID = 'https://www.workspacejson.dev/schema/v1.json';

describe('schema identity invariants', () => {
  it('TypeScript const $id matches canonical URL', () => {
    expect(workspaceJsonSchema.$id).toBe(CANONICAL_ID);
  });

  it('schema/v1.json $id matches canonical URL', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    expect(json['$id']).toBe(CANONICAL_ID);
  });

  it('TypeScript const $id matches schema/v1.json $id (no split-brain)', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    expect(workspaceJsonSchema.$id).toBe(json['$id']);
  });

  it('CHANGELOG top version header matches package.json version', () => {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as Record<string, unknown>;
    const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(pkg['version']);
  });

  it('schema/v1.json $schema uses https (not http)', () => {
    const json = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8')) as Record<string, unknown>;
    expect((json['$schema'] as string).startsWith('https://')).toBe(true);
  });
});
