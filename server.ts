import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

// Initialize environment variables
dotenv.config();

const app = express();
app.disable("x-powered-by");
const PORT = 3000;

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com; frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://*.gcp.cx;"
  );
  
  // Set X-Frame-Options to SAMEORIGIN, but verify if we are in development inside AI Studio to prevent bounding boxes block
  if (process.env.NODE_ENV !== "production") {
    // In dev, let are frame ancestors do the work and don't send X-Frame-Options since older frame rules can block preview
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  } else {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  
  next();
});

// Enable JSON parsing for api endpoints with limits for base64 image uploads
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Lazy initializer for Google Gen AI
let aiInstance: GoogleGenAI | null = null;
function getGenAI(req?: express.Request): GoogleGenAI {
  // Check header first for user override
  const customKey = req?.headers["x-gemini-api-key"] as string;
  const apiKey = (customKey && customKey.trim()) || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined and no custom key is provided.");
  }
  
  // Create a localized instance if it is a custom key, otherwise reuse global
  if (customKey && customKey.trim()) {
    return new GoogleGenAI({
      apiKey: customKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build-custom",
        },
      },
    });
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Helper: Format Server API Error messages for better UX
function formatServerErrorMessage(error: any): string {
  const msg = String(error?.message || error || "");
  if (
    msg.includes("API key not valid") || 
    msg.includes("API_KEY_INVALID") || 
    msg.includes("INVALID_ARGUMENT") ||
    msg.includes("API key")
  ) {
    return "유효하지 않거나 만료된 Gemini API 키가 감지되었습니다. 원활한 평어 분석 및 생성을 위해 화면 우측 상단의 [⚙️ AI 설정 및 API 키] 버튼을 클릭해 올바른 구글 API 키(AIzaSy...)를 등록하거나 프로젝트 Secrets 설정을 확인해주시기 바랍니다!";
  }
  return error.message || "오류가 발생했습니다.";
}

/**
 * Call Gemini with automatic retry on temporary errors (503, 429, UNAVAILABLE)
 * using exponential backoff, and fallback to alternative models if the primary model is overloaded.
 */
async function generateContentWithRetryAndFallback(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 2
): Promise<GenerateContentResponse> {
  // Shorter, fast list of fallback models to prevent cascading wait times
  const modelsToTry = [
    params.model,
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro"
  ];
  // Ensure unique models in case params.model is already one of the fallbacks
  const uniqueModels = Array.from(new Set(modelsToTry));

  let lastError: any = null;

  for (const currentModel of uniqueModels) {
    let delay = 1000; // initial backoff delay 1 second
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini] Attempting ${currentModel} - attempt ${attempt}/${maxRetries}`);
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: params.contents,
          config: params.config,
        });
        console.log(`[Gemini] Success with model ${currentModel}`);
        return response;
      } catch (error: any) {
        lastError = error;
        const errStr = String(error.message || error);
        
        // Quota exceed / Daily limit exhausted / Too many requests
        const isQuotaExceeded = 
          errStr.includes("429") || 
          errStr.toLowerCase().includes("quota") || 
          errStr.toLowerCase().includes("exhausted") || 
          errStr.toLowerCase().includes("limit");

        if (isQuotaExceeded) {
          console.warn(`[Gemini Error] Quota exceeded on ${currentModel}. Breaking to try next fallback model: ${errStr}`);
          // Break the attempt loop to try the fallback model immediately
          break;
        }

        const isTemporary = 
          errStr.includes("503") || 
          errStr.includes("UNAVAILABLE") || 
          errStr.includes("high demand") || 
          errStr.includes("overloaded") ||
          errStr.includes("temp") ||
          (error.status && (error.status === 503 || error.status === "UNAVAILABLE"));

        if (isTemporary) {
          console.warn(
            `[Gemini Warning] Temporary error on ${currentModel} (attempt ${attempt}): ${errStr}. Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        } else {
          console.error(`[Gemini Error] Non-retriable error on ${currentModel}: ${errStr}`);
          // Break the attempt loop to try the fallback model immediately
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Gemini generation attempts and fallback models failed.");
}

/**
 * Call OpenAI Chat Completion API spec
 */
async function generateContentWithOpenAI(
  apiKey: string,
  model: string,
  messages: { role: string; content: string | any[] }[],
  options: {
    responseMimeType?: string;
    temperature?: number;
  } = {}
): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey.trim()}`
  };

  const bodyData: any = {
    model: model,
    messages: messages,
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
  };

  if (options.responseMimeType === "application/json") {
    bodyData["response_format"] = { type: "json_object" };
  }

  console.log(`[OPENAI] Requesting model ${model} at ${url}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OPENAI Error]`, errorText);
    throw new Error(`OpenAI API returned error status ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  if (payload.choices && payload.choices[0] && payload.choices[0].message) {
    return payload.choices[0].message.content || "";
  } else {
    throw new Error(`Invalid response format from OpenAI: ${JSON.stringify(payload)}`);
  }
}

// REST API Endpoints

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    time: new Date().toISOString(),
    hasServerKey: !!process.env.GEMINI_API_KEY
  });
});

