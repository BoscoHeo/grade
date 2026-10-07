/** All browser AI requests use the backend; provider calls belong to server.ts. */
import type { EvaluationMode } from "../types";
import { requestBackend, type BackendRequest } from "./apiClient";

export type AIProvider = "gemini" | "openai" | "groq" | "xai";
interface ProviderOptions {
  provider: AIProvider;
  model: string;
  geminiKey: string;
  openaiKey: string;
  groqKey?: string;
  xaiKey?: string;
}

interface ParseTableImageOptions extends ProviderOptions {
  base64Image: string;
  mimeType: string;
}

interface GenerateRecordsOptions extends ProviderOptions {
  evaluationMode?: EvaluationMode;
  criteria: any[];
  students: any[];
  config: any;
}

interface CreativeRecommendationsOptions extends ProviderOptions {
  domain: string;              // 자율활동, 동아리활동, 진로활동 등
  topic: string;               // 핵심 실천 주제 및 활동명
  element: string;             // 구체적 관찰 요소 (하위호환용)
  elements?: string[];         // 구체적 관찰 요소들
  tone: string;                // noun, respect, special
  maxLength: number;           // 최대 자수
  creativityLevel: string;     // low, medium, high
  additionalInstructions: string;
}

interface GenerateCreativeElementsArgs extends ProviderOptions {
  domain: string;
  topic: string;
}

function providerHeaders(options: ProviderOptions): Record<string, string> {
  const keys = {
    gemini: options.geminiKey,
    openai: options.openaiKey,
    groq: options.groqKey,
    xai: options.xaiKey,
  };
  if (!Object.hasOwn(keys, options.provider)) throw new Error("지원하지 않는 AI provider입니다.");
  return {
    "x-api-provider": options.provider,
    "x-selected-model": options.model,
    [`x-${options.provider}-api-key`]: keys[options.provider]?.trim() || "",
  };
}

function resultsArray(response: any, field: "results" | "elements"): any[] {
  const result = response[field] ?? response;
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("서버로부터 결과 데이터를 정상적으로 수신하지 못했습니다.");
  }
  return result;
}

// Injectable backend transport keeps tests on the same paths used by the UI.
export function createAiService(request: BackendRequest) {
  return {
    async clientParseTableImage(options: ParseTableImageOptions) {
      const { base64Image, mimeType } = options;
      const response = await request("/api/parse-table-image", { base64Image, mimeType }, providerHeaders(options));
      if (!Array.isArray(response.students)) throw new Error("서버로부터 학생 표 데이터를 정상적으로 수신하지 못했습니다.");
      return response;
    },
    async clientGenerateRecords(options: GenerateRecordsOptions) {
      const { evaluationMode, criteria, students, config } = options;
      if (students.length === 0) throw new Error("평어를 생성할 학생이 없습니다.");
      const response = await request("/api/generate-records", { evaluationMode, criteria, students, config }, providerHeaders(options));
      return resultsArray(response, "results");
    },
    async clientGenerateCreativeRecommendations(options: CreativeRecommendationsOptions) {
      const { domain, topic, element, elements, tone, maxLength, creativityLevel, additionalInstructions } = options;
      const selectedElementsList = Array.isArray(elements) && elements.length > 0 ? elements : (element ? [element] : []);
      const response = await request("/api/generate-creative-recommendations", {
        domain, topic, element, elements: selectedElementsList, tone, maxLength, creativityLevel, additionalInstructions,
      }, providerHeaders(options));
      return resultsArray(response, "results");
    },
    async clientGenerateCreativeElements(options: GenerateCreativeElementsArgs): Promise<string[]> {
      const { domain, topic } = options;
      const response = await request("/api/generate-creative-elements", { domain, topic }, providerHeaders(options));
      const elements = resultsArray(response, "elements");
      if (elements.some((element) => typeof element !== "string")) throw new Error("서버로부터 관찰요소 데이터를 정상적으로 수신하지 못했습니다.");
      return elements;
    },
  };
}

export const {
  clientParseTableImage,
  clientGenerateRecords,
  clientGenerateCreativeRecommendations,
  clientGenerateCreativeElements,
} = createAiService(requestBackend);

// Helper: Sanitize pronouns or names from generated records
export function sanitizeRecordText(text: string, studentName?: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  // Strips structural pronouns/indicators at the start of sentences
  const prefixRegex = /^(이\s*학생은|이\s*아동은|본\s*아동은|본\s*학생은|상기\s*학생은|상기\s*아동은|해당\s*학생은|해당\s*아동은|이\s*학습자는|학습자는|이\s*학생|이\s*아동|본\s*아동|본\s*학생|그는|그녀는|상기\s*학생)\s*/;
  cleaned = cleaned.replace(prefixRegex, "");

  if (studentName) {
    const escapedName = studentName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const namePrefixRegex = new RegExp(`^(${escapedName}\\s*학생은|${escapedName}\\s*아동은|${escapedName}은|${escapedName}는|${escapedName}이)\\s*`);
    cleaned = cleaned.replace(namePrefixRegex, "");
  }

  // 수학 연산 기호 치환 수동 보정 (서버측 규칙 동기화)
  cleaned = cleaned
    .replace(/\+/g, " 덧셈 ")
    .replace(/(?<!\w)-(?!\w|\d)/g, " 뺄셈 ")
    .replace(/\s*[xX*]\s*/g, " 곱셈 ")
    .replace(/\s*\/\s*/g, " 나눗셈 ")
    .replace(/\s*=\s*/g, " 등호 ");

  return cleaned.trim();
}
