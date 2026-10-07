import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { transform } from "esbuild";
// Compile the real TypeScript modules in memory using the existing build dependency.
// No tsx temp directory, additional dependency, or generated source files are needed.
async function moduleUrl(file) {
  const result = await transform(fs.readFileSync(file, "utf8"), { loader: "ts", format: "esm", target: "es2022" });
  return "data:text/javascript;base64," + Buffer.from(result.code).toString("base64");
}
const apiClientUrl = await moduleUrl("src/services/apiClient.ts");
const { createBackendClient, resolveBackendUrl } = await import(apiClientUrl);
const serviceCode = await transform(fs.readFileSync("src/services/aiService.ts", "utf8"), { loader: "ts", format: "esm", target: "es2022" });
assert.ok(serviceCode.code.includes('"./apiClient"'));
const { createAiService } = await import("data:text/javascript;base64," + Buffer.from(serviceCode.code.replace('"./apiClient"', JSON.stringify(apiClientUrl))).toString("base64"));

const backend = "https://backend.example.invalid";
const providers = ["gemini", "openai", "groq", "xai"];
// Synthetic fixtures only; these strings are not credentials or student records.
const options = {
  model: "fixture-model", geminiKey: "fixture-gemini", openaiKey: "fixture-openai",
  groqKey: "fixture-groq", xaiKey: "fixture-xai",
  base64Image: "Zml4dHVyZQ==", mimeType: "image/png",
  evaluationMode: "subject", criteria: [{ id: "fixture-criterion" }],
  students: [{ id: "fixture-student" }], config: {},
  domain: "fixture-domain", topic: "fixture-topic", element: "fixture-element",
  tone: "noun", maxLength: 100, creativityLevel: "low", additionalInstructions: "",
};
const routes = [
  { method: "clientParseTableImage", endpoint: "/api/parse-table-image", response: { students: [] },
    body: { base64Image: options.base64Image, mimeType: options.mimeType } },
  { method: "clientGenerateRecords", endpoint: "/api/generate-records", response: { results: [{ recordText: "fixture-result" }] },
    body: { evaluationMode: options.evaluationMode, criteria: options.criteria, students: options.students, config: options.config } },
  { method: "clientGenerateCreativeRecommendations", endpoint: "/api/generate-creative-recommendations", response: { results: [{ recommendedText: "fixture-result" }] },
    body: { domain: options.domain, topic: options.topic, element: options.element, elements: [options.element], tone: options.tone,
      maxLength: options.maxLength, creativityLevel: options.creativityLevel, additionalInstructions: options.additionalInstructions } },
  { method: "clientGenerateCreativeElements", endpoint: "/api/generate-creative-elements", response: { elements: ["fixture-element"] },
    body: { domain: options.domain, topic: options.topic } },
];

