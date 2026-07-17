#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { validate } from './index.js';

const usage = 'Usage: workspacejson-spec validate <file>';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [command, file] = process.argv.slice(2);

if (command !== 'validate' || !file || process.argv.length !== 4) {
  fail(usage);
}

let data: unknown;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  fail(`Unable to read JSON from ${file}: ${error instanceof Error ? error.message : String(error)}`);
}

if (!validate(data)) {
  fail(`${file} is not a valid workspace.json document.`);
}
