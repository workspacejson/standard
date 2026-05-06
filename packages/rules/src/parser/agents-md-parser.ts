import { stat } from 'node:fs/promises';
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import type { AgentsMdSection, ConventionEntry, ParsedAgentsMd, PatternEntry } from '../types.js';

type MdNode = {
  type: string;
  value?: string;
  depth?: number;
  children?: MdNode[];
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
};

const CONVENTION_SYNONYMS: Record<string, string> = {
  'tests next to source': 'colocated-tests',
  'colocated tests': 'colocated-tests',
  'tests adjacent to implementation': 'colocated-tests',
  'test files beside source': 'colocated-tests',
  'kebab-case for filenames': 'kebab-case-filenames',
  'kebab case filenames': 'kebab-case-filenames',
  'kebab-case file names': 'kebab-case-filenames',
  'camelcase for files': 'camelcase-filenames',
  'camel case filenames': 'camelcase-filenames',
  'tests in __tests__': 'tests-in-dunder-tests',
  'tests in a __tests__ directory': 'tests-in-dunder-tests',
  'tests under tests/': 'tests-in-tests-dir',
  'tests in tests directory': 'tests-in-tests-dir',
  'source in src/': 'source-in-src',
  'source code in src': 'source-in-src',
  'components in components/': 'components-in-components-dir',
  'components in ui/': 'components-in-ui-dir',
};

const KNOWN_FRAMEWORKS = [
  'react',
  'next.js',
  'nextjs',
  'vue',
  'nuxt',
  'angular',
  'svelte',
  'express',
  'fastify',
  'hono',
  'koa',
  'nest',
  'nestjs',
  'postgres',
  'postgresql',
  'mysql',
  'sqlite',
  'mongodb',
  'redis',
  'prisma',
  'drizzle',
  'typeorm',
  'sequelize',
  'vitest',
  'jest',
  'mocha',
  'playwright',
  'cypress',
  'vite',
  'webpack',
  'esbuild',
  'turbopack',
  'rollup',
  'tailwind',
  'tailwindcss',
  'styled-components',
  'css-modules',
  'zod',
  'yup',
  'joi',
  'ajv',
  'trpc',
  'graphql',
  'openapi',
  'rest',
  'django',
  'flask',
  'fastapi',
  'starlette',
  'pytest',
  'unittest',
  'cargo',
  'actix',
  'axum',
  'tokio',
  'rails',
  'sinatra',
  'rspec',
] as const;

function toText(node: MdNode): string {
  if (typeof node.value === 'string') {
    return node.value;
  }

  if (Array.isArray(node.children)) {
    return node.children.map((child) => toText(child)).join('');
  }

  return '';
}

