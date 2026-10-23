import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const root = process.cwd();
const logs = [];
let providerCall;
let fetchCall;
const bundle = await build({ stdin: {
  contents: fs.readFileSync('server.ts', 'utf8') + '\nexport { withProviderDeadline, generateContentWithRetryAndFallback };',
  resolveDir: root, sourcefile: 'server.ts', loader: 'ts',
}, bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false,
  define: { 'process.env.NODE_ENV': '"test"' } });
const context = { exports: {}, module: { exports: {} }, process: { env: {} }, AbortController,
  setTimeout: (fn, ms) => setTimeout(fn, ms === 1000 ? 0 : Math.min(ms, 200)), clearTimeout,
  console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  fetch: (...args) => fetchCall(...args),
  require: name => {
    if (name === 'dotenv') return { config() {} };
    if (name === 'vite') return { createServer() { throw new Error('unexpected dev server'); } };
    if (name === '@google/genai') return { GoogleGenAI: class { models = { generateContent: (...args) => providerCall(...args) }; }, Type: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  },
};
vm.runInNewContext(bundle.outputFiles[0].text, context);
const { app, withProviderDeadline } = context.module.exports;
const students = Array.from({ length: 10 }, (_, index) => ({ id: `fixture-${index}`, name: `fixture-name-${index}`, number: String(index + 1), grades: {} }));
const good = student => ({ studentId: student.id, recordText: '관찰 활동에 참여함.', gradesSummary: 'fixture' });
async function route(endpoint, provider = 'openai', roster = students.slice(0, 2)) {
  const handler = app._router.stack.find(layer => layer.route?.path === endpoint).route.stack[0].handle;
  let status = 200, body;
  await handler({ headers: { 'x-api-provider': provider, 'x-selected-model': 'fixture-model',
    'x-openai-api-key': 'fixture-secret', 'x-groq-api-key': 'fixture-secret', 'x-xai-api-key': 'fixture-secret', 'x-gemini-api-key': 'fixture-secret' },
    body: { students: roster, criteria: [], config: {}, base64Image: 'fixture', mimeType: 'image/png', domain: 'fixture', topic: 'fixture', elements: ['fixture'] } },
    { status(value) { status = value; return this; }, json(value) { body = value; } });
  return { status, body };
}
function setup(reply) {
  logs.length = 0;
  fetchCall = async () => reply();
  providerCall = async () => { throw new Error('fixture-secret fixture-name'); };
}
const chat = text => Response.json({ choices: [{ message: { content: text } }] });
for (const provider of ['openai', 'groq', 'xai', 'gemini']) {
  test(`${provider}: normal records use requested IDs and names`, async () => {
    setup(() => chat(JSON.stringify(students.slice(0, 2).map(good))));
    providerCall = async () => ({ text: JSON.stringify(students.slice(0, 2).map(good)) });
    const { body } = await route('/api/generate-records', provider);
    assert.equal(body.results.length, 2);
    assert.ok(body.results.every(row => row.recordText && !row.error));
    assert.equal(body.results[0].studentName, students[0].name);
  });
  for (const [name, text] of [['invalid JSON', 'fixture-secret {'], ['empty text', ''], ['empty array', '[]'], ['missing result', '{}']]) {
    test(`${provider}: ${name} never becomes a successful record`, async () => {
      setup(() => chat(text)); providerCall = async () => ({ text });
      const { body } = await route('/api/generate-records', provider);
      assert.ok(body.results.every(row => row.error && row.recordText === ''));
      assert.ok(!JSON.stringify({ body, logs }).includes('fixture-secret'));
    });
  }
  for (const status of [429, 500, 503]) {
    test(`${provider}: HTTP ${status} is a safe total failure`, async () => {
      let calls = 0;
      setup(() => { calls++; return new Response('fixture-secret fixture-name', { status }); });
      providerCall = async () => { calls++; throw Object.assign(new Error('fixture-secret fixture-name'), { status }); };
      const { body } = await route('/api/generate-records', provider);
      assert.ok(body.results.every(row => row.error && !row.recordText));
      assert.equal(calls, provider === 'gemini' ? 2 : 1);
      assert.ok(!JSON.stringify({ body, logs }).includes('fixture-secret'));
    });
  }
  test(`${provider}: stalled provider times out and aborts`, async () => {
    let signal;
    setup(() => new Promise(() => {}));
    fetchCall = async (_, init) => { signal = init.signal; return new Promise(() => {}); };
    providerCall = async params => { signal = params.config.abortSignal; return new Promise(() => {}); };
    const { body } = await route('/api/generate-records', provider);
    assert.ok(body.results.every(row => row.error && !row.recordText));
    assert.equal(signal.aborted, true);
  });
}
test('partial row failure: omitted, empty, duplicate and foreign IDs are not successes', async () => {
  setup(() => chat(JSON.stringify([good(students[0]), { ...good(students[1]), recordText: ' ' },
    good(students[2]), good(students[2]), { studentId: 'foreign', recordText: 'fixture' }])));
  const { body } = await route('/api/generate-records', 'openai', students.slice(0, 5));
  assert.equal(body.results.filter(row => !row.error).length, 1);
  assert.equal(body.results.filter(row => row.error).length, 4);
});
test('one failed chunk preserves successful chunk', async () => {
  let calls = 0;
  setup(() => ++calls === 1 ? chat(JSON.stringify(students.slice(0, 8).map(good))) : new Response('fixture-secret', { status: 500 }));
  const { body } = await route('/api/generate-records', 'openai', students);
  assert.equal(body.results.filter(row => !row.error).length, 8);
  assert.equal(body.results.filter(row => row.error).length, 2);
});
test('deadline covers a stalled provider response body', async () => {
  setup(() => ({ ok: true, json: () => new Promise(() => {}) }));
  const { body } = await route('/api/generate-records');
  assert.ok(body.results.every(row => row.error));
});
test('deadline clears timer for fulfilled and rejected operations', async () => {
  assert.equal(await withProviderDeadline(async () => 7, 20), 7);
  await assert.rejects(withProviderDeadline(async () => { throw new Error('fixture'); }, 20));
});
for (const endpoint of ['/api/parse-table-image', '/api/generate-creative-recommendations', '/api/generate-creative-elements']) {
  test(`${endpoint}: malformed response fails safely`, async () => {
    setup(() => chat('fixture-secret {'));
    const { status, body } = await route(endpoint);
    assert.equal(status, 500);
    assert.ok(body.error);
    assert.ok(!JSON.stringify({ body, logs }).includes('fixture-secret'));
  });
}
const shared = await build({ entryPoints: ['src/services/recordResults.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { normalizeRecordResults, mergeRecordResults, recordOutcome } = await import('data:text/javascript;base64,' + Buffer.from(shared.outputFiles[0].text).toString('base64'));
test('frontend partial failure retains previous successful text and teacher edits', () => {
  const previous = normalizeRecordResults(students.slice(0, 2), students.slice(0, 2).map(good));
  previous[1].editedText = 'fixture-teacher-edit';
  const incoming = normalizeRecordResults(students.slice(0, 2), [{ ...good(students[0]), recordText: '새 활동에 참여함.' }]);
  const merged = mergeRecordResults(previous, incoming);
  assert.equal(merged[0].recordText, '새 활동에 참여함.');
  assert.equal(merged[1].recordText, previous[1].recordText);
  assert.equal(merged[1].editedText, 'fixture-teacher-edit');
  assert.ok(merged[1].error);
  assert.match(recordOutcome(incoming), /1명 성공, 1명 실패/);
});
test('frontend all failure retains prior results and reports total failure', () => {
  const previous = normalizeRecordResults(students, students.map(good));
  const failed = normalizeRecordResults(students, []);
  assert.ok(mergeRecordResults(previous, failed).every(row => row.recordText && row.error));
  assert.match(recordOutcome(failed), /모든 학생/);
  assert.equal(recordOutcome(previous), '');
});
test('frontend replaces arbitrary server errors with a fixed safe message', () => {
  const rows = normalizeRecordResults(students.slice(0, 1), [{ ...good(students[0]), error: 'fixture-secret fixture-name' }]);
  assert.ok(rows[0].error);
  assert.equal(rows[0].recordText, '');
  assert.ok(!JSON.stringify(rows).includes('fixture-secret'));
});

const clientBundle = await build({ entryPoints: ['src/services/apiClient.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createBackendClient } = await import('data:text/javascript;base64,' + Buffer.from(clientBundle.outputFiles[0].text).toString('base64'));
for (const status of [429, 500, 503]) {
  test(`frontend HTTP ${status} never leaks the response body`, async () => {
    const client = createBackendClient({ production: false,
      fetch: async () => new Response('fixture-secret fixture-name', { status }) });
    await assert.rejects(client('/api/generate-records', {}, {}), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.ok(!error.message.includes('fixture-secret'));
      assert.ok(!error.message.includes('fixture-name'));
      return true;
    });
  });
}
test('dashboard visibly distinguishes failed regeneration and retained text', async () => {
  const compiled = await build({ entryPoints: ['src/components/RecordsDashboard.tsx'], bundle: true,
    packages: 'external', platform: 'node', format: 'cjs', write: false });
  const scope = { module: { exports: {} }, exports: {}, require };
  vm.runInNewContext(compiled.outputFiles[0].text, scope);
  const React = require('react');
  const { renderToString } = require('react-dom/server');
  const previous = normalizeRecordResults(students.slice(0, 1), students.slice(0, 1).map(good));
  const rows = mergeRecordResults(previous, normalizeRecordResults(students.slice(0, 2), []));
  const html = renderToString(React.createElement(scope.module.exports.default, {
    records: rows, setRecords() {}, config: { maxLength: 1000, characterLimitType: 'char' },
    maskingStyle: 'none', isGenerating: false, onRegenerateAll() {},
  }));
  assert.match(html, /이번 AI 처리 실패/);
  assert.match(html, /아래 내용은 이전 결과입니다/);
  assert.match(html, /관찰 활동에 참여함/);
  assert.match(html, /생성된 결과가 없습니다/);
  assert.match(html, /id="btn-copy-record-fixture-1"[^>]*disabled=""/);
});
test('deleted A is removed while failed B retains text and teacher edits', () => {
  const prior = normalizeRecordResults(students.slice(0, 2), students.slice(0, 2).map(good));
  prior[1].editedText = 'fixture-teacher';
  const merged = mergeRecordResults(prior, normalizeRecordResults([students[1]], []));
  assert.deepEqual(merged.map(row => row.studentId), [students[1].id]);
  assert.equal(merged[0].editedText, 'fixture-teacher');
  assert.equal(merged[0].recordText, prior[1].recordText);
});
test('replaced roster and empty roster remove all old results', () => {
  const prior = normalizeRecordResults(students.slice(0, 2), students.slice(0, 2).map(good));
  const merged = mergeRecordResults(prior, normalizeRecordResults(students.slice(2, 4), []));
  assert.deepEqual(merged.map(row => row.studentId), students.slice(2, 4).map(row => row.id));
  assert.deepEqual(mergeRecordResults(prior, normalizeRecordResults([], [])), []);
});
test('successful regeneration deliberately replaces teacher edit; failure retains it', () => {
  const previous = normalizeRecordResults([students[0]], [good(students[0])]);
  previous[0].editedText = 'fixture-teacher';
  const result = mergeRecordResults(previous, normalizeRecordResults([students[0]], [{ ...good(students[0]), recordText: 'fixture-new' }]));
  assert.equal(result[0].recordText, 'fixture-new');
  assert.equal(result[0].editedText, undefined);
  assert.equal(previous[0].editedText, 'fixture-teacher');

});
for (const [label, roster] of [
  ['missing', [{ name: 'fixture' }]], ['empty', [{ id: '' }]], ['whitespace', [{ id: '  ' }]],
  ['duplicate', [students[0], students[0]]], ['non-string', [{ id: 3 }]], ['null', [null]],
]) {
  test(`invalid roster ${label}: HTTP 400 before either provider is called`, async () => {
    let calls = 0;
    fetchCall = providerCall = async () => { calls++; throw new Error('unexpected provider'); };
    for (const provider of ['openai', 'gemini']) {
      assert.equal((await route('/api/generate-records', provider, roster)).status, 400);
    }
    assert.equal(calls, 0);
    assert.throws(() => normalizeRecordResults(roster, [{ recordText: 'fixture' }]));
  });
}
test('AI missing, duplicate and external IDs cannot clone a result', () => {
  const rows = normalizeRecordResults(students.slice(0, 3), [
    { recordText: 'fixture-missing-id' }, good(students[0]), good(students[0]),
    { studentId: 'external', recordText: 'fixture-external' }, good(students[2]),
  ]);
  assert.ok(rows[0].error && rows[1].error);
  assert.equal(rows[2].recordText, good(students[2]).recordText);
});
test('Gemini temporary failure succeeds on second attempt with same model', async () => {
  let calls = 0;
  providerCall = async params => {
    assert.equal(params.model, 'fixture-model');
    if (++calls === 1) throw Object.assign(new Error('fixture'), { status: 503 });
    return { text: JSON.stringify(students.slice(0, 2).map(good)) };
  };
  const { body } = await route('/api/generate-records', 'gemini');
  assert.equal(calls, 2);
  assert.ok(body.results.every(row => !row.error));
});
test('Gemini non-retryable failure makes exactly one call', async () => {
  let calls = 0;
  providerCall = async () => { calls++; throw Object.assign(new Error('fixture'), { status: 401 }); };
  const { body } = await route('/api/generate-records', 'gemini');
  assert.equal(calls, 1);
  assert.ok(body.results.every(row => row.error));
});
test('60 second total budget includes retry wait and aborts the second attempt', async () => {
  let now = 0, sequence = 0, calls = 0, signal;
  const timers = new Map();
  const scope = { ...context, module: { exports: {} }, exports: {},
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(bundle.outputFiles[0].text, scope);
  const ai = { models: { generateContent: async params => {
    signal = params.config.abortSignal;
    if (++calls === 1) throw Object.assign(new Error('fixture'), { status: 503 });
    return new Promise(() => {});
  } } };
  const pending = scope.module.exports.generateContentWithRetryAndFallback(ai, { model: 'fixture' });
  const rejected = assert.rejects(pending, /AI_TIMEOUT/);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.ok([...timers.values()].some(timer => timer.at === 60000));
  assert.ok([...timers.values()].some(timer => timer.at === 1000));
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  }
  advance(1000);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(calls, 2);
  advance(58999);
  assert.equal(signal.aborted, false);
  advance(1);
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(timers.size, 0);
});
test('deleted A is absent from actual copy-all and CSV handlers', async () => {
  const React = require('react');
  let copied = '', csv = '';
  const compiled = await build({ entryPoints: ['src/components/RecordsDashboard.tsx'], bundle: true,
    packages: 'external', platform: 'node', format: 'cjs', write: false });
  const scope = { module: { exports: {} }, exports: {},
    require: name => name === 'react' ? { ...React, useState: value => [value, () => {}] } : require(name),
    navigator: { clipboard: { async writeText(value) { copied = value; } } },
    setTimeout() {}, Blob: class { constructor(parts) { csv = parts.join(''); } },
    URL: { createObjectURL: () => 'fixture' },
    document: { body: { appendChild() {}, removeChild() {} }, createElement: () => ({ setAttribute() {}, click() {} }) },
  };
  vm.runInNewContext(compiled.outputFiles[0].text, scope);
  const prior = normalizeRecordResults(students.slice(0, 2), students.slice(0, 2).map(good));
  prior[0].recordText = 'DELETED_FIXTURE';
  const rows = mergeRecordResults(prior, normalizeRecordResults([students[1]], []));
  const tree = scope.module.exports.default({ records: rows, setRecords() {}, config: {}, maskingStyle: 'none', isGenerating: false });
  function find(node, id) {
    if (!node || typeof node !== 'object') return;
    if (node.props?.id === id) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, id); if (found) return found; }
  }
  find(tree, 'btn-copy-all').props.onClick();
  find(tree, 'btn-export-csv').props.onClick();
  assert.ok(copied.includes(rows[0].recordText) && csv.includes(rows[0].recordText));
  assert.ok(!copied.includes('DELETED_FIXTURE') && !csv.includes('DELETED_FIXTURE'));
});
test('Gemini does not start a retry after the total deadline expires during backoff', async () => {
  let now = 0, sequence = 0, calls = 0;
  const timers = new Map();
  const scope = { ...context, module: { exports: {} }, exports: {},
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(bundle.outputFiles[0].text, scope);
  const ai = { models: { generateContent: () => {
    calls++;
    return new Promise((_, reject) => scope.setTimeout(() => reject({ status: 503 }), 59500));
  } } };
  const result = scope.module.exports.generateContentWithRetryAndFallback(ai, { model: 'fixture' });
  const rejected = assert.rejects(result, /AI_TIMEOUT/);
  async function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    for (let i = 0; i < 30; i++) await Promise.resolve();
  }
  await advance(59500);
  await advance(500);
  await rejected;
  await advance(500);
  assert.equal(calls, 1);
});
const generationBundle = await build({ entryPoints: ['src/services/recordGeneration.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createRecordGenerationController } = await import('data:text/javascript;base64,' + Buffer.from(generationBundle.outputFiles[0].text).toString('base64'));
function generationFixture() {
  const roster = students.slice(0, 2);
  const state = { students: roster, records: normalizeRecordResults(roster, roster.map(good)), editVersions: new Map() };
  const requests = [], confirms = [], outcomes = [], pending = [];
  const run = createRecordGenerationController();
  let accepted = true;
  const options = { getState: () => state,
    confirm(message) { confirms.push(message); return accepted; },
    request: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    apply(update) { state.records = update(state.records); },
    outcome: message => outcomes.push(message), pending: value => pending.push(value) };
  return { state, requests, confirms, outcomes, pending, options,
    start: () => run(options), accept: value => { accepted = value; },
    save(id, text) { state.editVersions.set(id, (state.editVersions.get(id) ?? 0) + 1);
      state.records = state.records.map(row => row.studentId === id ? { ...row, editedText: text } : row); },
    success(index = 0) { requests[index].resolve(roster.map(student => ({ ...good(student), recordText: `fixture-new-${index}` }))); },
  };
}
test('execution: existing edits require confirmation; cancel leaves results and API untouched', async () => {
  const f = generationFixture(); f.save(students[0].id, 'teacher-before'); f.accept(false);
  const before = f.state.records;
  await f.start();
  assert.equal(f.confirms.length, 1); assert.equal(f.requests.length, 0);
  assert.equal(f.state.records, before); assert.deepEqual(f.pending, []);
});
test('execution: no edits means no confirmation', async () => {
  const f = generationFixture(); const run = f.start(); f.success(); await run;
  assert.equal(f.confirms.length, 0); assert.equal(f.state.records[0].recordText, 'fixture-new-0');
});
test('execution: confirmed success replaces pre-request teacher edit', async () => {
  const f = generationFixture(); f.save(students[0].id, 'teacher-before');
  const run = f.start(); f.success(); await run;
  assert.equal(f.confirms.length, 1); assert.equal(f.state.records[0].editedText, undefined);
  assert.equal(f.state.records[0].recordText, 'fixture-new-0');
});
test('execution: confirmed request failure retains teacher edit and safe error', async () => {
  const f = generationFixture(); f.save(students[0].id, 'teacher-before');
  const run = f.start(); f.requests[0].reject(new Error('fixture-secret')); await run;
  assert.equal(f.state.records[0].editedText, 'teacher-before'); assert.ok(f.state.records[0].error);
  assert.ok(!f.outcomes.join('').includes('fixture-secret'));
});
test('execution: saving one student during request protects edits while applying other success', async () => {
  const f = generationFixture(); const run = f.start();
  f.save(students[0].id, 'teacher-during'); f.success(); await run;
  assert.equal(f.state.records[0].editedText, 'teacher-during');
  assert.equal(f.state.records[1].recordText, 'fixture-new-0');
});
test('execution: re-saving the same edit during a confirmed request still protects it', async () => {
  const f = generationFixture(); f.save(students[0].id, 'teacher-same');
  const run = f.start(); f.save(students[0].id, 'teacher-same'); f.success(); await run;
  assert.equal(f.state.records[0].editedText, 'teacher-same');
});
test('execution: deletion and replacement during request never restore removed students', async () => {
  const f = generationFixture(); const run = f.start(); f.save(students[0].id, 'teacher-during');
  f.state.students = [students[1], students[2]]; f.success(); await run;
  assert.deepEqual(f.state.records.map(row => row.studentId), [students[1].id]);
});
test('execution: newest response wins even if older success arrives last', async () => {
  const f = generationFixture(); const first = f.start(), second = f.start();
  f.success(1); await second; f.success(0); await first;
  assert.ok(f.state.records.every(row => row.recordText === 'fixture-new-1'));
  assert.deepEqual(f.pending, [true, true, false]);
});
test('execution: older failure cannot mark newer successful results failed', async () => {
  const f = generationFixture(); const first = f.start(), second = f.start();
  f.success(1); await second; f.requests[0].reject(new Error('fixture-secret')); await first;
  assert.ok(f.state.records.every(row => !row.error && row.recordText === 'fixture-new-1'));
});
test('execution: delayed React updater reads latest edit revision and previous state', async () => {
  const f = generationFixture(); let queued;
  f.options.apply = update => { queued = update; };
  const run = f.start(); f.success(); await run;
  f.save(students[0].id, 'teacher-after-response-before-updater');
  f.state.records = queued(f.state.records);
  assert.equal(f.state.records[0].editedText, 'teacher-after-response-before-updater');
});
