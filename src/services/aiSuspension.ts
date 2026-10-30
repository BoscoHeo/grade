export const AI_SUSPENDED_MESSAGE = '개인정보와 API 키 보호를 위한 보안 점검으로 AI 생성·재생성·재시도 및 이미지/PDF 분석을 일시 중지했습니다. 수동 입력·표 붙여넣기·기존 결과 편집·복사·CSV·창체 보관함은 계속 이용할 수 있습니다.';
export const AI_SUSPENDED_RESULT = Object.freeze({
  ok: false as const, code: 'AI_TEMPORARILY_DISABLED' as const, message: AI_SUSPENDED_MESSAGE,
});

// Exact legacy credential names only. Never read values or clear all storage.
const credentialKeys = [
  'USER_GEMINI_API_KEY', 'USER_OPENAI_API_KEY', 'USER_GROQ_API_KEY',
  'USER_XAI_API_KEY', 'USER_ACCESS_CODE',
] as const;
const cleaned = new WeakSet<object>();
export function removeLegacyCredentials(storage: Pick<Storage, 'removeItem'>): boolean {
  if (cleaned.has(storage)) return true;
  let complete = true;
  for (const key of credentialKeys) {
    try { storage.removeItem(key); } catch { complete = false; }
  }
  if (complete) cleaned.add(storage);
  return complete;
}
