import { describe } from 'vitest';
import { RuleTester } from '../../../testing/rule-tester.js';
import { conventionMismatch } from '../convention-mismatch.js';

const tester = new RuleTester({ rule: conventionMismatch });
const cleanRepo = new URL('../../../testing/fixtures/repos/clean-repo/', import.meta.url).pathname;
const tsRepo = new URL('../../../testing/fixtures/repos/ts-monorepo/', import.meta.url).pathname;

tester.run('convention-mismatch', {
  valid: [
    {
      name: 'colocated tests and no separate test dir',
      context: {
        repo: {
          root: cleanRepo,
          isMonorepo: false,
        },
        agentsMd: {
          conventions: [
            {
              raw: 'Tests next to source.',
              type: 'directory-layout',
              canonical: 'colocated-tests',
              lineNumber: 1,
            },
          ],
        },
      },
    },
  ],
  invalid: [
    {
      name: 'tests in tests dir but tests are elsewhere',
      context: {
        repo: {
          root: tsRepo,
          isMonorepo: true,
          packages: [
            {
              name: '@fixture/app',
              path: 'packages/app',
            },
          ],
        },
        agentsMd: {
          conventions: [
            {
              raw: 'Use tests/ for tests.',
              type: 'directory-layout',
              canonical: 'tests-in-tests-dir',
              lineNumber: 2,
            },
          ],
        },
      },
      expectedFindings: [
        { ruleId: 'convention-mismatch', severity: 'warning' },
      ],
    },
  ],
});
