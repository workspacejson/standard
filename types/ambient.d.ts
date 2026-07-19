declare const process: {
  cwd(): string;
  execPath: string;
  exit(code?: number): never;
  argv: string[];
  stdin: {
    isTTY?: boolean;
    setRawMode?(mode: boolean): void;
    resume(): void;
    pause(): void;
    on(event: 'keypress', handler: (str: string, key: { name?: string; ctrl?: boolean }) => void): void;
    removeAllListeners(event?: string): void;
  };
  stdout: {
    write(value: string): boolean;
  };
  stderr: {
    write(value: string): boolean;
  };
};

declare module 'node:fs' {
  interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
}

declare module 'node:child_process' {
  export function execFileSync(
    command: string,
    args?: string[],
    options?: { cwd?: string; encoding?: string; stdio?: 'pipe' },
  ): string;
}

declare module 'node:fs/promises' {
  export function readFile(path: string | URL, encoding: string): Promise<string>;
  export function writeFile(path: string | URL, data: string, encoding: string): Promise<void>;
  export function mkdir(path: string | URL, options?: { recursive?: boolean }): Promise<void>;
  export function rm(path: string | URL, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function readdir(path: string | URL, options?: { withFileTypes?: boolean }): Promise<Array<{ name: string; isDirectory(): boolean }>>;
  export function stat(path: string | URL): Promise<{ mtime: Date }>;
}

declare module 'node:path' {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
  export const sep: string;
}

declare module 'node:module' {
  export function createRequire(url: string | URL): (id: string) => unknown;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:readline' {
  export function emitKeypressEvents(stream: unknown): void;
}

declare module 'commander' {
  export class Command {
    name(value: string): this;
    description(value: string): this;
    version(value: string): this;
    command(value: string, options?: { isDefault?: boolean }): this;
    argument(value: string, description?: string, defaultValue?: string): this;
    option(flags: string, description?: string): this;
    action(handler: (...args: any[]) => unknown): this;
    exitOverride(): this;
    parseAsync(argv: string[]): Promise<void>;
  }
}

declare module '@workspacejson/spec' {
  export const workspaceJsonSchema: {
    readonly $schema: string;
    readonly $id: string;
    readonly title: string;
    readonly type: string;
    readonly required: readonly string[];
    readonly additionalProperties: boolean;
    readonly properties: Record<string, unknown>;
  };

  export const version: string;

  export function validate(data: unknown): data is WorkspaceJsonV3;
  export function validateLegacy(data: unknown): boolean;

  export interface WorkspacePackage {
    name?: string;
    path: string;
    agentsMd?: string;
    dependencies?: string[];
    [key: string]: unknown;
  }

  export interface WorkspaceConvention {
    raw: string;
    type: 'filename-case' | 'directory-layout' | 'naming' | 'structural' | 'other';
    canonical: string;
  }

  export interface WorkspaceAgentFiles {
    agentsMd?: string;
    workspaceJson?: string;
  }

  export interface WorkspaceGitSummary {
    nonAgentsCommitCount30Days: number;
    filesChangedLast30Days: string[];
  }

  export interface WorkspaceHygiene {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    failCount: number;
    warnCount: number;
    scannedAt: string;
  }

  export interface WorkspaceJson {
    version: string;
    generatedAt?: string;
    repository?: string;
    topology?: 'single-package' | 'monorepo' | 'polyglot-monorepo';
    ciProvider?: 'github-actions' | 'gitlab-ci' | 'circleci' | 'jenkins' | 'none' | 'unknown';
    agentFiles?: WorkspaceAgentFiles;
    frameworks?: string[];
    conventions?: WorkspaceConvention[];
    packages?: WorkspacePackage[];
    gitSummary?: WorkspaceGitSummary;
    hygiene?: WorkspaceHygiene;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface FrameworkEntry {
    name: string;
    version?: string;
    confidence: number;
  }

  export interface FileIndexEntry {
    fragility?: number;
    aiModificationCount?: number;
    humanModificationCount?: number;
    [key: string]: unknown;
  }

  export type IntelligenceState = 'INSUFFICIENT_DATA' | 'OBSERVING' | 'CONFIDENT';

