import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkArtifacts } from './check-artifacts.mjs';

test('real Pages build fails on copied server code, then cleans stale output on repeated builds', {timeout:120000}, () => {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const assets=path.join(root,'public','assets');
  const probe=path.join(assets,'security-build-probe.js');
  const stale=path.join(root,'pages-public','security-stale-probe.cjs');
  assert.equal(fs.existsSync(probe),false,'do not overwrite an existing file');
  assert.equal(fs.existsSync(stale),false,'do not overwrite an existing file');
  const createdDirectory=!fs.existsSync(assets);
  const build=()=>spawnSync(process.execPath,['scripts/build-pages.mjs'],{cwd:root,encoding:'utf8',timeout:40000});
  if(createdDirectory) fs.mkdirSync(assets);
  try {
    fs.writeFileSync(probe,'module.exports = require("express")();',{flag:'wx'});
    const rejected=build();
    assert.equal(rejected.status,1,rejected.stdout+rejected.stderr);
    assert.match(rejected.stderr,/security-build-probe\.js/);
    assert.match(rejected.stderr,/서버 실행 코드 의심 패턴/);
  } finally {
    fs.unlinkSync(probe);
    if(createdDirectory) fs.rmdirSync(assets); // only the empty directory created here
  }
  const first=build(); assert.equal(first.status,0,first.stdout+first.stderr);
  fs.writeFileSync(stale,'fixture only',{flag:'wx'});
  const second=build(); assert.equal(second.status,0,second.stdout+second.stderr);
  assert.equal(fs.existsSync(stale),false);
  assert.equal(fs.existsSync(path.join(root,'pages-public','assets','security-build-probe.js')),false);
  const result=checkArtifacts({frontendDir:path.join(root,'pages-public'),requireBackend:false,strictPublish:true});
  assert.deepEqual(result.issues,[]); assert.equal(result.files,4);
});
