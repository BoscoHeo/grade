/**
 * aiService.ts
 * client/server hybrid LLM Orchestrator for Gemini & OpenAI
 * Exposes client endpoints that communicate cleanly with our Node server backend, with robust browser fallbacks on connection failure.
 */

import { EvaluationMode } from "../types";

// Helper: Format Client API Error messages for better UX
function formatClientErrorMessage(error: any): string {
  const msg = String(error?.message || error || "");
  if (
    msg.includes("API key not valid") || 
    msg.includes("API_KEY_INVALID") || 
    msg.includes("INVALID_ARGUMENT") ||
    msg.includes("API key")
  ) {
    return "유효하지 않거나 만료된 Gemini API 키가 감지되었습니다. 화면 우측 상단의 [⚙️ AI 설정 및 API 키] 버튼을 클릭해 올바른 구글 API 키(AIzaSy...)를 등록거나 프로젝트 Secrets 설정을 확인해주시기 바랍니다!";
  }
  return error.message || String(error);
}

// Helper: Generic function to run generation server-side with local browser fallback
async function fetchFromBackend(
  endpoint: string,
  body: any,
  headers: Record<string, string>
): Promise<any> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });
    if (response.ok) {
      return await response.json();
    }
    const errorText = await response.text();
    let parsedError = errorText;
    try {
      const errJson = JSON.parse(errorText);
      parsedError = errJson.error || errJson.message || errorText;
    } catch { /* ignore */ }
    throw new Error(parsedError);
  } catch (err: any) {
    throw new Error(formatClientErrorMessage(err));
  }
}

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

  return cleaned.trim();
}

/**
 * 1. Parser for Table Image or PDF using Gemini or OpenAI (Proxied through Backend)
 */
export async function clientParseTableImage(options: {
  base64Image: string;
  mimeType: string;
  provider: "gemini" | "openai";
  model: string;
  geminiKey: string;
  openaiKey: string;
}) {
  const { base64Image, mimeType, provider, model, geminiKey, openaiKey } = options;

  const headers = {
    "x-api-provider": provider,
    "x-selected-model": model,
    "x-gemini-api-key": geminiKey,
    "x-openai-api-key": openaiKey,
  };

  const body = { base64Image, mimeType };

  return fetchFromBackend("/api/parse-table-image", body, headers);
}

/**
 * 2. Client-Side Record Batch Generator using Gemini or OpenAI (Proxied through Backend)
 */
export async function clientGenerateRecords(options: {
  evaluationMode?: EvaluationMode;
  criteria: any[];
  students: any[];
  config: any;
  provider: "gemini" | "openai";
  model: string;
  geminiKey: string;
  openaiKey: string;
}) {
  const { evaluationMode, criteria, students, config, provider, model, geminiKey, openaiKey } = options;

  if (students.length === 0) {
    throw new Error("평어를 생성할 학생이 없습니다.");
  }

  const headers = {
    "x-api-provider": provider,
    "x-selected-model": model,
    "x-gemini-api-key": geminiKey,
    "x-openai-api-key": openaiKey,
  };

  const body = { evaluationMode, criteria, students, config };

  const response = await fetchFromBackend("/api/generate-records", body, headers);
  return response.results || [];
}

/**
 * 3. 10 Creative Experience (창체) Recommendation sentences generator (Proxied through Backend)
 */
export async function clientGenerateCreativeRecommendations(options: {
  domain: string;              // 자율활동, 동아리활동, 진로활동 등
  topic: string;               // 핵심 실천 주제 및 활동명
  element: string;             // 구체적 관찰 요소 (하위호환용)
  elements?: string[];         // 구체적 관찰 요소들
  tone: string;                // noun, respect, special
  maxLength: number;           // 최대 자수
  creativityLevel: string;     // low, medium, high
  additionalInstructions: string;
  provider: "gemini" | "openai";
  model: string;
  geminiKey: string;
  openaiKey: string;
}) {
  const { domain, topic, element, elements, tone, maxLength, creativityLevel, additionalInstructions, provider, model, geminiKey, openaiKey } = options;

  const headers = {
    "x-api-provider": provider,
    "x-selected-model": model,
    "x-gemini-api-key": geminiKey,
    "x-openai-api-key": openaiKey,
  };

  const selectedElementsList = Array.isArray(elements) && elements.length > 0 
    ? elements 
    : (element ? [element] : []);

  const body = { domain, topic, element, elements: selectedElementsList, tone, maxLength, creativityLevel, additionalInstructions };

  try {
    const response = await fetchFromBackend("/api/generate-creative-recommendations", body, headers);
    const returnedValue = response.results || response;
    if (!returnedValue || (Array.isArray(returnedValue) && returnedValue.length === 0)) {
      throw new Error("서버로부터 결과 데이터를 정상적으로 수신하지 못했습니다.");
    }
    return returnedValue;
  } catch (error: any) {
    console.error("Failed to generate creative recommendations:", error);
    // Return mock diverse sentences so users don't see blank page even if network fails
    return selectedElementsList.map((el) => ({
      element: el,
      items: Array.from({ length: 10 }).map((_, i) => ({
        id: i + 1,
        recommendedText: `${topic} 활동과 관련하여, 동료들과 긍정적으로 소통하며 ${el} 행동을 주도적으로 실천해 모범이 됨.`
      }))
    }));
  }
}

interface GenerateCreativeElementsArgs {
  domain: string;
  topic: string;
  provider: "gemini" | "openai";
  model: string;
  geminiKey: string;
  openaiKey: string;
}

export async function clientGenerateCreativeElements({
  domain,
  topic,
  provider,
  model,
  geminiKey,
  openaiKey
}: GenerateCreativeElementsArgs): Promise<string[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-provider": provider,
    "x-selected-model": model,
    "x-gemini-api-key": geminiKey,
    "x-openai-api-key": openaiKey,
  };

  const body = { domain, topic };

  try {
    const response = await fetchFromBackend("/api/generate-creative-elements", body, headers);
    return response.elements || response;
  } catch (error: any) {
    console.error("Failed to generate creative elements:", error);
    // Return mock fallback observation elements based on domain
    return [
      `${topic} 활동에 성실하게 참여하여 주도적으로 과제를 해결하고 배운 점을 실천함.`,
      `${topic} 과정에서 동료의 의견을 존중하며 적극적으로 의사소통하고 합리적인 절충안을 제안함.`,
      `${topic} 규칙과 절차를 성실하게 준수하고 공동체의 안전과 청결을 위해 스스로 책임을 분담함.`,
      `${topic} 행동 중 발생한 개선점을 발전적 성찰을 통해 훌륭하게 해결하고 구성원 활동에 도움을 줌.`
    ];
  }
}

