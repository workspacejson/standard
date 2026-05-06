import { describe, expect } from 'vitest';
import { RuleTester } from '../../../testing/rule-tester.js';
import { missingFileReference } from '../missing-file-reference.js';

const tester = new RuleTester({ rule: missingFileReference });

tester.run('missing-file-reference', {
  valid: [
    {
      name: 'no file paths in AGENTS.md',
      context: {
        agentsMd: {
          filePaths: [],
        },
      },
    },
    {
      name: 'all referenced paths exist',
      context: {
        agentsMd: {
          filePaths: ['./package.json'],
        },
        repo: { root: process.cwd() },
      },
    },
    {
      name: 'URL references are ignored',
      context: {
        agentsMd: {
          filePaths: ['https://example.com/docs'],
        },
      },
    },
    {
      name: 'anchor references are ignored',
      context: {
        agentsMd: {
          filePaths: ['#section-heading'],
        },
      },
    },
    {
      name: 'glob patterns are ignored',
      context: {
        agentsMd: {
          filePaths: ['src/**/*.ts'],
        },
      },
    },
  ],
  invalid: [
    {
      name: 'references a nonexistent file',
      context: {
        agentsMd: {
          filePaths: ['./src/totally-fake-file-that-does-not-exist.ts'],
        },
      },
      expectedFindings: [
        {
          ruleId: 'missing-file-reference',
          severity: 'error',
          message: 'does not exist',
        },
      ],
    },
    {
      name: 'references multiple nonexistent files',
      context: {
        agentsMd: {
          filePaths: ['./fake-one.ts', './fake-two.ts'],
        },
      },
      expectedFindings: [
        { ruleId: 'missing-file-reference', severity: 'error' },
        { ruleId: 'missing-file-reference', severity: 'error' },
      ],
    },
  ],
});
