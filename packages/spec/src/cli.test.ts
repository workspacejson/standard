import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(process.cwd());
const cliPath = resolve(packageRoot, 'dist/cli.js');
const validExample = resolve(packageRoot, 'examples/populated-v0.4.json');
const invalidDocument = resolve(packageRoot, 'package.json');

function run(...args: string[]): string {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

describe('workspacejson-spec CLI', () => {
  it('validates a valid document through the built entry point', () => {
    expect(run('validate', validExample)).toBe('');
  });

  it('rejects an invalid document with a readable error', () => {
    try {
      run('validate', invalidDocument);
      throw new Error('Expected command to fail');
    } catch (error) {
      expect(error).toMatchObject({ status: 1 });
      expect((error as { stderr: string }).stderr).toContain('is not a valid workspace.json document');
    }
  });
});
