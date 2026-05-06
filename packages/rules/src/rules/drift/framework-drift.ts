import type { Finding, Rule, RuleContext } from '../../types.js';

const FRAMEWORK_MANIFEST_MAP: Record<string, string[]> = {
  react: ['react', '@types/react'],
  'next.js': ['next'],
  nextjs: ['next'],
  vue: ['vue', '@vue/core'],
  nuxt: ['nuxt'],
  angular: ['@angular/core'],
  svelte: ['svelte'],
  express: ['express'],
  fastify: ['fastify'],
  hono: ['hono'],
  nestjs: ['@nestjs/core'],
  nest: ['@nestjs/core'],
  vitest: ['vitest'],
  jest: ['jest', '@jest/core'],
  playwright: ['@playwright/test', 'playwright'],
  prisma: ['prisma', '@prisma/client'],
  drizzle: ['drizzle-orm'],
  zod: ['zod'],
  trpc: ['@trpc/server', '@trpc/client'],
  tailwind: ['tailwindcss'],
  tailwindcss: ['tailwindcss'],
  vite: ['vite'],
  django: ['django', 'Django'],
  flask: ['flask', 'Flask'],
  fastapi: ['fastapi'],
  pytest: ['pytest'],
  actix: ['actix-web'],
  axum: ['axum'],
  rails: ['rails'],
};

export const frameworkDrift: Rule = {
  id: 'framework-drift',
  category: 'drift',
  severity: 'warning',
  description: 'AGENTS.md mentions a framework not found in any detected manifest.',

  async evaluate(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    if (ctx.repo.manifests.length === 0) {
      return findings;
    }

    const allDependencies = new Set(ctx.repo.manifests.flatMap((manifest) => manifest.dependencies));

    for (const token of ctx.agentsMd.frameworkTokens) {
      const variants = FRAMEWORK_MANIFEST_MAP[token];
      if (!variants) continue;

      const found = variants.some(
        (variant) =>
          allDependencies.has(variant) ||
          [...allDependencies].some((dependency) => dependency.toLowerCase().includes(variant.toLowerCase())),
      );

      if (!found) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Framework "${token}" is mentioned in AGENTS.md but not found in any manifest.`,
          evidence: {
            file: ctx.agentsMd.filePath,
            snippet: token,
          },
          remediation: `If "${token}" is no longer used, remove it from AGENTS.md. If it is used, verify the manifest includes it.`,
        });
      }
    }

    return findings;
  },
};
