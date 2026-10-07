export type BackendRequest = (endpoint: string, body: unknown, headers: Record<string, string>) => Promise<any>;

interface BackendClientOptions {
  baseUrl?: string;
  production: boolean;
  fetch?: typeof globalThis.fetch;
  storage?: Pick<Storage, "getItem">;
  timeoutMs?: number;
}

export function resolveBackendUrl(baseUrl: string | undefined, production: boolean, endpoint: string): string {
  if (!/^\/api\/[a-z-]+$/.test(endpoint)) throw new Error("잘못된 backend API 경로입니다.");
  const base = baseUrl?.trim() || "";
  if (!base) {
    if (production) throw new Error("Backend 설정 오류: VITE_API_BASE_URL이 필요합니다.");
    return endpoint;
  }
  try {
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol)
      || (production && url.protocol !== 'https:')
      || ['generativelanguage.googleapis.com', 'api.openai.com', 'api.groq.com', 'api.x.ai'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/+$/, "") + endpoint;
  } catch {
    throw new Error("Backend 설정 오류: VITE_API_BASE_URL에 유효한 backend URL을 설정해 주세요. 운영에서는 HTTPS가 필요합니다.");
  }
}

// Backend 응답 원문에는 키·학생 데이터가 포함될 수 있으므로 오류에는 원문을 사용하지 않습니다.
export function createBackendClient(options: BackendClientOptions): BackendRequest {
  return async (endpoint, body, headers) => {
    const url = resolveBackendUrl(options.baseUrl, options.production, endpoint);
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 120_000;
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Backend 응답 시간이 초과되었습니다. 다시 시도해 주세요."));
        controller.abort();
      }, timeoutMs);
    });
    const request = async () => {
      let response: Response;
      try {
        response = await (options.fetch ?? globalThis.fetch)(url, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...headers,
            "x-access-code": (options.storage ?? globalThis.localStorage)?.getItem("USER_ACCESS_CODE") || "",
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new Error("Backend에 연결하지 못했습니다. 서버 주소와 네트워크 상태를 확인해 주세요.");
      }
      if (!response.ok) {
        const detail = response.status === 401 || response.status === 403
          ? "접근 코드와 서버 접근 권한을 확인해 주세요."
          : "서버 설정 또는 AI 요청 처리 상태를 확인해 주세요.";
        throw new Error(`Backend 요청 실패 (HTTP ${response.status}). ${detail}`);
      }
      let result: unknown;
      try { result = await response.json(); }
      catch { throw new Error("Backend에서 유효한 JSON 응답을 받지 못했습니다."); }
      if (!result || typeof result !== "object" || "error" in result) {
        throw new Error("Backend에서 정상적인 결과 데이터를 받지 못했습니다.");
      }
      return result;
    };
    try { return await Promise.race([request(), timeout]); }
    finally { clearTimeout(timer!); }
  };
}

// 호출 시 설정을 읽어 UI를 열 수 있게 하고, 설정 오류는 AI 요청의 실패로 표시합니다.
export const requestBackend: BackendRequest = (endpoint, body, headers) => createBackendClient({
  baseUrl: import.meta.env?.VITE_API_BASE_URL,
  production: import.meta.env?.PROD ?? false,
})(endpoint, body, headers);