  export interface WorkspaceJsonV3 {
    manual: {
      fragileFiles?: Array<{ path: string; reason?: string }>;
      coChangePatterns?: Array<{ files: string[]; note?: string }>;
      [key: string]: unknown;
    };
    generated: {
      specVersion: '0.3';
      generatedAt: string;
      by: { name: string; version: string };
      frameworkManifest: FrameworkEntry[];
      fileIndex: Record<string, FileIndexEntry>;
      topology?: { packageCount?: number; [key: string]: unknown };
      warnings?: string[];
      [key: string]: unknown;
    };
    agents: Record<string, unknown>;
    health: {
      intelligenceState: IntelligenceState;
      observationCount: number;
      confidence: number;
      averageFragility?: number;
      fragileFileCount?: number;
      [key: string]: unknown;
    };
  }
}

declare module 'ora' {
  export interface Spinner {
    start(): Spinner;
    stop(): Spinner;
  }
  export default function ora(options: { text: string; color?: string }): Spinner;
}

declare module 'picocolors' {
  const pc: {
    green(value: string): string;
    cyan(value: string): string;
    yellow(value: string): string;
    red(value: string): string;
    dim(value: string): string;
    bold(value: string): string;
  };
  export default pc;
}

declare module 'cli-table3' {
  export default class Table {
    constructor(options: unknown);
    push(row: string[]): void;
    toString(): string;
  }
}

declare module 'boxen' {
  export default function boxen(value: string, options?: unknown): string;
}

declare module 'terminal-link' {
  export default function terminalLink(text: string, url: string): string;
}

declare module 'dedent' {
  export default function dedent(strings: TemplateStringsArray, ...values: unknown[]): string;
}

declare module 'fast-glob' {
  interface Options {
    cwd?: string;
    ignore?: string[];
    dot?: boolean;
  }
  interface FastGlob {
    (pattern: string | string[], options?: Options): Promise<string[]>;
    sync(pattern: string | string[], options?: Options): string[];
  }
  const fg: FastGlob;
  export default fg;
}

declare module 'simple-git' {
  interface SimpleGit {
    raw(args: string[]): Promise<string>;
  }
  function simpleGit(root: string): SimpleGit;
  export default simpleGit;
}

declare module 'remark' {
  export function remark(): { use(plugin: unknown): { parse(content: string): unknown } };
}

declare module 'remark-parse' {
  const plugin: unknown;
  export default plugin;
}

declare module 'ajv' {
  export interface ValidateFunction<T = unknown> {
    (data: unknown): data is T;
    errors?: Array<{ instancePath?: string; message?: string }> | null;
  }
  export default class Ajv {
    constructor(options?: unknown);
    compile<T = unknown>(schema: unknown): ValidateFunction<T>;
  }
}

declare module 'ajv/dist/2020.js' {
  import Ajv from 'ajv';
  export default Ajv;
}

declare module 'vitest' {
  interface MockInstance {
    mockImplementation(impl: (...args: any[]) => unknown): this;
    mockImplementationOnce(impl: (...args: any[]) => unknown): this;
    mockResolvedValue(value: unknown): this;
    mockResolvedValueOnce(value: unknown): this;
    mockReturnValue(value: unknown): this;
    mockReturnValueOnce(value: unknown): this;
    mockRestore(): void;
    mockClear(): void;
  }

  type Mock = MockInstance & ((...args: any[]) => unknown);

  interface ItFn {
    (name: string, fn: () => unknown): void;
    each(cases: unknown[]): (name: string, fn: (...args: any[]) => unknown) => void;
  }

  export const describe: {
    (name: string, fn: () => void): void;
  };
  export const it: ItFn;
  export const beforeEach: (fn: () => unknown) => void;
  export const afterEach: (fn: () => unknown) => void;
  export const afterAll: (fn: () => unknown) => void;

  interface Assertion {
    toHaveLength(length: number): void;
    toBe(value: unknown): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeGreaterThan(value: number): void;
    toBeGreaterThanOrEqual(value: number): void;
    toBeLessThanOrEqual(value: number): void;
    toBeLessThan(value: number): void;
    toContain(value: unknown): void;
    toMatch(value: RegExp | string): void;
    toBeTruthy(): void;
    toEqual(value: unknown): void;
    toBeInstanceOf(expected: unknown): void;
    toBeTypeOf(expected: 'bigint' | 'boolean' | 'function' | 'number' | 'object' | 'string' | 'symbol' | 'undefined'): void;
    toBeCloseTo(value: number, precision?: number): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    toMatchObject(expected: unknown): void;
    resolves: Assertion;
    rejects: Assertion;
    not: Assertion;
    toThrow(expected?: string | RegExp): void;
  }

  interface ExpectStatic {
    (value: unknown): Assertion;
    any(value: unknown): unknown;
  }

  export const expect: ExpectStatic;

  export const vi: {
    fn<T extends (...args: any[]) => unknown>(impl?: T): MockInstance & T;
    spyOn<T extends object, K extends keyof T>(obj: T, method: K, accessType?: 'get' | 'set'): MockInstance & ((...args: any[]) => unknown);
    hoisted<T>(factory: () => T): T;
    mock(moduleName: string, factory?: () => unknown): void;
    clearAllMocks(): void;
  };
}
