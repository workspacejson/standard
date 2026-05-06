import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentsMdParser } from '../../parser/agents-md-parser.js';

describe('AgentsMdParser', () => {
  it('extracts sections, paths, patterns, conventions, and framework tokens', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agents-audit-parser-'));
    const filePath = join(dir, 'AGENTS.md');
    const content = [
      '# Overview',
      'Use `./docs/guide.md` and `src/**/*.ts` for references.',
      'Also see https://example.com/docs and #anchor.',
      '',
      '## Conventions',
      'Keep tests next to source and use kebab-case filenames.',
      'Build with React and Playwright.',
      '',
      '## Notes',
      'Repeat `./docs/guide.md` here.',
    ].join('\n');

    await writeFile(filePath, content, 'utf8');

    const parser = new AgentsMdParser();
    const parsed = await parser.parse(filePath, content);

    expect(parsed.filePath).toBe(filePath);
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections[0]?.heading).toBe('Overview');
    expect(parsed.sections[1]?.heading).toBe('Conventions');
    expect(parsed.sections[2]?.heading).toBe('Notes');
    expect(parsed.sections[0]?.content).toContain('Use `./docs/guide.md`');

    expect(parsed.filePaths).toHaveLength(1);
    expect(parsed.filePaths[0]).toBe('./docs/guide.md');

    expect(parsed.patterns).toHaveLength(3);
    expect(parsed.patterns.some((pattern) => pattern.raw === 'src/**/*.ts' && pattern.glob === 'src/**/*.ts' && pattern.lineNumber === 2)).toBe(true);
    expect(parsed.patterns.some((pattern) => pattern.raw === './docs/guide.md' && pattern.glob === './docs/guide.md')).toBe(true);

    const canonicalConventions = parsed.conventions.map((entry) => entry.canonical);
    expect(canonicalConventions.includes('colocated-tests')).toBe(true);
    expect(canonicalConventions.includes('kebab-case-filenames')).toBe(true);
    expect(parsed.frameworkTokens.includes('react')).toBe(true);
    expect(parsed.frameworkTokens.includes('playwright')).toBe(true);
  });

  it('returns an empty parse for empty content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agents-audit-parser-'));
    const filePath = join(dir, 'AGENTS.md');
    await writeFile(filePath, '', 'utf8');

    const parsed = await new AgentsMdParser().parse(filePath, '');

    expect(parsed.sections).toHaveLength(0);
    expect(parsed.filePaths).toHaveLength(0);
    expect(parsed.patterns).toHaveLength(0);
    expect(parsed.conventions).toHaveLength(0);
    expect(parsed.frameworkTokens).toHaveLength(0);
  });
});
