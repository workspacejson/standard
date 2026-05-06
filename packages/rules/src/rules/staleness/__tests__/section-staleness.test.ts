import { describe } from 'vitest';
import { RuleTester } from '../../../testing/rule-tester.js';
import { sectionStaleness } from '../section-staleness.js';

const tester = new RuleTester({ rule: sectionStaleness });

tester.run('section-staleness', {
  valid: [
    {
      name: 'recently updated',
      context: {
        agentsMd: {
          lastModified: new Date(),
          filePaths: ['./src/index.ts'],
        },
        repo: {
          gitHistory: {
            agentsMdLastModified: new Date(),
            nonAgentsCommitCount30Days: 50,
            filesChangedLast30Days: ['./src/index.ts'],
          },
        },
      },
    },
  ],
  invalid: [
    {
      name: 'stale with activity and referenced file change',
      context: {
        agentsMd: {
          lastModified: new Date('2025-01-01T00:00:00Z'),
          filePaths: ['./src/index.ts'],
        },
        repo: {
          gitHistory: {
            agentsMdLastModified: new Date('2025-01-01T00:00:00Z'),
            nonAgentsCommitCount30Days: 50,
            filesChangedLast30Days: ['./src/index.ts'],
          },
        },
      },
      expectedFindings: [
        { ruleId: 'section-staleness' },
      ],
    },
  ],
});
