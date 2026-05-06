import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RuleEngine, computeHygieneScore, AgentsMdParser, RepoScanner, missingFileReference, patternZeroMatch, frameworkDrift, sectionStaleness, conventionMismatch } from '../../index.js';

const VREKO_ROOT = resolve(process.cwd(), '../..');
const AGENTS_MD_PATH = resolve(VREKO_ROOT, 'AGENTS.md');

describe('Real repo integration - workspace root', () => {
  it('AGENTS.md exists in workspace root', () => {
    expect(existsSync(AGENTS_MD_PATH)).toBe(true);
  });

  it('audit runs to completion without throwing', async () => {
    const parser = new AgentsMdParser();
    const scanner = new RepoScanner();
    const engine = new RuleEngine();

    engine.register(missingFileReference);
    engine.register(patternZeroMatch);
    engine.register(frameworkDrift);
    engine.register(sectionStaleness);
    engine.register(conventionMismatch);

    const agentsMdContent = await readFile(AGENTS_MD_PATH, 'utf8');
    const agentsMd = await parser.parse(AGENTS_MD_PATH, agentsMdContent);
    const repo = await scanner.scan(VREKO_ROOT);

    const { findings, durationMs } = await engine.run({
      agentsMd,
      repo,
      config: {
        stalenessThresholdDays: 60,
        highActivityCommitCount: 20,
        conventionMismatchPrecisionMode: true,
        failOn: null,
        save: false,
        reportDir: '.agents/audit-history',
        ignore: [],
      },
    });
    const score = computeHygieneScore(findings);

    expect(durationMs).toBeLessThan(10_000);
    expect(score.value).toBeGreaterThanOrEqual(0);
    expect(score.value).toBeLessThanOrEqual(100);

    for (const finding of findings) {
      expect(finding.ruleId).toBeTruthy();
      expect(finding.severity).toMatch(/^(error|warning|info)$/);
      expect(finding.message).toBeTruthy();
      expect(typeof finding.evidence).toBe('object');
    }
  });

  it('cold-start latency is under 3 seconds on medium repo', async () => {
    const start = Date.now();
    const parser = new AgentsMdParser();
    const scanner = new RepoScanner();
    const engine = new RuleEngine();
    engine.register(missingFileReference);
    engine.register(patternZeroMatch);
    engine.register(frameworkDrift);
    engine.register(sectionStaleness);
    engine.register(conventionMismatch);

    const agentsMdContent = await readFile(AGENTS_MD_PATH, 'utf8');
    const agentsMd = await parser.parse(AGENTS_MD_PATH, agentsMdContent);
    const repo = await scanner.scan(VREKO_ROOT);
    await engine.run({
      agentsMd,
      repo,
      config: {
        stalenessThresholdDays: 60,
        highActivityCommitCount: 20,
        conventionMismatchPrecisionMode: true,
        failOn: null,
        save: false,
        reportDir: '.agents/audit-history',
        ignore: [],
      },
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3_000);
  });
});
