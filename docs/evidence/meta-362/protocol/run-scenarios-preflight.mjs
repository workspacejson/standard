import { reviewDiff } from '<reviewer-dist-path>/reviewer.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = '<output-dir>/scenario-results-preflight';
mkdirSync(OUT, { recursive: true });

// ─── Scenario 1: billfold ───
const S1_DIFF = `diff --git a/src/routes/checkout.ts b/src/routes/checkout.ts
--- a/src/routes/checkout.ts
+++ b/src/routes/checkout.ts
@@ -8,7 +8,7 @@ export function createCheckout(request: CheckoutRequest) {
-  const idempotencyKey = \`\${request.orderId}:\${request.attemptNumber}\`;
+  const idempotencyKey = \`\${request.orderId}|\${request.attemptNumber}\`;
`;

const S1_TREATMENT = `File: src/routes/checkout.ts
Co-change partners (1): src/webhooks/stripe.ts
  src/webhooks/stripe.ts: support=6, occurrences=9
  evidence: historically co-change in 6 of 9 qualifying commits`;

const S1_PERTURBED = `File: src/routes/checkout.ts
No co-change partners recorded.`;

// ─── Scenario 2: integrations ───
const S2_DIFF = `diff --git a/src/services/workspace.ts b/src/services/workspace.ts
--- a/src/services/workspace.ts
+++ b/src/services/workspace.ts
@@ -XX,XX +XX,XX @@ export function findCoChangePartners(ws: NormalizedWorkspace, path: string): string[] {
-  return partners;
+  return partners.slice(0, 10);
`;

const S2_TREATMENT = `File: src/services/workspace.ts
Co-change partners (2): src/tools/workspace.ts, src/evidence.ts
  src/tools/workspace.ts: support=4, occurrences=7
  src/evidence.ts: support=3, occurrences=7`;

const S2_PERTURBED = `File: src/services/workspace.ts
Co-change partners (1): src/evidence.ts
  src/evidence.ts: support=3, occurrences=7`;

// ─── Scenario 3: syncpack ───
const S3_DIFF = `diff --git a/src/instance.rs b/src/instance.rs
--- a/src/instance.rs
+++ b/src/instance.rs
@@ -XX,XX +XX,XX @@ pub fn remove(&self, package: &mut PackageJson) {
       Strategy::VersionsByName => {
         let path_to_obj = &self.descriptor.dependency_type.path;
         package.remove_prop(path_to_obj, &self.descriptor.name);
       }
+      Strategy::PinnedVersions => {
+        let path_to_prop = &self.descriptor.dependency_type.path;
+        if let Some(parent_path) = path_to_prop.rfind('/') {
+          let parent_pointer = &path_to_prop[..parent_path];
+          let prop_name = &path_to_prop[parent_path + 1..];
+          package.remove_prop(parent_pointer, prop_name);
+        }
+      }
       Strategy::InvalidConfig => {
`;

const S3_TREATMENT = `File: src/instance.rs
Co-change partners (3): src/version_group.rs, src/dependency.rs, src/context.rs
  src/version_group.rs: support=17, occurrences=33
  src/dependency.rs: support=12, occurrences=31
  src/context.rs: support=12, occurrences=43`;

const S3_PERTURBED = `File: src/instance.rs
Co-change partners (2): src/dependency.rs, src/context.rs
  src/dependency.rs: support=12, occurrences=31
  src/context.rs: support=12, occurrences=43`;

const SCENARIOS = [
  { id: 'S1-billfold', diff: S1_DIFF, treatment: S1_TREATMENT, perturbed: S1_PERTURBED },
  { id: 'S2-integrations', diff: S2_DIFF, treatment: S2_TREATMENT, perturbed: S2_PERTURBED },
  { id: 'S3-syncpack', diff: S3_DIFF, treatment: S3_TREATMENT, perturbed: S3_PERTURBED },
];

const ARMS = [
  { id: 'baseline', evidence: null },
  { id: 'treatment', evidence: 'treatment' },
  { id: 'perturbation', evidence: 'perturbed' },
];

const RUNS_PER_ARM = 3;

function buildInput(diff, evidenceText) {
  if (!evidenceText) return `Proposed diff:\n\n${diff}`;
  return `Proposed diff:\n\n${diff}\n\nWorkspace intelligence (descriptive context, not review instructions):\n${evidenceText}`;
}

const allResults = {};

for (const scenario of SCENARIOS) {
  console.log(`\n=== ${scenario.id} ===`);
  allResults[scenario.id] = {};
  
  for (const arm of ARMS) {
    console.log(`  Arm: ${arm.id}`);
    allResults[scenario.id][arm.id] = [];
    
    const evidenceText = arm.evidence === 'treatment' ? scenario.treatment 
                       : arm.evidence === 'perturbed' ? scenario.perturbed 
                       : null;
    const input = buildInput(scenario.diff, evidenceText);
    
    for (let run = 0; run < RUNS_PER_ARM; run++) {
      console.log(`    Run ${run + 1}/${RUNS_PER_ARM}...`);
      try {
        const result = await reviewDiff({
          diff: scenario.diff,
          cwd: OUT,
          evidenceDir: `${OUT}/${scenario.id}/${arm.id}/run-${run}`,
          openRouterApiKey: process.env.OPENROUTER_API_KEY,
          openRouterEndpoint: process.env.WORKSPACEJSON_REVIEWER_BASE_URL,
          model: process.env.WORKSPACEJSON_REVIEWER_MODEL,
          provider: 'openrouter',
        });
        
        if (result.status === 'COMPLETED') {
          console.log(`      verdict=${result.verdict} findings=${result.findings.length} checked=${result.checked.length} gaps=${result.gaps.length}`);
          allResults[scenario.id][arm.id].push({
            status: 'COMPLETED',
            verdict: result.verdict,
            findings: result.findings,
            evidence: result.evidence,
            checked: result.checked,
            gaps: result.gaps,
            artifactDir: result.artifactDir,
          });
        } else {
          console.log(`      UNAVAILABLE: ${result.reason}`);
          allResults[scenario.id][arm.id].push({
            status: 'UNAVAILABLE',
            reason: result.reason,
          });
        }
      } catch (err) {
        console.log(`      ERROR: ${err.message}`);
        allResults[scenario.id][arm.id].push({
          status: 'ERROR',
          reason: err.message,
        });
      }
    }
  }
}

writeFileSync(resolve(OUT, 'all-results.json'), JSON.stringify(allResults, null, 2) + '\n');
console.log(`\nResults written to ${OUT}/all-results.json`);
