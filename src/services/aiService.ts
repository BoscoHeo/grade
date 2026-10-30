import { AI_SUSPENDED_RESULT } from './aiSuspension';

// Emergency boundary: never inspect inputs, access storage, or perform network I/O.
export async function clientGenerateRecords(_input?: unknown) { return AI_SUSPENDED_RESULT; }
export async function clientGenerateCreativeRecommendations(_input?: unknown) { return AI_SUSPENDED_RESULT; }
export async function clientGenerateCreativeElements(_input?: unknown) { return AI_SUSPENDED_RESULT; }
export async function clientParseTableImage(_input?: unknown) { return AI_SUSPENDED_RESULT; }

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
