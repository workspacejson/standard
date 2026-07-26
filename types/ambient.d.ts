// Interop shims retained after the extraction migration.
//
// These four declarations are NOT contract duplication. Each package below ships
// real TypeScript types; each shim exists only because a CommonJS default export
// does not line up with `moduleResolution: NodeNext` in this repository's source.
// Removing any one of them produces real compile errors (measured: simple-git 3,
// remark 1, ajv 1, ajv/dist/2020.js 3+1). Fixing them properly means changing
// import style in package source, which is deliberately out of scope for a
// move-first migration. Tracked as its own interoperability work.
//
// Everything else that used to live here was removed during the extraction:
//   * `declare module '@workspacejson/spec'` — a stale, v0.3-only duplicate of a
//     standard-owned contract that was WINNING over the real package's types.
//     scripts/check-architecture.mjs now rejects its reintroduction.
//   * all hand-written `node:*` / `process` declarations — replaced by a declared
//     `@types/node` devDependency in both packages.
//   * all CLI-only third-party stubs (commander, ora, picocolors, cli-table3,
//     boxen, terminal-link) — they belong to workspacejson/cli, not here.
//
// Adding a declaration here shadows a real package's types for the whole
// workspace. Prefer fixing the import.

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
