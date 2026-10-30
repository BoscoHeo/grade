import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkArtifacts } from './check-artifacts.mjs';
for (const [file, body] of [
  ['server.cjs', 'server'], ['assets/renamed.js', 'module.exports = require("express")();'],
  ['assets/hidden.js', 'app.post("/api/test", handler);'], ['assets/code.js.map', '{}'],
  ['.env', 'TEST=value'], ['backend/source.ts', 'export {}'], ['unexpected.txt', 'extra'],
  ['assets/key.js', 'const key="sk-' + 'a'.repeat(30) + '";'],
]) test(`publish gate rejects ${file}`, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-publish-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(dir, 'assets/main.js'), 'console.log("fixture");');
    fs.writeFileSync(path.join(dir, 'assets/main.css'), 'body{}');
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
    assert.ok(checkArtifacts({ frontendDir: dir, requireBackend: false, strictPublish: true }).issues.length);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
