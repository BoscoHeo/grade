import { build } from 'vite';
import { checkArtifacts } from './check-artifacts.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'pages-public');
// Vite empties only this dedicated output; dist and backups remain untouched.
await build({ root, configLoader: 'bundle', mode: process.argv.includes('--development') ? 'development' : 'production',
  build: { outDir: output, emptyOutDir: true, sourcemap: false } });
const result = checkArtifacts({ frontendDir: output, requireBackend: false, strictPublish: true });
if (result.issues.length) {
  for (const issue of result.issues) console.error(`FAIL ${issue.file}: ${issue.reason}`);
  process.exitCode = 1;
} else console.log(`PASS: pages-public ${result.files} files; frontend only`);
