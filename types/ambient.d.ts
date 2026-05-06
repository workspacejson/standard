declare const process: {
  cwd(): string;
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
};

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
}

declare module 'node:fs/promises' {
  export function readFile(path: string | URL, encoding: string): Promise<string>;
  export function writeFile(path: string | URL, data: string, encoding: string): Promise<void>;
  export function mkdir(path: string | URL, options?: { recursive?: boolean }): Promise<void>;
  export function readdir(path: string | URL, options?: { withFileTypes?: boolean }): Promise<Array<{ name: string; isDirectory(): boolean }>>;
  export function stat(path: string | URL): Promise<{ mtime: Date }>;
}

declare module 'node:path' {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:module' {
  export function createRequire(url: string | URL): (id: string) => unknown;
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
    parseAsync(argv: string[]): Promise<void>;
  }
}

declare module '@workspacejson/spec' {
  export const workspaceJsonSchema: {
    $schema: string;
    $id: string;
    title: string;
    type: string;
    required: string[];
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };

  export interface WorkspacePackage {
    name?: string;
    path: string;
    [key: string]: unknown;
  }

  export interface WorkspaceJson {
    version: string;
    generatedAt?: string;
    repository?: string;
    packages?: WorkspacePackage[];
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
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
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => unknown): void;
  export function expect(value: unknown): {
    toHaveLength(length: number): void;
    toBe(value: unknown): void;
    toBeDefined(): void;
    toBeGreaterThan(value: number): void;
    toBeGreaterThanOrEqual(value: number): void;
    toBeLessThanOrEqual(value: number): void;
    toBeLessThan(value: number): void;
    toContain(value: unknown): void;
    toMatch(value: RegExp): void;
    toBeTruthy(): void;
  };
}
