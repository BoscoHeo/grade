export interface PageCredentials {
  gemini: string;
  openai: string;
  groq: string;
  xai: string;
  accessCode: string;
}

const legacyKeys = [
  "USER_GEMINI_API_KEY", "USER_OPENAI_API_KEY", "USER_GROQ_API_KEY", "USER_XAI_API_KEY", "USER_ACCESS_CODE",
];

// Never read or restore legacy values. StrictMode may initialize twice; removal is idempotent.
export function initializeCredentials(storage?: Pick<Storage, "removeItem">): PageCredentials {
  for (const key of legacyKeys) {
    try { (storage ?? globalThis.localStorage)?.removeItem(key); }
    catch { /* Unavailable storage must not prevent empty, memory-only initialization. */ }
  }
  return { gemini: "", openai: "", groq: "", xai: "", accessCode: "" };
}

export function updateCredential(current: PageCredentials, field: keyof PageCredentials, value: string): PageCredentials {
  return { ...current, [field]: value };
}

export function credentialRequestOptions(credentials: PageCredentials) {
  return {
    geminiKey: credentials.gemini, openaiKey: credentials.openai,
    groqKey: credentials.groq, xaiKey: credentials.xai, accessCode: credentials.accessCode,
  };
}
