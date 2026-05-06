import { describe } from 'vitest';
import { RuleTester } from '../../../testing/rule-tester.js';
import { frameworkDrift } from '../framework-drift.js';

const tester = new RuleTester({ rule: frameworkDrift });
const repoRoot = new URL('../../../testing/fixtures/repos/python-package/', import.meta.url).pathname;

tester.run('framework-drift', {
  valid: [
    {
      name: 'framework present in manifest',
      context: {
        repo: {
          root: repoRoot,
          manifests: [
            {
              type: 'pyproject.toml',
              path: 'pyproject.toml',
              dependencies: ['fastapi', 'pytest'],
            },
          ],
        },
        agentsMd: {
          frameworkTokens: ['fastapi', 'pytest'],
        },
      },
    },
  ],
  invalid: [
    {
      name: 'framework missing from manifest',
      context: {
        repo: {
          root: repoRoot,
          manifests: [
            {
              type: 'pyproject.toml',
              path: 'pyproject.toml',
              dependencies: ['fastapi', 'pytest'],
            },
          ],
        },
        agentsMd: {
          frameworkTokens: ['react'],
        },
      },
      expectedFindings: [
        { ruleId: 'framework-drift', severity: 'warning' },
      ],
    },
  ],
});