function walk(node: MdNode, visit: (item: MdNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}

export class AgentsMdParser {
  async parse(filePath: string, content: string): Promise<ParsedAgentsMd> {
    const lastModified = await this.getFileModifiedDate(filePath);
    const tree = remark().use(remarkParse).parse(content) as unknown as MdNode;
    const sections = this.extractSections(tree, content);
    const filePaths = this.extractFilePaths(content);
    const frameworkTokens = this.extractFrameworkTokens(content);
    const conventions = this.extractConventions(tree);
    const patterns = this.extractPatterns(content);

    return {
      raw: content,
      filePath,
      lastModified,
      sections,
      filePaths,
      frameworkTokens,
      conventions,
      patterns,
    };
  }

  private extractSections(tree: MdNode, raw: string): AgentsMdSection[] {
    const lines = raw.split('\n');
    const headings: Array<{ text: string; depth: number; lineStart: number }> = [];

    walk(tree, (node) => {
      if (node.type === 'heading') {
        headings.push({
          text: toText(node),
          depth: node.depth ?? 1,
          lineStart: node.position?.start?.line ?? 1,
        });
      }
    });

    return headings.map((heading, index) => {
      const next = headings[index + 1];
      const lineEnd = next ? Math.max(heading.lineStart, next.lineStart - 1) : lines.length;
      return {
        heading: heading.text,
        depth: heading.depth,
        content: lines.slice(heading.lineStart - 1, lineEnd).join('\n'),
        lineStart: heading.lineStart,
        lineEnd,
      };
    });
  }

  private extractFilePaths(raw: string): string[] {
    const paths = new Set<string>();
    const pathPattern = /(?:^|[\s`"'])([./][^\s`"']+\.[a-z]{1,6}|[./][^\s`"']+\/)/gm;

    for (const match of raw.matchAll(pathPattern)) {
      const candidate = match[1]?.trim();
      if (candidate && this.looksLikeFilePath(candidate)) {
        paths.add(candidate);
      }
    }

    return [...paths];
  }

  private extractFrameworkTokens(content: string): string[] {
    const lower = content.toLowerCase();
    return KNOWN_FRAMEWORKS.filter((token) => lower.includes(token));
  }

  private extractConventions(tree: MdNode): ConventionEntry[] {
    const conventions: ConventionEntry[] = [];

    walk(tree, (node) => {
      if (node.type !== 'paragraph' && node.type !== 'listItem') {
        return;
      }

      const text = toText(node);
      const lower = text.toLowerCase();
      const lineNumber = node.position?.start?.line ?? 1;

      for (const [phrase, canonical] of Object.entries(CONVENTION_SYNONYMS)) {
        if (lower.includes(phrase)) {
          conventions.push({
            raw: text,
            type: this.classifyConventionType(canonical),
            canonical,
            lineNumber,
          });
        }
      }

      if (/(kebab-case|camelCase|PascalCase|snake_case)/i.test(text)) {
        conventions.push({
          raw: text,
          type: 'filename-case',
          canonical: this.extractCaseConvention(text),
          lineNumber,
        });
      }
    });

    return this.dedupeConventions(conventions);
  }

  private dedupeConventions(entries: ConventionEntry[]): ConventionEntry[] {
    const seen = new Set<string>();
    const result: ConventionEntry[] = [];
    for (const entry of entries) {
      const key = `${entry.canonical}:${entry.lineNumber}:${entry.raw}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(entry);
      }
    }
    return result;
  }

  private extractPatterns(raw: string): PatternEntry[] {
    const patterns: PatternEntry[] = [];
    for (const match of raw.matchAll(/`([^`]+)`/g)) {
      const candidate = match[1];
      if (candidate && this.looksLikeGlob(candidate)) {
        patterns.push({
          raw: candidate,
          glob: candidate,
          lineNumber: this.findLineNumber(raw, match.index ?? 0),
        });
      }
    }
    return patterns;
  }

  private looksLikeFilePath(value: string): boolean {
    return /^[./]/.test(value) && !/^\/\//.test(value) && value.length > 2 && value.length < 200;
  }

  private looksLikeGlob(value: string): boolean {
    return /[*?{}[\]]/.test(value) || /\.(ts|js|md|json|py|rs|go|rb)$/.test(value);
  }

  private classifyConventionType(canonical: string): ConventionEntry['type'] {
    if (canonical.includes('test')) return 'directory-layout';
    if (canonical.includes('case')) return 'filename-case';
    if (canonical.includes('source')) return 'directory-layout';
    if (canonical.includes('component')) return 'directory-layout';
    return 'structural';
  }

  private extractCaseConvention(text: string): string {
    if (/kebab-case/i.test(text)) return 'kebab-case-filenames';
    if (/camelCase/i.test(text)) return 'camelcase-filenames';
    if (/PascalCase/i.test(text)) return 'pascalcase-filenames';
    if (/snake_case/i.test(text)) return 'snake-case-filenames';
    return 'other-case-convention';
  }

  private findLineNumber(raw: string, index: number): number {
    return raw.slice(0, index).split('\n').length;
  }

  private async getFileModifiedDate(filePath: string): Promise<Date> {
    try {
      const stats = await stat(filePath);
      return stats.mtime;
    } catch {
      return new Date(0);
    }
  }
}
