import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkArtifacts } from './check-artifacts.mjs';

// 검사용 임시 파일은 격리 worktree의 ignored 폴더 안에만 생성합니다.
const fixtureRoot = path.resolve('node_modules/.phase1-validation/artifact-tests');
function fixture(t) {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(fixtureRoot, 'case-'));
  t.after(() => {
    const relative = path.relative(fixtureRoot, directory);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const frontendDir = path.join(directory, 'frontend');
  const backendFile = path.join(directory, 'backend/server.cjs');
  fs.mkdirSync(path.join(frontendDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.dirname(backendFile), { recursive: true });
  fs.writeFileSync(path.join(frontendDir, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(frontendDir, 'assets/app.js'), 'console.log("fixture")');
  fs.writeFileSync(path.join(frontendDir, 'assets/app.css'), 'body{}');
  fs.writeFileSync(backendFile, 'console.log("fixture backend")');
  return { frontendDir, backendFile };
}

test('분리된 정상 산출물 및 frontend 단독 검사를 허용함', (t) => {
  const options = fixture(t);
  assert.deepEqual(checkArtifacts(options).issues, []);
  fs.unlinkSync(options.backendFile);
  assert.equal(checkArtifacts(options).issues.length, 1);
  assert.deepEqual(checkArtifacts({ ...options, requireBackend: false }).issues, []);
});

test('중첩된 서버 파일·source map·환경설정·dependency를 거절함', (t) => {
  const options = fixture(t);
  fs.mkdirSync(path.join(options.frontendDir, 'nested'));
  for (const file of ['server.cjs', 'server.cjs.map', 'server.ts', '.env', '.env.production', 'package.json']) {
    fs.writeFileSync(path.join(options.frontendDir, 'nested', file), 'fixture');
  }
  fs.mkdirSync(path.join(options.frontendDir, 'node_modules'));
  assert.equal(checkArtifacts(options).issues.length, 7);
});

test('credential 패턴을 차단하고 결과에는 실제 문자열을 남기지 않음', (t) => {
  const options = fixture(t);
  // 실제 키가 아닌 검사 전용 문자열입니다.
  const syntheticCredential = 'sk-' + 'x'.repeat(40);
  fs.writeFileSync(path.join(options.frontendDir, 'assets/app.js'), syntheticCredential);
  const result = checkArtifacts(options);
  assert.equal(result.issues.length, 1);
  assert.ok(result.issues[0].reason.includes('[REDACTED]'));
  assert.ok(!JSON.stringify(result).includes(syntheticCredential));
});

test('이름이 바뀐 backend 코드와 누락된 frontend asset도 거절함', (t) => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.frontendDir, 'assets/app.js'), 'require("express"); process.env.ACCESS_CODE');
  fs.unlinkSync(path.join(options.frontendDir, 'assets/app.css'));
  fs.unlinkSync(path.join(options.frontendDir, 'index.html'));
  assert.equal(checkArtifacts(options).issues.length, 3);
});

test('별도 map 파일이 없어도 inline source map 참조를 거절함', (t) => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.frontendDir, 'assets/app.js'), 'console.log("fixture");\n//# sourceMappingURL=data:application/json;base64,e30=');
  const result = checkArtifacts(options);
  assert.equal(result.issues.length, 1);
  assert.ok(result.issues[0].reason.includes('source map'));
});

// Only frontend provider URLs are forbidden; backend provider calls remain allowed.
for (const host of ['generativelanguage.googleapis.com', 'api.openai.com', 'api.groq.com', 'api.x.ai']) {
  test(`frontend rejects direct provider URL: ${host}`, (t) => {
    const options = fixture(t);
    fs.writeFileSync(path.join(options.frontendDir, 'assets/app.js'), `fetch("https://${host}/fixture")`);
    assert.equal(checkArtifacts(options).issues.length, 1);
    fs.writeFileSync(path.join(options.frontendDir, 'assets/app.js'), 'console.log("fixture")');
    fs.writeFileSync(options.backendFile, `fetch("https://${host}/fixture")`);
    assert.deepEqual(checkArtifacts(options).issues, []);
  });
}

for (const key of ['USER_GEMINI_API_KEY', 'USER_OPENAI_API_KEY', 'USER_GROQ_API_KEY', 'USER_XAI_API_KEY', 'USER_ACCESS_CODE']) {
  test(`reject credential reads/writes, allow deletion: ${key}`, (t) => {
    const options = fixture(t);
    for (const operation of ['getItem', 'setItem']) {
      fs.writeFileSync(path.join(options.frontendDir, 'assets/app.js'), `localStorage.${operation}("${key}", "fixture")`);
      assert.equal(checkArtifacts(options).issues.length, 1);
    }
    fs.writeFileSync(path.join(options.frontendDir, 'assets/app.js'), `localStorage.removeItem("${key}")`);
    assert.deepEqual(checkArtifacts(options).issues, []);
  });
}