// 2. Parse table image or PDF to structured JSON
app.post("/api/parse-table-image", async (req, res) => {
  try {
    const { base64Image, mimeType } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: "No image/document content provided." });
    }

    const provider = (req.headers["x-api-provider"] as string) || "gemini";
    const selectedModel = (req.headers["x-selected-model"] as string) || "gemini-3.1-flash-lite";
    
    const prompt = `성적표 또는 수행평가 일람표 이미지/PDF 파일을 정밀 분석하여 학년, 학기, 과목 정보 및 학생들의 평가 등급 데이터를 정밀하게 JSON으로 추출해주세요.
추출 기준:
- 과목명 (예: 국어, 수학 등)
- 학년 및 학기 (예: "6학년 1학기", "6학년 1반")
- 성취기준/평가기준 및 영역 (있다면 추출)
- 학생 목록: 번호, 이름 및 각 평가 영역별 성취 수준/등급("매우 잘함", "잘함", "보통", "노력요함" 또는 "A", "B", "C" 등등 문서에 성적 등급으로 표시된 단어 그대로 수립).
만약 비어있는 부분이나 등급이 명시되지 않은 칸이 있으면 해당 등급을 빈 문자열("")로 표시하세요.`;

    let parsedJsonText = "";

    if (provider === "openai") {
      const apiKey = (req.headers["x-openai-api-key"] as string) || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: "OpenAI 개인 API 키가 등록되어 있지 않습니다. 우측 상단 메뉴에서 API 키를 등록해 주세요." });
      }

      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/png"};base64,${base64Image}`
              }
            }
          ]
        }
      ];

      parsedJsonText = await generateContentWithOpenAI(apiKey, selectedModel, messages, {
        responseMimeType: "application/json",
        temperature: 0.1
      });
    } else {
      const ai = getGenAI(req);
      const filePart = {
        inlineData: {
          mimeType: mimeType || "image/png",
          data: base64Image,
        },
      };

      const response = await generateContentWithRetryAndFallback(ai, {
        model: selectedModel,
        contents: [filePart, prompt],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["subject", "grade", "criteria", "students"],
            properties: {
              subject: {
                type: Type.STRING,
                description: "과목 이름 (예: 국어, 수학, 과학)",
              },
              grade: {
                type: Type.STRING,
                description: "학년-반 정보 (예: 6학년 1반)",
              },
              criteria: {
                type: Type.ARRAY,
                description: "평가 기준 목록",
                items: {
                  type: Type.OBJECT,
                  required: ["domain", "evaluationElement"],
                  properties: {
                    domain: {
                      type: Type.STRING,
                      description: "평가 영역 또는 대단원 (예: 2. 바르게 고쳐 써요. (문법))",
                    },
                    achievementStandard: {
                      type: Type.STRING,
                      description: "상세 성취기준내용 (예: [6국04-04] 문장 성분을 이해하고...)",
                    },
                    evaluationElement: {
                      type: Type.STRING,
                      description: "세부 평가 요소 (예: 글을 바르게 고쳐 쓰기)",
                    },
                  },
                },
              },
              students: {
                type: Type.ARRAY,
                description: "학생들의 성적/등급 목록",
                items: {
                  type: Type.OBJECT,
                  required: ["number", "name", "grades"],
                  properties: {
                    number: {
                      type: Type.STRING,
                      description: "번호 또는 고유식별자 (예: 1, 2, 3)",
                    },
                    name: {
                      type: Type.STRING,
                      description: "학생 이름 (예: 강지운, 김다은)",
                    },
                    grades: {
                      type: Type.ARRAY,
                      description: "수행평가 영역별 학생 등급 (순서는 criteria의 순서와 매칭되어야 함)",
                      items: {
                        type: Type.OBJECT,
                        required: ["gradeValue"],
                        properties: {
                          gradeValue: {
                            type: Type.STRING,
                            description: "해당 영역의 등급 (예: 매우 잘함, 잘함, 보통, 노력요함, 혹은 비어있으면 공백)",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      parsedJsonText = response.text || "{}";
    }

    res.json(JSON.parse(parsedJsonText));
  } catch (error: any) {
    console.error("Error parsing table document:", error);
    res.status(500).json({ error: formatServerErrorMessage(error) });
  }
});

// 3. Generate student records in batch
app.post("/api/generate-records", async (req, res) => {
  try {
    const { evaluationMode, criteria, students, config } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "No student roster provided." });
    }
    if (!criteria || !Array.isArray(criteria)) {
      return res.status(400).json({ error: "No evaluation criteria provided." });
    }

    // [요구사항 반영] 평가의 종류가 3종류 이상이면 2종류만 반영하도록 셋업
    let effectiveCriteria = criteria;
    let effectiveStudents = students;

    if (criteria.length > 2) {
      effectiveCriteria = criteria.slice(0, 2);
      const allowedCritIds = new Set(effectiveCriteria.map(c => c.id));
      effectiveStudents = students.map((st: any) => {
        const filteredGrades: Record<string, string> = {};
        if (st.grades) {
          Object.keys(st.grades).forEach(key => {
            if (allowedCritIds.has(key)) {
              filteredGrades[key] = st.grades[key];
            }
          });
        }
        return {
          ...st,
          grades: filteredGrades
        };
      });
    }

    const provider = (req.headers["x-api-provider"] as string) || "gemini";
    const selectedModel = (req.headers["x-selected-model"] as string) || "gemini-3.1-flash-lite";

    const ai = provider === "gemini" ? getGenAI(req) : null;

    // To make sure each student gets a unique, tailored, high-quality development statement,
    // we instruct Gemini. Generating in batched chunks of 5-8 students per call helps keep
    // response speeds, avoid token timeouts, and prevents repetitive syntax patterns!
    // Let's divide students into chunks of max 8 students and execute.
    const chunkSize = 8;
    const studentChunks: any[][] = [];
    for (let i = 0; i < effectiveStudents.length; i += chunkSize) {
      studentChunks.push(effectiveStudents.slice(i, i + chunkSize));
    }

    const {
      subject,
      grade,
      tone,
      creativityLevel = "medium",
      maxLength,
      characterLimitType,
      focusAreas,
      additionalInstructions,
    } = config;

    // Helper to sanitize any accidental pronoun or student name prefixes from generated record texts
    const sanitizeRecordText = (text: string, studentName?: string): string => {
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
    };

    // Map creativity/freedom level directly to Gemini model temperature parameter
    let tempValue = 0.65;
    if (creativityLevel === "low") {
      tempValue = 0.15;
    } else if (creativityLevel === "high") {
      tempValue = 0.95;
    }

    const toneInstructionMap = {
      noun: "문장은 반드시 개조식 종결어미인 명사형 종결(~함. ~임. ~보임. ~추천함)로 단호하고 객관성있게 끝나야 합니다. (~다.로 절대 끝나지 않음)",
      respect: "문장은 서술형 평어체이자 경어체(~합니다. ~있습니다. ~보입니다)로 격조 있고 친절하고 자연스러운 문장으로 서술되어야 합니다.",
      special: "문장은 행동의 우수함이나 태도를 더욱 드높이는 종결어미인 '~함이 돋보임', '~하는 면모를 보임', '~가 탁월함' 등으로 작성하여 학생의 돋보이는 능력을 강조하세요.",
    };

    const focusInstructions: string[] = [];
    // [요구사항 반영] 평가 요소에 없는 내용은 가급적 작성하지 않기 (엄밀한 팩트 준수 교사 지침)
    focusInstructions.push("- ★★★ 극도로 중요 지침 (평가 요소 엄수): 기재된 평가 요소(evaluationElement) 및 성취기준 내용에 등장하지 않는 완전히 인조적이거나 상상해낸 행동 사실, 구체적 사건 일화, 사적인 성격 묘사 등 '근거에 없는 뜬금없는 과외 사실/사적 활동'은 절대로 지어내서 적지 마십시오. 오직 전달된 평가 요소와 학생이 가진 등급 수준(매우 잘함, 잘함, 보통, 노력요함) 에 입각하여 단정하고 투명한 사실 위주로만 핵심을 축약 서술하여 가공하여야 합니다.");
    // [요구사항 반영] 교과학습 발달상황에 있는 평가요소는 자료를 올릴 경우 그 내용을 그대로 반영해줘
    focusInstructions.push("- ★★★ 극도로 중요 지침 (평가 요소 원안 준수 및 미변형): 사용자가 올린 성적 자료나 직접 입력하여 등록한 각 과목 평가 요인의 '평가 요소(evaluationElement)' 핵심 문장 및 키워드(예: '글을 바르게 고쳐 쓰기', '문형 구조 파악하기' 등)는 기재 평어를 생성할 때 함부로 바꾸거나 다듬지 말아야 하며, **그 평가 요소를 있는 그대로 문장에 온전히 삽입하고 노출시켜 반영**하여야 합니다. 평가 요소 전체를 왜곡하거나 소실시키지 말고 원형을 존중하여 최종 피드백 문구를 생성하십시오.");

    if (focusAreas.growthOriented) {
      focusInstructions.push("- '노력요함'이나 빈칸이라 하더라도 부정적인 평가 대신, 향후 '성장할 수 있는 잠재력이나 격려, 구체적인 지도 조언' 방향으로 성장 지향적으로 표현해주세요.");
    } else {
      focusInstructions.push("- 학생의 실제 능력 상태를 객관적으로 서술해주세요.");
    }
    if (focusAreas.activeParticipation) {
      focusInstructions.push("- 배움 과정에 자기주도적으로 참여하거나 돋보인 태도, 적극성, 흥미 등의 정의적 성향을 성취 등급과 조화롭게 표현하세요.");
    }
    if (focusAreas.concreteExamples) {
      focusInstructions.push("- 평가요소를 기반으로 한 구체적인 행동 행동 양식과 어휘를 다양하게 선택하여 실질적이고 차별화된 피드백을 구성해주세요.");
    }
    if (focusAreas.preventDuplication) {
      focusInstructions.push("- 각 학생마다 문장의 문형 구조(예: 시작 어휘, 연결 방식, 조사 활용)를 완전히 차별화하여, 동일 성취도의 학생끼리 비슷한 문구로 도배되지 않도록 극도로 다양화된 어휘를 사용해주십시오.");
    }

    if (creativityLevel === "low") {
      focusInstructions.push("- [낮음 - 단정형 팩트 통제]: 현장 관찰 문맥 조작을 최소화하고, 제공된 성취 요소의 기재 내용 팩트를 기반으로 정직하고 담백하게 서술해야 합니다. 화려한 수식 표현은 지양하십시오.");
    }

    const systemInstruction = `대덕초등학교, 서울중동초등학교 등 실제 교육 현장에서 사용되는 전문적이고 품격 있는 초등학교 및 중학교 교과 학습발달상황용 '과목별 세부능력 및 특기사항(세특) / 평가 평어 기재 문구' 양식 작성 전문 교사입니다.
특히 2015 및 2022 개정 교육과정 성취기준에 명시된 주요 평가 영역(Subject: ${subject}, Grade: ${grade})과 구체적 기재 가이드에 최적화된 기재 스타일을 구사합니다.

[기재 스타일 핵심 원칙 - 완벽히 사수할 것]
1. ★★★ 학생 이름 시작 생략 지침: 
   절대로 문장의 맨 앞을 "\${studentName}은/는" 또는 "\${studentName}(이)는" 등으로 학생 이름을 주어로 기재하여 문장을 시작하지 마십시오. 이름으로 문장 맨 처음을 여는 것은 매우 상투적이며 어색하므로 절대적으로 금합니다. 주어를 교묘히 완전히 생략하거나, 바로 수행평가 실천 사실, 구체적 지식적/정의적 역량 수준, 또는 배움 활동의 태도에서부터 자연스럽고 매끄럽게 문장을 전개하십시오. 이름은 문장 중간 혹은 서술 도중에 자연스러운 일부분으로만 한 범주로 녹여 넣으십시오(예: "...에서 탁월함을 보여 \${studentName}의 발표 역량을 전파함.").
2. ★★★ 따옴표 절대 자제 지침:
   문장에 큰따옴표(")는 완벽하게 사용을 금지합니다. 오직 필요한 최소한의 명사/단어 강조의 경우에만 작은따옴표(')를 사용하십시오.
3. 어조 지침: ${toneInstructionMap[tone as keyof typeof toneInstructionMap] || toneInstructionMap.noun}
4. 길이 요건: 공백 포함 최대 ${maxLength || 1000}자 이내(실제 학교생활기록부 등재 규격이므로 절대 엄수).
${focusInstructions.join("\n")}
${additionalInstructions ? `4. 선생님 의뢰 추가 요건:\n${additionalInstructions}` : ""}`;

    const chunkPromises = studentChunks.map(async (chunk, chunkIdx) => {
      const chunkPromptUser = `아래 명단에 수록된 초등학교/중학교 학생들의 실제 평가 데이터를 분석하고 기재 지침을 완벽히 이행하여 맞춤형 특기사항/평어 문구를 작성해 주세요.

[평가 데이터 학생 명단]
${chunk.map((st, i) => `${i + 1}. 이칭번호: ${st.id}, 이름: ${st.name}, 번호: ${st.number || "없음"}, 등급데이터: ${JSON.stringify(st.grades || {})}`).join("\n")}

선택 정보:
- 평가 기준 정보: ${JSON.stringify(effectiveCriteria)}

출력은 반드시 다음과 같은 규격을 가진 JSON 배열 형태여야 하며, 한 학생당 한 개씩의 원소를 배정하세요:
[
  {
    "studentId": "[해당 학생의 id]",
    "studentName": "[해당 학생의 name]",
    "studentNumber": "[해당 학생의 number]",
    "gradesSummary": "[각 영역별 성취등급의 축약 요약(예: '국어문법(잘함), 말하기(보통)')]",
    "recordText": "[학생 이름과 '이 학생은' 등을 첫 머리나 도중에 절대 붙이지 않고, 곧장 수려하고 품격 있는 행동 사실과 학습 내용 중심의 명사형 또는 어조 지침 형식을 완벽 준수하여 한 줄 혹은 두 줄로 결합 완성된 기록지 문구]"
  }
]
구조적인 JSON 포맷으로 어떠한 사설이나 주석도 없이 오직 순수한 JSON만 반환해 주십시오.`;

      let chunkResults: any[] = [];

      try {
        if (provider === "openai") {
          const apiKey = (req.headers["x-openai-api-key"] as string) || process.env.OPENAI_API_KEY;
          if (!apiKey) {
            throw new Error("오픈AI API 키가 설정되지 않았습니다.");
          }

          const messages = [
            { role: "system", content: systemInstruction },
            { role: "user", content: chunkPromptUser }
          ];

          const responseText = await generateContentWithOpenAI(apiKey, selectedModel, messages, {
            responseMimeType: "application/json",
            temperature: tempValue
          });

          let cleanText = responseText.trim();
          if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
          }
          chunkResults = JSON.parse(cleanText);
        } else {
          const ai = getGenAI(req);
          const response = await generateContentWithRetryAndFallback(ai, {
            model: selectedModel,
            contents: chunkPromptUser,
            config: {
              systemInstruction,
              temperature: tempValue,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                description: "전체 학생에 대한 평가 결과 목록",
                items: {
                  type: Type.OBJECT,
                  required: ["studentId", "studentName", "studentNumber", "gradesSummary", "recordText"],
                  properties: {
                    studentId: {
                      type: Type.STRING,
                      description: "학생 id",
                    },
                    studentName: {
                      type: Type.STRING,
                      description: "학생 이름",
                    },
                    studentNumber: {
                      type: Type.STRING,
                      description: "학생 번호",
                    },
                    gradesSummary: {
                      type: Type.STRING,
                      description: "수행평가 결과 핵심 요약 (예: '문법(매우잘함), 쓰기(보통)')",
                    },
                    recordText: {
                      type: Type.STRING,
                      description: "지침에 맞게 한글로 생성된 완성형 교과학습 발달상황 문구",
                    },
                  },
                },
              },
            },
          });

          const chunkResultText = response.text || "[]";
          chunkResults = JSON.parse(chunkResultText);
        }

        if (Array.isArray(chunkResults)) {
          return chunkResults.map((item: any) => ({
            ...item,
            recordText: sanitizeRecordText(item.recordText, item.studentName),
          }));
        }
      } catch (err) {
        console.error("Failed to parse JSON for chunk:", err);
      }

      // Fallback placeholder formatting
      return chunk.map((st) => ({
        studentId: st.id,
        studentName: st.name,
        studentNumber: st.number,
        gradesSummary: "평취 추출 완료",
        recordText: `수행 평가 영역의 고찰 요소를 전반적으로 성실히 수행하였으며, 세부 학습 내용 중심 피드백 수행을 적극 실천함.`,
      }));
    });

    const chunkResultsArray = await Promise.all(chunkPromises);
    const parsedResults = chunkResultsArray.flat();

    res.json({ results: parsedResults });
  } catch (error: any) {
    console.error("Error generating records:", error);
    res.status(500).json({ error: formatServerErrorMessage(error) });
  }
});

// 4. Generate Creative Experience (창체) Recommendations
app.post("/api/generate-creative-recommendations", async (req, res) => {
  try {
    const {
      domain,
      topic,
      element,
      elements,
      tone,
      maxLength,
      creativityLevel,
      additionalInstructions
    } = req.body;

    if (!domain || !topic) {
      return res.status(400).json({ error: "필수 입력 항목(영역, 주제)이 누락되었습니다." });
    }

    const selectedElementsList = Array.isArray(elements) && elements.length > 0 
      ? elements 
      : (element ? [element] : []);

    if (selectedElementsList.length === 0) {
      return res.status(400).json({ error: "선택된 구체적 관찰요소가 없습니다." });
    }

    const provider = (req.headers["x-api-provider"] as string) || "gemini";
    const selectedModel = (req.headers["x-selected-model"] as string) || "gemini-3.1-flash-lite";

    let tempValue = 0.75;
    if (creativityLevel === "low") tempValue = 0.25;
    if (creativityLevel === "high") tempValue = 0.98;

    const toneInstructionMap = {
      noun: "문장은 반드시 개조식 종결어미인 명사형 종결 (~함. ~임. ~보임. ~추천함) 로 완성하여 신뢰를 가중하십시오.",
      respect: "문장은 서술형 평어체이자 경어체 (~합니다. ~있습니다. ~보입니다) 로 격조 있고 친절하게 완성하십시오.",
      special: "문장은 행동의 우수성이나 태도를 더욱 칭송하는 종결어미 (~함이 돋보임, ~하는 면모를 보임, ~가 탁월함) 로 강조하십시오."
    };

    const limitWord = `공백 포함 최대 ${maxLength || 1000}자 이내(절대 초과하지 않을 것)`;

    const systemInstruction = `대덕초등학교, 서울중동초등학교 등 실제 교육 현장에서 사용되는 전문적이고 품격 있는 초등학교 및 중학교 '창의적 체험활동(자율활동, 동아리활동, 진로활동 등) 특기사항 문구' 작성 교사이자 기재 전문가입니다. 
    특히 2022 개정 교육과정의 주요 취지에 맞추어, 기존 독립 영역이던 봉사활동이 동아리활동 및 자율활동 내 실천적 배려와 나눔 행동으로 자연스럽게 융합되도록 문맥을 구성하는 최고 수준의 문예 창작 능력을 보유하고 있습니다.

    사용자가 선택한 창체 세부 분야(Theme: ${domain}), 핵심 실천 주제/활동명(Activity Name: ${topic}), 그리고 선택한 N개의 구체적 관찰 요소들(Observation Elements)을 기반으로, 각 관찰 요소별 전용 생활기록부용 추천 문장들을 분할하여 생산해야 합니다.

    [핵심 기재 스타일 및 제약 사항 - 극도로 중요]
    1. ★6★ 따옴표 사용 극도로 자제 지침:
       문장에서 큰따옴표(")나 불필요한 따옴표는 절대 사용하지 마십시오. 강조를 위해 꼭 필요한 고유명사, 책 제목 등의 특정한 경우에 한해서만 작은따옴표(')를 매우 최소한으로 사용하십시오. 
    2. ★6★ 학생 이름 시작 생략 지침:
       각 추천 문장의 맨 앞에 '\${studentName}은/는' 또는 '\${studentName}(이)는' 등으로 학생 이름을 강박적으로 주어로 기재하여 문장을 시작하지 마십시오. 이름이 문장 맨 처음에 들어가는 것은 절대 어색하며 지양해야 합니다. 주어를 지능적으로 완전히 생략하거나, 바로 구체적인 활동 내용 및 유의미한 행동 사실로부터 수려하고 조밀하게 문장을 개시하십시오. 문장 도중이나 끝에 꼭 필요한 때만 '\${studentName}'을 자연스럽게 섞을 수 있으나 가급적 이름 자체를 생략한 서사가 훨씬 전문적입니다.
    3. ★6★ 개별 요소별 전용 문장 생성 지침:
       전체 요소를 한데 뭉개어 섞어서 문장을 만드는 것이 아니라, 제공된 N개의 개별 관찰 요소 각각 하나당 각각 그 요소만을 주제로 삼은 개성 넘치는 추천 문장을 10개씩 만들어 주십시오.
       예컨대 관찰 요소가 3개 있다면, 요소A 전용 문장 10개, 요소B 전용 문장 10개, 요소C 전용 문장 10개로 완전히 분리 구획하여 결과를 반환해야 합니다.
    4. ★7★ 일상적이지 않은 문어체 극찬/상투어 절대 배제 지침:
       '~에 귀감이 됨', '타의 모범이 됨', '숭고한 정신', '훌륭한 성품', '존경을 받음', '모범적이고' 처럼 지나치게 인위적이고 과장되었거나 비일상적이며 구태의연한 기재 상투어는 **절대 지양**하십시오. 대신, 구체적으로 어떤 활동을 성실히 수행했는지, 동료와 어떻게 소통하며 배려했는지 등의 **사실에 기반한 다정하면서도 세련되고 담백한 교실 관찰문**(예: ~에 주도적으로 임함, ~에 기여함, ~에서 성실히 역할을 발휘함, ~하며 배려와 협력을 실현함 등)으로 작성하십시오.
    5. 어조 지침: ${toneInstructionMap[tone as keyof typeof toneInstructionMap] || toneInstructionMap.noun}
    6. 길이 요건: ${limitWord}. 각 추천 문장들의 최종 도출 길이는 반드시 이 수치 요건을 철저히 준수하십시오.
    7. 문장 다양성 극대화: 각 관찰 요소별로 생성된 10개의 예시들은 첫 시작 어휘와 부사, 서사 구조가 단 한 줄도 유사하지 않도록 전면 다채롭게 격별하여 작성하십시오.

    8. ★6★ [기재 품질 & 느낌 극대화 예시 지침 (Few-Shot)]
       반드시 다음의 실제 학교 현장 우수 평어 작성 느낌과 문장 스타일에 입각하여 추천 문장들을 생성해 주십시오:
       [우수 작성 예시]
       - (행사/개학 등): "바른 마음과 자세로 개학식에 참여하여 계획적이고 규칙적이며 안전한 생활을 위해 노력할 것을 다짐함.", "개학식에 바른 자세로 참여하며 밝게 웃으며 친구들과 인사하고 자신의 책상과 사물함 주변을 정리함.", "방학과제물을 잘 챙겨 개학식에 참여하고 친구들과 반갑게 인사하며 남은 생활을 알차게 보낼 것을 다짐함."
       - (방학/종업 등): "겨울방학식을 맞아 자신의 물건을 잘 정리하고 주변을 깨끗이 하며 방학동안 규칙적인 생활을 할 것을 다짐함.", "한 해를 반성하는 마음으로 종업식에 바른 자세로 참여하고 새 학년을 위해 준비해야 할 것이 무엇인지 알아봄.", "겨울 방학을 어떻게 보낼 것인지 계획하고 친구들 앞에서 발표한 후 지킬 것을 다짐함."
       - (임원선거/참여 등): "학급 임원의 역할을 바르게 알고 소견 발표를 주의 깊게 들으며 학급 임원 선거에 책임감을 가지고 임함.", "학급임원선거의 의미에 대해 알고 어떤 공약이 현실 가능한지 꼼꼼히 따져본 뒤 책임감 있는 한 표를 행사함.", "소견 발표를 주의 깊게 듣고 학급임원선거에 참여하여 적극적으로 학급 구성원 활동을 준비함."
       - (교육/안전 등): "가정폭력예방교육에 참여하여 가정폭력이 일어나는 상황을 찾아보고 가정폭력에 대한 대처 방법을 알아봄."

       이러한 예시의 느낌처럼 극도로 실제적이고 정갈하며, '진지한 자세', '책임감', '자기반성', '자기주도적 참여 및 성찰 행동'이 묻어나는 자연스러운 문장을 만드십시오. 불필요하고 추상적인 미사여구는 자제하십시오.
    ${additionalInstructions ? `9. 선생님 의뢰 추가 요건:\n${additionalInstructions}` : ""}`;

    const promptUser = `위 지침과 아래 정보를 토대로, 창체 영역 "${domain}", 주제 "${topic}" 하에서 
아래 관찰 요소들 각각에 대해 완벽하게 관련된 고품격 추천 기재 문구를 요소별로 10개씩 생성해 주세요.

[요청 관찰 요소 목록]
${selectedElementsList.map((el, idx) => `${idx + 1}. ${el}`).join("\n")}

출력은 반드시 규율된 JSON 오브젝트 형태여야 하며, 다음과 같은 구조를 충족해야 합니다:
{
  "results": [
    {
      "element": "[관찰 요소 명칭 그대로 기재]",
      "items": [
        { "id": 1, "recommendedText": "[지침들을 완벽히 준수하며 생성된 첫 번째 문장]" },
        { "id": 2, "recommendedText": "[지침들을 완벽히 준수하며 생성된 두 번째 문장]" },
        ... (총 10개 채우기)
      ]
    },
    ... (사용자가 입력한 관찰 요소 개수만큼의 그룹화 원소 삽입)
  ]
}
구조적 오류가 없도록 올바른 JSON 포맷을 유지하여 줄 것이며, JSON 외에 다른 서설이나 주석 텍스트를 절대 반환하지 마십시오.`;

    let responseText = "";

    if (provider === "openai") {
      const apiKey = (req.headers["x-openai-api-key"] as string) || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: "오픈AI API 키가 설정되지 않았습니다. 우측 상단 메뉴에서 관리자 키를 입력해 주세요." });
      }

      const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptUser }
      ];

      responseText = await generateContentWithOpenAI(apiKey, selectedModel, messages, {
        responseMimeType: "application/json",
        temperature: tempValue
      });
    } else {
      const ai = getGenAI(req);
      const response = await generateContentWithRetryAndFallback(ai, {
        model: selectedModel,
        contents: promptUser,
        config: {
          systemInstruction,
          temperature: tempValue,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["results"],
            properties: {
              results: {
                type: Type.ARRAY,
                description: "각 선택 요소별로 생성된 문장 그룹 리스트",
                items: {
                  type: Type.OBJECT,
                  required: ["element", "items"],
                  properties: {
                    element: { type: Type.STRING, description: "기준 역할을 한 관찰 요소명" },
                    items: {
                      type: Type.ARRAY,
                      description: "해당 요소 관련 10개 완성 문장",
                      items: {
                        type: Type.OBJECT,
                        required: ["id", "recommendedText"],
                        properties: {
                          id: { type: Type.NUMBER, description: "그룹별 1~10 일련번호" },
                          recommendedText: { type: Type.STRING, description: "이름 생략, 따옴표 자제 지표가 이행된 추천 기재 구절" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      responseText = response.text || "[]";
    }

    let cleanText = responseText.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    }
    const data = JSON.parse(cleanText);
    let results: any[] = [];

    if (data && Array.isArray(data.results)) {
      results = data.results.map((group: any) => ({
        element: group.element || "",
        items: Array.isArray(group.items) ? group.items.map((it: any) => ({
          id: it.id || Math.random(),
          recommendedText: it.recommendedText || it.text || ""
        })) : []
      }));
    } else if (Array.isArray(data)) {
      results = [{
        element: selectedElementsList[0] || "",
        items: data.map((item: any) => ({
          id: item.id || Math.random(),
          recommendedText: item.recommendedText || item.text || ""
        }))
      }];
    } else {
      const items = data.sentences || data.items || [];
      results = [{
        element: selectedElementsList[0] || "",
        items: Object.keys(items).length > 0 ? items.map((item: any) => ({
          id: item.id || Math.random(),
          recommendedText: item.recommendedText || item.text || ""
        })) : []
      }];
    }

    if (results.length === 0 || results[0].items.length === 0) {
      throw new Error("AI 엔진이 올바른 추천 문구를 1개 이상 생성하는 데 실패했습니다. 원격 AI 안전 필터가 발동했거나 사용된 API 키의 할당량 한도 초과, 혹은 키 불일치 상태일 수 있습니다.");
    }

    res.json({ results });
  } catch (error: any) {
    console.error("Error generating creative recommendations:", error);
    res.status(500).json({ error: formatServerErrorMessage(error) });
  }
});

// 5. Generate Creative Elements Based on Custom Topic
app.post("/api/generate-creative-elements", async (req, res) => {
  try {
    const { domain, topic } = req.body;

    if (!domain || !topic) {
      return res.status(400).json({ error: "필수 항목(세부 영역, 활동명)의 입력이 필요합니다." });
    }

    const provider = (req.headers["x-api-provider"] as string) || "gemini";
    const selectedModel = (req.headers["x-selected-model"] as string) || "gemini-3.1-flash-lite";

    const systemInstruction = `대덕초등학교, 서울중동초등학교 등 실제 교육 현장에서 사용되는 전문적이고 품격 있는 초등학교 및 중학교 '창의적 체험활동(자율활동, 동아리활동, 진로활동 등)' 기재 전문가이자 교사입니다.`;

    const promptUser = `창의적 체험활동 하위 영역 "${domain}"과 대표 실천 주제 및 활동명 "${topic}"에 매우 명확하게 부합하면서 학생의 구체적 활동, 적극적인 노력, 동료 배려 행동 등이 담긴 "구체적 행동 지향 및 관찰 요소" 4가지를 새로이 창조해서 추천해 주십시오. 

각 요소는 초등학교 나이스(NEIS) 생활기록부 기재 서사 구조에 맞도록 매우 구체적이어야 하며 다음 예시 스타일을 참고하십시오:
- (예시): "회의 중 소외된 친구들의 의견을 경청하고 조율하며 건설적인 규칙을 도출함"
- (예시): "자신에게 배정된 역할을 끝까지 성실하게 수행하여 모둠의 공동 과제 완수에 기여함"
- (예시): "블록 코딩 알고리즘 구현 중 난관을 겪는 조원을 위해 버그 수정 가이드를 찬찬히 조언함"

★ 중대한 기재 수칙 지침:
'귀감이 됨', '타의 모범이 됨', '숭고한 정신', '훌륭한 성품', '존경을 받음' 처럼 과장되고 고루하며 일상적이지 않은 문어체 극찬 수준의 표현은 **절대 배제**하십시오. 교실 현장에서 흔히 목격되는 학생들의 자연스럽고 구체적이며 담백한 참여 및 소통 모습(주도적 임함, 솔선수범하여 수행함, 친절하게 도움, 해결책을 제안함 등)에 관한 사실 위주로 추천 문구를 작성해 주어야 합니다.

각 요소는 대략 30자~70자 정도의 짧고 간결한 명사형 종결이나 어미절 (~함, ~의 모습을 보임, ~에 기여함 등) 형식으로 작성하십시오.

출력은 반드시 규율된 JSON 오브젝트 형태여야 하며, 다음과 같은 구조를 충족해야 합니다:
{
  "elements": [
    "[추천 관찰 요소 1]",
    "[추천 관찰 요소 2]",
    "[추천 관찰 요소 3]",
    "[추천 관찰 요소 4]"
  ]
}
구조적 오류가 없도록 올바른 JSON 포맷을 유지하여 줄 것이며, JSON 외에 다른 설명이나 주석 텍스트를 절대 반환하지 마십시오.`;

    let responseText = "";

    if (provider === "openai") {
      const apiKey = (req.headers["x-openai-api-key"] as string) || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: "오픈AI API 키가 설정되지 않았습니다." });
      }

      const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptUser }
      ];

      responseText = await generateContentWithOpenAI(apiKey, selectedModel, messages, {
        responseMimeType: "application/json",
        temperature: 0.7
      });
    } else {
      const ai = getGenAI(req);
      const response = await generateContentWithRetryAndFallback(ai, {
        model: selectedModel,
        contents: promptUser,
        config: {
          systemInstruction,
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["elements"],
            properties: {
              elements: {
                type: Type.ARRAY,
                description: "활동명에 어울리는 추천 구체적 관찰요소 list 4개",
                items: { type: Type.STRING }
              }
            }
          }
        }
      });

      responseText = response.text || "{}";
    }

    let cleanText = responseText.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    }

    const data = JSON.parse(cleanText);
    const elements = Array.isArray(data.elements) ? data.elements : [];

    res.json({ elements });
  } catch (error: any) {
    console.error("Error generating creative elements:", error);
    res.status(500).json({ error: formatServerErrorMessage(error) });
  }
});