for (const provider of providers) {
  for (const route of routes) {
    test(`${provider}: ${route.endpoint} routes to backend with only the selected key`, async () => {
      const calls = [];
      const service = createAiService(createBackendClient({
        baseUrl: backend + "/", production: true,
        storage: { getItem: (key) => { assert.equal(key, "USER_ACCESS_CODE"); return "fixture-access"; } },
        fetch: async (url, init) => {
          calls.push({ url: String(url), init });
          return Response.json(route.response);
        },
      }));
      const result = await service[route.method]({ ...options, provider });
      assert.deepEqual(result, route.method === "clientParseTableImage" ? route.response
        : "results" in route.response ? route.response.results : route.response.elements);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, backend + route.endpoint);
      assert.equal(calls[0].init.method, "POST");
      assert.equal(calls[0].init.redirect, "error");
      assert.deepEqual(JSON.parse(calls[0].init.body), route.body);
      assert.deepEqual(calls[0].init.headers, {
        "Content-Type": "application/json", "x-api-provider": provider, "x-selected-model": options.model,
        [`x-${provider}-api-key`]: `fixture-${provider}`, "x-access-code": "fixture-access",
      });
    });

    const failures = [
      { name: "network failure", reply: () => { throw new Error("sensitive fixture error"); }, error: /Backend에 연결/ },
      ...[401, 403, 404, 405, 500, 503].map((status) => ({
        name: `HTTP ${status}`, reply: () => new Response("sensitive fixture error", { status }), error: new RegExp(`HTTP ${status}`),
      })),
      { name: "invalid JSON / SPA HTML", reply: () => new Response("<html>fixture</html>"), error: /유효한 JSON/ },
      { name: "error JSON with HTTP 200", reply: () => Response.json({ error: "sensitive fixture error" }), error: /정상적인 결과/ },
      { name: "missing result", reply: () => Response.json({}), error: /정상적으로 수신/ },
      { name: "timeout", reply: () => new Promise(() => {}), error: /시간이 초과/ },
    ];
    for (const failure of failures) {
      test(`${provider}: ${route.endpoint} rejects ${failure.name} with no fallback`, async () => {
        const urls = [];
        const service = createAiService(createBackendClient({
          baseUrl: backend, production: true, timeoutMs: 25, storage: { getItem: () => "" },
          fetch: async (url) => { urls.push(String(url)); return failure.reply(); },
        }));
        await assert.rejects(service[route.method]({ ...options, provider }), (error) => {
          assert.match(error.message, failure.error);
          assert.ok(!error.message.includes("sensitive fixture error"));
          return true;
        });
        assert.deepEqual(urls, [backend + route.endpoint]);
      });
    }
  }
}

test("development retains same-origin Express or an explicit localhost backend", () => {
  assert.equal(resolveBackendUrl(undefined, false, "/api/generate-records"), "/api/generate-records");
  assert.equal(resolveBackendUrl("http://localhost:3000/", false, "/api/generate-records"), "http://localhost:3000/api/generate-records");
  assert.equal(resolveBackendUrl(backend + "/prefix/", true, "/api/generate-records"), backend + "/prefix/api/generate-records");
});

for (const baseUrl of [undefined, "", "relative", "//backend.invalid", "http://backend.invalid", "javascript:fixture", "https://user:password@backend.invalid", backend + "?key=fixture", backend + "#fixture",
  ...['generativelanguage.googleapis.com', 'api.openai.com', 'api.groq.com', 'api.x.ai'].map((host) => `https://${host}`)]) {
  test(`production rejects invalid/missing base URL (${String(baseUrl)}) before any network call`, async () => {
    let calls = 0;
    const service = createAiService(createBackendClient({ baseUrl, production: true, fetch: async () => { calls++; throw new Error(); } }));
    for (const route of routes) await assert.rejects(service[route.method]({ ...options, provider: "gemini" }), /Backend 설정 오류/);
    assert.equal(calls, 0);
  });
}

test("timeout also covers a stalled JSON response body", async () => {
  const client = createBackendClient({ baseUrl: backend, production: true, timeoutMs: 25, storage: { getItem: () => "" },
    fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }),
  });
  await assert.rejects(client("/api/generate-records", {}, {}), /시간이 초과/);
});

test("compiled production import.meta.env uses VITE_API_BASE_URL and fails when missing", async (t) => {
  const originalFetch = globalThis.fetch;
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else delete globalThis.localStorage;
  });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "" } });
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(String(url)); return Response.json({ results: ["fixture"] }); };
  for (const baseUrl of [backend, undefined, "invalid"]) {
    const compiled = await transform(fs.readFileSync("src/services/apiClient.ts", "utf8"), {
      loader: "ts", format: "esm", target: "es2022",
      define: { "import.meta.env": JSON.stringify({ PROD: true, VITE_API_BASE_URL: baseUrl }) },
    });
    const runtime = await import("data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64"));
    if (baseUrl === backend) await runtime.requestBackend("/api/generate-records", {}, {});
    else await assert.rejects(runtime.requestBackend("/api/generate-records", {}, {}), /Backend 설정 오류/);
  }
  assert.deepEqual(urls, [backend + "/api/generate-records"]);
});
