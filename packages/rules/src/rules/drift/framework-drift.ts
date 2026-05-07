import type { AuditConfig, Finding, ParsedAgentsMd, RepoState, Rule, RuleContext } from '../../types.js';

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
  meta: {
    id: 'framework-drift',
    version: '2.0.0',
    description: 'AGENTS.md mentions a framework not found in any detected manifest.',
    category: 'staleness',
    scope: 'workspace',
    firingMode: 'threshold',
    cost: 'cheap',
    requiredTier: 'open',
  },

  async evaluate(ctx: RuleContext): Promise<Finding[]> {
    // v0.2 migration bridge: workspace-scoped rules access agentsMd via legacy cast.
    // TODO(v0.3): move agentsMd into WorkspaceSignals or a dedicated workspace rule context.
    const legacyCtx = ctx as unknown as {
      agentsMd: ParsedAgentsMd;
      repo: RepoState;
      config: AuditConfig;
    };
    const { agentsMd, repo } = legacyCtx;

    const findings: Finding[] = [];

    if (repo.manifests.length === 0) {
      return findings;
    }

    const allDependencies = new Set(repo.manifests.flatMap((manifest) => manifest.dependencies));

    for (const token of agentsMd.frameworkTokens) {
      const variants = FRAMEWORK_MANIFEST_MAP[token];
      if (!variants) continue;

      const found = variants.some(
        (variant) =>
          allDependencies.has(variant) ||
          [...allDependencies].some((dependency) => dependency.toLowerCase().includes(variant.toLowerCase())),
      );

      if (!found) {
        findings.push({
          ruleId: this.meta.id,
          ruleVersion: this.meta.version,
          state: 'WARN',
          severity: 'warning',
          confidence: 1,
          signals: [],
          temporalWeight: 1,
          evidence: {
            file: agentsMd.filePath,
            snippet: token,
          },
          message: `Framework "${token}" is mentioned in AGENTS.md but not found in any manifest.`,
          remediation: `If "${token}" is no longer used, remove it from AGENTS.md. If it is used, verify the manifest includes it.`,
          firedAt: new Date(),
        });
      }
    }

    return findings;
  },
};
