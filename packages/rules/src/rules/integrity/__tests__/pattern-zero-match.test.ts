import { describe } from 'vitest';
import { RuleTester } from '../../../testing/rule-tester.js';
import { patternZeroMatch } from '../pattern-zero-match.js';

const tester = new RuleTester({ rule: patternZeroMatch });

tester.run('pattern-zero-match', {
  valid: [
    {
      name: 'pattern matches files',
      context: {
        repo: {
          root: new URL('../../../testing/fixtures/repos/clean-repo/', import.meta.url).pathname,
        },
        agentsMd: {
          patterns: [
            {
              raw: 'src/**/*.ts',
              glob: 'src/**/*.ts',
              lineNumber: 1,
            },
          ],
        },
      },
    },
  ],
  invalid: [
    {
      name: 'zero-match glob',
      context: {
        repo: {
          root: new URL('../../../testing/fixtures/repos/clean-repo/', import.meta.url).pathname,
        },
        agentsMd: {
          patterns: [
            {
              raw: 'lib/**/*.py',
              glob: 'lib/**/*.py',
              lineNumber: 2,
            },
          ],
        },
      },
      expectedFindings: [
        { ruleId: 'pattern-zero-match', severity: 'warning' },
      ],
    },
  ],
});
