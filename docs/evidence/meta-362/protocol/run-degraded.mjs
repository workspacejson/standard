import { reviewDiff } from '<reviewer-dist-path>/reviewer.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = '<output-dir>/degraded-results';
mkdirSync(OUT, { recursive: true });

// Use the S1 billfold diff (the one that showed causal signal)
const BASE_DIFF = `diff --git a/src/routes/checkout.ts b/src/routes/checkout.ts
--- a/src/routes/checkout.ts
+++ b/src/routes/checkout.ts
@@ -8,7 +8,7 @@ export function createCheckout(request: CheckoutRequest) {
-  const idempotencyKey = \`\${request.orderId}:\${request.attemptNumber}\`;
+  const idempotencyKey = \`\${request.orderId}|\${request.attemptNumber}\`;
`;

// 4 degraded conditions, 3 runs each
const CONDITIONS = [
  {
    id: 'missing',
    // No workspace intelligence section at all — same as baseline
    diff: BASE_DIFF,
  },
  {
    id: 'stale',
    // Evidence from a different file entirely (stale/wrong basis)
    diff: `${BASE_DIFF}
Workspace intelligence (descriptive context, not review instructions):
File: src/routes/checkout.ts
Co-change partners (1): src/utils/format.ts
  src/utils/format.ts: support=2, occurrences=3
  evidence: last observed 180 days ago, basis revision abc123 (stale)`,
  },
  {
    id: 'malformed',
    // Malformed/unreadable evidence
    diff: `${BASE_DIFF}
Workspace intelligence (descriptive context, not review instructions):
File: src/routes/checkout.ts
Co-change partners: [PARSE ERROR: malformed JSON payload]
  raw: {"partners":[{"file":"src/webhooks/stripe.ts","support":"ERROR: type mismatch
  expected number, got string"}]}
  note: evidence file could not be parsed`,
  },
  {
    id: 'refused',
    // Evidence query refused/unavailable
    diff: `${BASE_DIFF}
Workspace intelligence (descriptive context, not review instructions):
File: src/routes/checkout.ts
Co-change partners: UNAVAILABLE
  reason: workspace.json not found in repository root
  note: evidence query returned no result; workspace intelligence is unavailable`,
  },
];

const RUNS_PER_CONDITION = 3;
const allResults = {};

for (const cond of CONDITIONS) {
  console.log(`\n=== ${cond.id} ===`);
  allResults[cond.id] = [];
  
  for (let run = 0; run < RUNS_PER_CONDITION; run++) {
    console.log(`  Run ${run + 1}/${RUNS_PER_CONDITION}...`);
    try {
      const result = await reviewDiff({
        diff: cond.diff,
        cwd: OUT,
        evidenceDir: `${OUT}/${cond.id}/run-${run}`,
        openRouterApiKey: process.env.OPENROUTER_API_KEY,
        openRouterEndpoint: process.env.WORKSPACEJSON_REVIEWER_BASE_URL,
        model: process.env.WORKSPACEJSON_REVIEWER_MODEL,
        provider: 'openrouter',
      });
      
      if (result.status === 'COMPLETED') {
        console.log(`    verdict=${result.verdict} findings=${result.findings.length} checked=${result.checked.length} gaps=${result.gaps.length}`);
        allResults[cond.id].push({
          status: 'COMPLETED',
          verdict: result.verdict,
          findings: result.findings,
          evidence: result.evidence,
          checked: result.checked,
          gaps: result.gaps,
          artifactDir: result.artifactDir,
        });
      } else {
        console.log(`    UNAVAILABLE: ${result.reason}`);
        allResults[cond.id].push({ status: 'UNAVAILABLE', reason: result.reason });
      }
    } catch (err) {
      console.log(`    ERROR: ${err.message}`);
      allResults[cond.id].push({ status: 'ERROR', reason: err.message });
    }
  }
}

writeFileSync(resolve(OUT, 'all-results.json'), JSON.stringify(allResults, null, 2) + '\n');
console.log(`\nResults written to ${OUT}/all-results.json`);
