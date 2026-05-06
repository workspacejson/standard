import { readFile } from 'node:fs/promises';

const schemaPath = new URL('../schema/v1.json', import.meta.url);
await readFile(schemaPath, 'utf8');
