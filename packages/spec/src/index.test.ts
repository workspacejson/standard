import { describe, expect, it } from 'vitest';
import { workspaceJsonSchema } from './index.js';

describe('@workspacejson/spec smoke test', () => {
  it('exports the schema object', () => {
    expect(workspaceJsonSchema.title).toBe('agents.workspace.json');
  });
});