/* DUP_START
   전체 요소를 한데 뭉개어 섞어서 문장을 만드는 것이 아니라, 제공된 N개의 개별 관찰 요소 각각 하나당 각각 그 요소만을 주제로 삼은 개성 넘치는 추천 문장을 10개씩 만들어 주십시오.
   예컨대 관찰 요소가 3개 있다면, 요소A 전용 문장 10개, 요소B 전용 문장 10개, 요소C 전용 문장 10개로 완전히 분리 구획하여 결과를 반환해야 합니다.
4. 어조 지침: ${toneInstructionMap[tone as keyof typeof toneInstructionMap] || toneInstructionMap.noun}
5. 길이 요건: ${limitWord}. 각 추천 문장들의 최종 도출 길이는 반드시 이 수치 요건을 철저히 준수하십시오.
6. 문장 다양성 극대화: 각 관찰 요소별로 생성된 10개의 예시들은 첫 시작 어휘와 부사, 서사 구조가 단 한 줄도 유사하지 않도록 전면 다채롭게 격별하여 작성하십시오.
${additionalInstructions ? `7. 선생님 의뢰 추가 요건:\n${additionalInstructions}` : ""}`;

    const promptUser = `위 지침과 아래 정보를 토대로, 창체 영역 "${domain}", 주제 "${topic}" 하에서 
아래 관찰 요소들 각각에 대해 완벽하게 관련된 고품격 추천 기재 문구를 요소별로 10개씩 생성해 주세요.

[요청 관찰 요소 목록]
${selectedElementsList.map((el, idx) => `${idx + 1}. ${el}`).join("\n")}

출력은 반드시 규율된 JSON 오브젝트 형태여야 하며, 다음과 같은 구조를 충족해야 합니다:
{
  "results": [
    {
      "element": "[관찰 요소 명칭 그대로 기재]",
      "items": [
        { "id": 1, "recommendedText": "[지침들을 완벽히 준수하며 생성된 첫 번째 문장]" },
        { "id": 2, "recommendedText": "[지침들을 완벽히 준수하며 생성된 두 번째 문장]" },
        ... (총 10개 채우기)
      ]
    },
    ... (사용자가 입력한 관찰 요소 개수만큼의 그룹화 원소 삽입)
  ]
}
구조적 오류가 없도록 올바른 JSON 포맷을 유지하여 줄 것이며, JSON 외에 다른 서설이나 주석 텍스트를 절대 반환하지 마십시오.`;

    let responseText = "";

    if (provider === "openai") {
      const apiKey = (req.headers["x-openai-api-key"] as string) || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: "오픈AI API 키가 설정되지 않았습니다. 우측 상단 메뉴에서 관리자 키를 입력해 주세요." });
      }

      const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptUser }
      ];

      responseText = await generateContentWithOpenAI(apiKey, selectedModel, messages, {
        responseMimeType: "application/json",
        temperature: tempValue
      });
    } else {
      const ai = getGenAI(req);
      const response = await generateContentWithRetryAndFallback(ai, {
        model: selectedModel,
        contents: promptUser,
        config: {
          systemInstruction,
          temperature: tempValue,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["results"],
            properties: {
              results: {
                type: Type.ARRAY,
                description: "각 선택 요소별로 생성된 문장 그룹 리스트",
                items: {
                  type: Type.OBJECT,
                  required: ["element", "items"],
                  properties: {
                    element: { type: Type.STRING, description: "기준 역할을 한 관찰 요소명" },
                    items: {
                      type: Type.ARRAY,
                      description: "해당 요소 관련 10개 완성 문장",
                      items: {
                        type: Type.OBJECT,
                        required: ["id", "recommendedText"],
                        properties: {
                          id: { type: Type.NUMBER, description: "그룹별 1~10 일련번호" },
                          recommendedText: { type: Type.STRING, description: "이름 생략, 따옴표 자제 지표가 이행된 추천 기재 구절" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      responseText = response.text || "[]";
    }

    let cleanText = responseText.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    }
    const data = JSON.parse(cleanText);
    let results: any[] = [];

    if (data && Array.isArray(data.results)) {
      results = data.results.map((group: any) => ({
        element: group.element || "",
        items: Array.isArray(group.items) ? group.items.map((it: any) => ({
          id: it.id || Math.random(),
          recommendedText: it.recommendedText || it.text || ""
        })) : []
      }));
    } else if (Array.isArray(data)) {
      results = [{
        element: selectedElementsList[0] || "",
        items: data.map((item: any) => ({
          id: item.id || Math.random(),
          recommendedText: item.recommendedText || item.text || ""
        }))
      }];
    } else {
      const items = data.sentences || data.items || [];
      results = [{
        element: selectedElementsList[0] || "",
        items: Object.keys(items).length > 0 ? items.map((item: any) => ({
          id: item.id || Math.random(),
          recommendedText: item.recommendedText || item.text || ""
        })) : []
      }];
    }

    if (results.length === 0 || results[0].items.length === 0) {
      throw new Error("AI 엔진이 올바른 추천 문구를 1개 이상 생성하는 데 실패했습니다. 원격 AI 안전 필터가 발동했거나 사용된 API 키의 할당량 한도 초과, 혹은 키 불일치 상태일 수 있습니다.");
    }

    res.json({ results });
  } catch (error: any) {
    console.error("Error generating creative recommendations:", error);
    res.status(500).json({ error: formatServerErrorMessage(error) });
  }
});
*/

// Configure client assets serving / Dev server setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] running on http://localhost:${PORT}`);
  });
}

startServer();
