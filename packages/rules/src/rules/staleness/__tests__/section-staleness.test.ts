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
    {
      // section-staleness returns WARN (not FAIL), so stale docs are a "valid" case
      // in the v2 API sense (no FAIL). Use expectedState: 'WARN' to assert the warning fires.
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
      expectedState: 'WARN',
    },
  ],
  invalid: [],
});
