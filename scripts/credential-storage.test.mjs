import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { transform } from 'esbuild';
import { checkArtifacts } from './check-artifacts.mjs';

async function compile(file, imports = {}) {
  let { code } = await transform(fs.readFileSync(file, 'utf8'), {
    loader: file.endsWith('.tsx') ? 'tsx' : 'ts', format: 'esm', target: 'es2022',
  });
  for (const [specifier, url] of Object.entries(imports)) {
    assert.ok(code.includes(JSON.stringify(specifier)));
    code = code.replace(JSON.stringify(specifier), JSON.stringify(url));
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  return { url, module: await import(url) };
}
const credentialsModule = await compile('src/services/credentials.ts');
const { initializeCredentials, updateCredential, credentialRequestOptions } = credentialsModule.module;
const api = await compile('src/services/apiClient.ts');
const ai = await compile('src/services/aiService.ts', { './apiClient': api.url });
const context = await compile('src/contexts/CredentialsContext.tsx', {
  'react': import.meta.resolve('react'), '../services/credentials': credentialsModule.url,
});
const { CredentialsProvider, usePageCredentials } = context.module;
const providers = ['gemini', 'openai', 'groq', 'xai'];
const legacyKeys = providers.map((provider) => `USER_${provider.toUpperCase()}_API_KEY`).concat('USER_ACCESS_CODE');

function fixture(t) {
  // Synthetic legacy data lives in an isolated fake storage, never in the user's browser.
  const values = new Map(legacyKeys.map((key) => [key, 'fixture-legacy']));
  values.set('USER_SELECTED_PROVIDER', 'groq');
  values.set('USER_SELECTED_MODEL', 'fixture-model');
  values.set('fixture-unrelated', 'fixture-preserved');
  const removals = [];
  const forbidden = () => { throw new Error('Credential storage read/write attempted'); };
  const local = { getItem: forbidden, setItem: forbidden, removeItem: (key) => { removals.push(key); values.delete(key); } };
  const session = { getItem: forbidden, setItem: forbidden, removeItem: forbidden };
  for (const [name, value] of [['localStorage', local], ['sessionStorage', session]]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
  }
  return { values, removals, local };
}

test('initialization removes all five legacy keys without reading, restoring, or logging them', (t) => {
  const { values, removals } = fixture(t);
  const current = initializeCredentials();
  assert.deepEqual(Object.values(current), ['', '', '', '', '']);
  assert.deepEqual(removals, legacyKeys);
  for (const key of legacyKeys) assert.ok(!values.has(key));
  assert.equal(values.get('USER_SELECTED_PROVIDER'), 'groq');
  assert.equal(values.get('USER_SELECTED_MODEL'), 'fixture-model');
  assert.equal(values.get('fixture-unrelated'), 'fixture-preserved');
});

test('real React provider initializes empty on each mount; legacy values are never restored', (t) => {
  const { removals } = fixture(t);
  function Probe() {
    const { credentials } = usePageCredentials();
    assert.deepEqual(Object.values(credentials), ['', '', '', '', '']);
    return React.createElement('span', null, 'empty-page-credentials');
  }
  for (let mount = 0; mount < 2; mount++) {
    assert.equal(renderToString(React.createElement(CredentialsProvider, null, React.createElement(Probe))), '<span>empty-page-credentials</span>');
  }
  assert.deepEqual(removals, [...legacyKeys, ...legacyKeys]);
});

test('storage failure cannot restore credentials and does not skip other legacy deletions', () => {
  const removals = [];
  const current = initializeCredentials({ removeItem(key) { removals.push(key); if (key === legacyKeys[0]) throw new Error('fixture-denied'); } });
  assert.deepEqual(Object.values(current), ['', '', '', '', '']);
  assert.deepEqual(removals, legacyKeys);
});

const routes = [
  ['clientParseTableImage', '/api/parse-table-image', { base64Image: 'Zml4dHVyZQ==', mimeType: 'image/png' }, { students: [] }],
  ['clientGenerateRecords', '/api/generate-records', { criteria: [{ id: 'fixture' }], students: [{ id: 'fixture' }], config: {} }, { results: [{ recordText: 'fixture' }] }],
  ['clientGenerateCreativeRecommendations', '/api/generate-creative-recommendations', {
    domain: 'fixture', topic: 'fixture', element: 'fixture', tone: 'noun', maxLength: 100, creativityLevel: 'low', additionalInstructions: '',
  }, { results: [{ recommendedText: 'fixture' }] }],
  ['clientGenerateCreativeElements', '/api/generate-creative-elements', { domain: 'fixture', topic: 'fixture' }, { elements: ['fixture'] }],
];

for (const provider of providers) {
  for (const [method, endpoint, body, response] of routes) {
    test(`${provider} ${endpoint}: legacy excluded, memory input used, clear removes headers, reload stays empty`, async (t) => {
      const { values } = fixture(t);
      let current = initializeCredentials();
      const requests = [];
      const service = ai.module.createAiService(api.module.createBackendClient({
        baseUrl: 'https://backend.example.invalid', production: true,
        fetch: async (url, init) => { requests.push({ url, headers: init.headers }); return Response.json(response); },
      }));
      const request = () => service[method]({ ...body, provider, model: 'fixture-model', ...credentialRequestOptions(current) });
      const emptyHeaders = { 'Content-Type': 'application/json', 'x-api-provider': provider, 'x-selected-model': 'fixture-model' };

      await request();
      assert.deepEqual(requests.at(-1).headers, emptyHeaders);

      for (const field of [...providers, 'accessCode']) current = updateCredential(current, field, `fixture-memory-${field}`);
      await request();
      assert.deepEqual(requests.at(-1).headers, { ...emptyHeaders,
        [`x-${provider}-api-key`]: `fixture-memory-${provider}`, 'x-access-code': 'fixture-memory-accessCode',
      });
      for (const key of legacyKeys) assert.ok(!values.has(key));

      current = updateCredential(current, provider, '');
      await request();
      assert.deepEqual(requests.at(-1).headers, { ...emptyHeaders, 'x-access-code': 'fixture-memory-accessCode' });
      current = updateCredential(current, 'accessCode', '');
      await request();
      assert.deepEqual(requests.at(-1).headers, emptyHeaders);

      current = initializeCredentials();
      assert.deepEqual(Object.values(current), ['', '', '', '', '']);
      await request();
      assert.deepEqual(requests.at(-1).headers, emptyHeaders);
      assert.ok(requests.every(({ url }) => url === 'https://backend.example.invalid' + endpoint));
    });
  }
}

test('React state updater is immutable and changes only the requested credential', (t) => {
  fixture(t);
  const previous = initializeCredentials();
  const next = updateCredential(previous, 'groq', 'fixture-memory-groq');
  assert.equal(previous.groq, '');
  assert.equal(next.groq, 'fixture-memory-groq');
  assert.deepEqual(Object.keys(next).filter((key) => next[key] !== previous[key]), ['groq']);
});

test('source permits legacy deletion only; no credential storage reads/writes or alternate persistence APIs', () => {
  const forbidden = /\b(?:getItem|setItem)\s*\(\s*['"]USER_(?:(?:GEMINI|OPENAI|GROQ|XAI)_API_KEY|ACCESS_CODE)['"]/;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:ts|tsx)$/.test(file)) {
        const contents = fs.readFileSync(file, 'utf8');
        assert.ok(!forbidden.test(contents), `credential storage operation: ${file}`);
        assert.ok(!/\b(?:sessionStorage|indexedDB)\b|document\.cookie/.test(contents), `alternate persistence: ${file}`);
        if (file !== path.join('src', 'services', 'credentials.ts')) {
          assert.ok(!legacyKeys.some((key) => contents.includes(key)), `legacy credential outside deletion migration: ${file}`);
        }
      }
    }
  }
  visit('src');
});

test('frontend artifact retains the Phase 1/2 protections and has no credential persistence', () => {
  assert.deepEqual(checkArtifacts().issues, []);
});
