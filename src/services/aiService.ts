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

  // 수학 연산 기호 치환 수동 보정 (서버측 규칙 동기화)
  cleaned = cleaned
    .replace(/\+/g, " 덧셈 ")
    .replace(/(?<!\w)-(?!\w|\d)/g, " 뺄셈 ")
    .replace(/\s*[xX*]\s*/g, " 곱셈 ")
    .replace(/\s*\/\s*/g, " 나눗셈 ")
    .replace(/\s*=\s*/g, " 등호 ");

  return cleaned.trim();
}

/**
 * Client-Side Direct REST Calls to Gemini API (Without requiring full SDK in browser bundle)
 */
async function callGeminiDirectly(
  model: string,
  apiKey: string,
  systemInstruction: string,
  prompt: string,
  options: { responseMimeType?: string; temperature?: number; inlineData?: { mimeType: string; data: string } } = {}
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
  
  const contentsParts: any[] = [];
  if (options.inlineData) {
    contentsParts.push({
      inlineData: {
        mimeType: options.inlineData.mimeType,
        data: options.inlineData.data
      }
    });
  }
  contentsParts.push({ text: prompt });

  const body: any = {
    contents: [
      {
        parts: contentsParts
      }
    ],
    generationConfig: {
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
    }
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (options.responseMimeType === "application/json") {
    body.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API가 비어있는 응답을 반환했습니다.");
  }
  return text;
}

/**
 * Client-Side Direct REST Calls to OpenAI API
 */
async function callOpenAIDirectly(
  model: string,
  apiKey: string,
  systemInstruction: string,
  prompt: string,
  options: { responseMimeType?: string; temperature?: number; inlineData?: { mimeType: string; data: string } } = {}
): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";

  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  if (options.inlineData) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${options.inlineData.mimeType};base64,${options.inlineData.data}`
          }
        }
      ]
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const body: any = {
    model: model,
    messages: messages,
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
  };

  if (options.responseMimeType === "application/json") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI API가 비어있는 응답을 반환했습니다.");
  }
  return text;
}

/**
 * 1. Parser for Table Image or PDF using Gemini or OpenAI (Proxied through Backend with Direct Client Fallback)
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

  try {
    return await fetchFromBackend("/api/parse-table-image", body, headers);
  } catch (error: any) {
    console.warn("Backend API not reachable or failed. Attempting direct browser-to-API fallback...", error);
    
    const key = provider === "openai" ? openaiKey : geminiKey;
    if (!key || !key.trim()) {
      throw new Error("정적 웹 호스팅(Cloudflare Pages 등) 환경에서는 화면 우측 상단의 [⚙️ AI 설정 및 API 키] 메뉴에서 본인의 API 키를 입력하셔야 이 기능이 작동합니다.");
    }

    const prompt = `성적표 또는 수행평가 일람표 이미지/PDF 파일을 정밀 분석하여 학년, 학기, 과목 정보 및 학생들의 평가 등급 데이터를 정밀하게 JSON으로 추출해주세요.
추출 기준:
- 과목명 (예: 국어, 수학 등)
- 학년 및 학기 (예: "6학년 1학기", "6학년 1반")
- 성취기준/평가기준 및 영역 (있다면 추출)
- 학생 목록: 번호, 이름 및 각 평가 영역별 성취 수준/등급("매우 잘함", "잘함", "보통", "노력요함" 또는 "A", "B", "C" 등등 문서에 성적 등급으로 표시된 단어 그대로 수립).
만약 비어있는 부분이나 등급이 명시되지 않은 칸이 있으면 해당 등급을 빈 문자열("")로 표시하세요.`;

    try {
      let responseText = "";
      if (provider === "openai") {
        responseText = await callOpenAIDirectly(model, key, "", prompt, {
          responseMimeType: "application/json",
          temperature: 0.1,
          inlineData: { mimeType: mimeType || "image/png", data: base64Image }
        });
      } else {
        responseText = await callGeminiDirectly(model, key, "", prompt, {
          responseMimeType: "application/json",
          temperature: 0.1,
          inlineData: { mimeType: mimeType || "image/png", data: base64Image }
        });
      }

      let cleanText = responseText.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
      }
      return JSON.parse(cleanText);
    } catch (fallbackError: any) {
      console.error("Direct browser call fallback also failed:", fallbackError);
      throw new Error(formatClientErrorMessage(fallbackError));
    }
  }
}

/**
 * 2. Client-Side Record Batch Generator using Gemini or OpenAI (Proxied through Backend with Direct Client Fallback)
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

  try {
    const response = await fetchFromBackend("/api/generate-records", body, headers);
    return response.results || [];
  } catch (error: any) {
    console.warn("Backend record generator not reachable or failed. Attempting direct browser-to-API fallback...", error);
    
    const key = provider === "openai" ? openaiKey : geminiKey;
    if (!key || !key.trim()) {
      throw new Error("정적 웹 호스팅(Cloudflare Pages 등) 환경에서는 화면 우측 상단의 [⚙️ AI 설정 및 API 키] 메뉴에서 본인의 API 키를 입력하셔야 평어 자동 생성이 작동합니다.");
    }

    // [요구사항 반영] 평가 종류가 3종류 이상이면 2종류만 반영하도록 셋업
    let effectiveCriteria = criteria;
    let effectiveStudents = students;

    if (criteria.length > 2) {
      effectiveCriteria = criteria.slice(0, 2);
      const allowedCritIds = new Set(effectiveCriteria.map(c => c.id));
      effectiveStudents = students.map((st: any) => {
        const filteredGrades: Record<string, string> = {};
        if (st.grades) {
          Object.keys(st.grades).forEach(k => {
            if (allowedCritIds.has(k)) {
              filteredGrades[k] = st.grades[k];
            }
          });
        }
        return {
          ...st,
          grades: filteredGrades
        };
      });
    }

    const {
      subject,
      grade,
      tone,
      creativityLevel = "medium",
      maxLength,
      focusAreas,
      additionalInstructions,
    } = config;

    let tempValue = 0.65;
    if (creativityLevel === "low") tempValue = 0.15;
    if (creativityLevel === "high") tempValue = 0.95;

    const toneInstructionMap = {
      noun: "★초특급 지침★ 모든 문장은 반드시 명사형 종결어미인 '~함.' 또는 '~임.'(마침표 포함)으로만 종료되어야 합니다. '~다.'나 '~함'(마침표 누락)은 절대 금지되며, 특히 '~할 수 있음', '~수 있음' 등의 표기는 기록 규정 금기 사항이므로 절대 노출해서는 안 됩니다.",
      respect: "★초특급 지침★ 모든 문장은 예외 없이 반드시 개조식 명사형 종결어미인 '~함.' 또는 '~임.'(마침표 포함)으로만 깔끔하게 종료되어야 합니다. (~합니다, ~수 있음, ~할 수 있음은 전면 금지)",
      special: "★초특급 지침★ 문장 끝맺음은 반드시 '~함이 돋보임.', '~하는 모습을 보임.', '~에 기여함.'과 같이 최종 어미가 '~함.', '~임.'(마침표 포함) 형태로 완결되어야 합니다. '~할 수 있음.', '~수 있음.' 등은 절대 금지됩니다."
    };

    const focusInstructions: string[] = [];
    const fa = focusAreas || {};
    if (Array.isArray(fa)) {
      fa.forEach((area: string) => {
        if (area === "growth") {
          focusInstructions.push("- [성장 중심 피드백]: 학생의 도전 과정, 미흡한 부분에서 도출된 변화 양상 및 발전 모습을 서술 흐름으로 꼭 담아주십시오.");
        } else if (area === "attitude") {
          focusInstructions.push("- [학습 태도 강조]: 수업 시간의 경청 태도, 모둠 협동 참여 태도, 질문 빈도, 끈기 있는 수행 태도를 중점적으로 반영하십시오.");
        } else if (area === "uniqueness") {
          focusInstructions.push("- [개인 특성 부각]: 기성 틀에 박힌 표현을 피하고, 학생만의 관찰된 독특하고 고유한 행동 특성 위주로 풍성하게 표현하십시오.");
        } else if (area === "diversity") {
          focusInstructions.push("- 각 학생마다 문장의 문형 구조(예: 시작 어휘, 연결 방식, 조사 활용)를 완전히 차별화하여, 동일 성취도의 학생끼리 비슷한 문구로 도배되지 않도록 극도로 다양화된 어휘를 사용해주십시오.");
        }
      });
    } else {
      if (fa.growthOriented) {
        focusInstructions.push("- [성장 중심 피드백]: 학생의 도전 과정, 미흡한 부분에서 도출된 변화 양상 및 발전 모습을 서술 흐름으로 꼭 담아주십시오.");
      }
      if (fa.activeParticipation) {
        focusInstructions.push("- [학습 태도 강조]: 수업 시간의 경청 태도, 모둠 협동 참여 태도, 질문 빈도, 끈기 있는 수행 태도를 중점적으로 반영하십시오.");
      }
      if (fa.concreteExamples) {
        focusInstructions.push("- [개인 특성 부각]: 기성 틀에 박힌 표현을 피하고, 학생만의 관찰된 독특하고 고유한 행동 특성 위주로 풍성하게 표현하십시오.");
      }
      if (fa.preventDuplication) {
        focusInstructions.push("- 각 학생마다 문장의 문형 구조(예: 시작 어휘, 연결 방식, 조사 활용)를 완전히 차별화하여, 동일 성취도의 학생끼리 비슷한 문구로 도배되지 않도록 극도로 다양화된 어휘를 사용해주십시오.");
      }
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
3. ★★★ 자연스러운 관계어 사용 지침:
   학급 내 다른 학생을 표현할 때 '급우'라는 다소 딱딱하고 인위적인 한자어 표현은 절대 사용하지 마십시오. 대신 '친구', '또래', '동료', '모둠원', '학급 친구', '주변 친구' 등 교실 현장에서 널리 쓰이는 자연스럽고 고운 한국어 표현을 적극 활용하여 기재하십시오.
4. ★★★ 특정 영문 상표명 및 플랫폼명의 대체 표현 기재 지침 (생활기록부 기재 요령 준수) ★★★
   학교생활기록부 기재 요령상 특정 사기업 명칭, 상표명, 특정 플랫폼 이름 및 영문 도구 명칭은 직접 기재가 엄격히 금지됩니다. 따라서 문장을 생성할 때 절대로 아래와 같은 브랜드명이나 플랫폼명을 그대로 사용하지 말고, 반드시 아래에 해당하는 대체 표현으로 순화하여 한글로 기재하십시오:
   - Google(구글), NAVER(네이버), Daum(다음) 등 -> '포털사이트'
   - Google Classroom(구글 클래스룸), EBS 온라인클래스, 클래스팅 등 -> '학습 플랫폼', '클래스관리 도구'
   - TikTok(틱톡) 등 -> '엔터테인먼트 플랫폼'
   - Gather Town(개더타운), ZEPETO(제페토), ifland(이프랜드) 등 -> '메타버스 플랫폼' 또는 '메타버스', '소셜커뮤니케이션서비스'
   - miricanvas(미리캔버스), mangoboard(망고보드), Canva(캔바) 등 -> '디자인 제작 플랫폼'
   - Google TV(구글 티비), YouTube(유튜브), TVING(티빙), watcha(왓챠), netflix(넷플릭스), wavve(웨이브), disneyplus(디즈니+, 디즈니플러스), OTT(오티티) 등 -> '동영상 플랫폼', '동영상 공유 서비스'
   - Vllo(블로), Premiere Pro(프리미어 프로), Final Cut Pro(파이널 컷 프로) 등 -> '영상 제작 프로그램', '영상 편집 프로그램'
   - YouTuber(유튜버) 등 -> '동영상 크리에이터', '동영상 제공자', '개인 미디어 제작자'
   - KakaoTalk(카카오톡, 카톡) 등 -> '메신저', '메신저 서비스'
   - Instagram(인스타그램), LINE(라인), Twitter(트위터), Meta(메타), Facebook(페이스북) 등 -> '소셜네트워크서비스' (또는 SNS)
   - Padlet(패들렛), ThinkerBell(핑커벨), Allo(알로) 등 -> '협업 플랫폼', '온라인 협업 플랫폼'
   - Google Docs(구글문서) 등 -> '온라인 문서 편집기'
   - careernet(커리어넷), majormap(메이저맵) 등 -> '진로정보망', '진로 정보 사이트'
   - Holland(홀랜드) 검사 등 -> '직업선호도 검사'
   - KTX(케이티엑스), SRT(에스알티) 등 -> '초고속 열차', '고속 열차'
   - UN(유엔), EU(유럽연합), WHO(세계 보건 기구), WTO(세계무역기구), OECD(경제협력개발기구), IMF(국제통화기금), UNESCO(유네스코), IAEA, NATO 등 -> '국제기구'
   - Zoom(줌) 등 -> '화상 회의'
   - MBTI(엠비티아이) 등 -> '성격유형 검사'
   - HTML(에이치티엠엘) 등 -> '하이퍼텍스트 마크업 언어', '웹 페이지 제작 언어'
   - CSS(씨에스에스) 등 -> '스타일 시트 언어'
   - iPad(아이패드), Galaxy Tab(갤럭시탭) 등 -> '태블릿PC'
   - chrome book(크롬북) 등 -> '휴대용 컴퓨터'
   - Chat GPT(챗지피티), wrtn(뤼튼), bing Chat(빙챗), 바드, 하이퍼클로바X 등 -> '대화형 인공지능', '생성형 인공지능'
   - Altcoin(알트코인), Bitcoin(비트코인) 등 -> '가상화폐'
   - Python(파이썬) 등 -> '프로그래밍 언어'
   - TED(테드) 등 -> '온라인 강연회'
5. 어조 지침: ${toneInstructionMap[tone as keyof typeof toneInstructionMap] || toneInstructionMap.noun}
6. 길이 요건: 공백 포함 최대 ${maxLength || 1000}자 이내(실제 학교생활기록부 등재 규격이므로 절대 엄수).
${focusInstructions.join("\n")}
${additionalInstructions ? `4. 선생님 의뢰 추가 요건:\n${additionalInstructions}` : ""}`;

    // Replicate chunks of 8
    const chunkSize = 8;
    const studentChunks: any[][] = [];
    for (let i = 0; i < effectiveStudents.length; i += chunkSize) {
      studentChunks.push(effectiveStudents.slice(i, i + chunkSize));
    }

    try {
      const chunkPromises = studentChunks.map(async (chunk) => {
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

        let responseText = "";
        if (provider === "openai") {
          responseText = await callOpenAIDirectly(model, key, systemInstruction, chunkPromptUser, {
            responseMimeType: "application/json",
            temperature: tempValue
          });
        } else {
          responseText = await callGeminiDirectly(model, key, systemInstruction, chunkPromptUser, {
            responseMimeType: "application/json",
            temperature: tempValue
          });
        }

        let cleanText = responseText.trim();
        if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
        }
        const chunkResults = JSON.parse(cleanText);

        return chunkResults.map((item: any) => ({
          studentId: item.studentId || "",
          studentName: item.studentName || "",
          studentNumber: item.studentNumber || "",
          gradesSummary: item.gradesSummary || "",
          recordText: sanitizeRecordText(item.recordText || item.text || item.recommendedText || "")
        }));
      });

      const chunkResultsArray = await Promise.all(chunkPromises);
      return chunkResultsArray.flat();
    } catch (fallbackError: any) {
      console.error("Direct browser generation also failed:", fallbackError);
      throw new Error(formatClientErrorMessage(fallbackError));
    }
  }
}

/**
 * 3. 10 Creative Experience (창체) Recommendation sentences generator (Proxied through Backend with Direct Client Fallback)
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
    console.warn("Backend recommendations failed. Attempting direct browser-to-API fallback...", error);

    const key = provider === "openai" ? openaiKey : geminiKey;
    if (!key || !key.trim()) {
      throw new Error("정적 웹 호스팅(Cloudflare Pages 등) 환경에서는 화면 우측 상단의 [⚙️ AI 설정 및 API 키] 메뉴에서 본인의 API 키를 입력하셔야 평어 생성 기능이 작동합니다.");
    }

    let tempValue = 0.78;
    if (creativityLevel === "low") tempValue = 0.45;
    if (creativityLevel === "high") tempValue = 0.98;

    const toneInstructionMap = {
      noun: "★초특급 지침★ 모든 문장은 반드시 개조식 종결어미인 '~함.' 또는 '~임.'(마침표 포함)으로만 종료되어야 합니다. '~다.'나 '~함'(마침표 누락)은 절대 금지되며, 특히 '~할 수 있음', '~수 있음' 등의 가능 형태 표현은 통지표 기록 규정 금기 사항이므로 절대로 사용해서는 안 됩니다.",
      respect: "★초특급 지침★ 본 플랫폼 통지표 규정상 존댓말 서술 대신 반드시 개조식 명사형 종결어미인 '~함.' 또는 '~임.'(마침표 포함)으로만 깔끔하게 종료되어야 합니다. (~합니다, ~수 있음, ~할 수 있음은 전면 금지)",
      special: "★초특급 지침★ 문장 끝맺음은 반드시 '~함이 돋보임.', '~하는 모습을 보임.', '~에 기여함.'과 같이 최종 어미가 '~함.', '~임.'(마침표 포함) 형태로 완결되어야 합니다. '~할 수 있음.', '~수 있음.' 등은 절대 금지됩니다."
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
5. ★7★ 자연스러운 관계어 사용 지침:
   '급우'라는 딱딱하고 번역투 같은 한자어 대신, 교실의 온정 있고 친근한 관계를 나타내는 '친구', '또래', '동료', '모둠원', '학급 친구', '주변 친구' 등 한결 유연하고 자연스러운 고유어 및 생활 한국어 표현을 절대적으로 사용하여 작성해 주십시오. '급우'라는 단어 사용은 완전히 배제해야 합니다.
6. ★7★ 특정 영문 상표명 및 플랫폼명의 대체 표현 기재 지침 (생활기록부 기재 요령 준수) ★★★
   사기업 브랜드명, 상표명, 특정 플랫폼 및 영문 도구 명칭은 생활기록부에 기재가 절대 불가하므로 다음 대체 표현으로 완전히 순화해서 한글로 기재해 주어야 합니다:
   - Google(구글), NAVER(네이버), Daum(다음) 등 -> '포털사이트'
   - Google Classroom(구글 클래스룸), EBS 온라인클래스, 클래스팅 등 -> '학습 플랫폼', '클래스관리 도구'
   - TikTok(틱톡) 등 -> '엔터테인먼트 플랫폼'
   - Gather Town(개더타운), ZEPETO(제페토), ifland(이프랜드) 등 -> '메타버스 플랫폼' 또는 '메타버스', '소셜커뮤니케이션서비스'
   - miricanvas(미리캔버스), mangoboard(망고보드), Canva(캔바) 등 -> '디자인 제작 플랫폼'
   - Google TV(구글 티비), YouTube(유튜브), TVING(티빙), watcha(왓챠), netflix(넷플릭스), wavve(웨이브), disneyplus(디즈니+, 디즈니플러스), OTT(오티티) 등 -> '동영상 플랫폼', '동영상 공유 서비스'
   - Vllo(블로), Premiere Pro(프리미어 프로), Final Cut Pro(파이널 컷 프로) 등 -> '영상 제작 프로그램', '영상 편집 프로그램'
   - YouTuber(유튜버) 등 -> '동영상 크리에이터', '동영상 제공자', '개인 미디어 제작자'
   - KakaoTalk(카카오톡, 카톡) 등 -> '메신저', '메신저 서비스'
   - Instagram(인스타그램), LINE(라인), Twitter(트위터), Meta(메타), Facebook(페이스북) 등 -> '소셜네트워크서비스' (또는 SNS)
   - Padlet(패들렛), ThinkerBell(핑커벨), Allo(알로) 등 -> '협업 플랫폼', '온라인 협업 플랫폼'
   - Google Docs(구글문서) 등 -> '온라인 문서 편집기'
   - careernet(커리어넷), majormap(메이저맵) 등 -> '진로정보망', '진로 정보 사이트'
   - Holland(홀랜드) 검사 등 -> '직업선호도 검사'
   - KTX(케이티엑스), SRT(에스알티) 등 -> '초고속 열차', '고속 열차'
   - UN(유엔), EU(유럽연합), WHO(세계 보건 기구), WTO(세계무역기구), OECD(경제협력개발기구), IMF(국제통화기금), UNESCO(유네스코), IAEA, NATO 등 -> '국제기구'
   - Zoom(줌) 등 -> '화상 회의'
   - MBTI(엠비티아이) 등 -> '성격유형 검사'
   - HTML(에이치티엠엘) 등 -> '하이퍼텍스트 마크업 언어', '웹 페이지 제작 언어'
   - CSS(씨에스에스) 등 -> '스타일 시트 언어'
   - iPad(아이패드), Galaxy Tab(갤럭시탭) 등 -> '태블릿PC'
   - chrome book(크롬북) 등 -> '휴대용 컴퓨터'
   - Chat GPT(챗지피티), wrtn(뤼튼), bing Chat(빙챗), 바드, 하이퍼클로바X 등 -> '대화형 인공지능', '생성형 인공지능'
   - Altcoin(알트코인), Bitcoin(비트코인) 등 -> '가상화폐'
   - Python(파이썬) 등 -> '프로그래밍 언어'
   - TED(테드) 등 -> '온라인 강연회'
7. 어조 지침: ${toneInstructionMap[tone as keyof typeof toneInstructionMap] || toneInstructionMap.noun}
8. ★Link★ 영문 및 수학적/연산 특수부호 기재 전면 금지: 문장 내에 어떠한 연산 기호나 사칙 부호(+, -, x, X, *, / 등)를 절대 그대로 적지 마십시오. 예컨대 '+', '-', 'x'는 기하급수적으로 감점되는 기재 금기 부호이므로 무조건 '덧셈과 뺄셈', '곱셈', '나눗셈' 등 친절한 순수 한글 용어로 풀어서 작성해야 합니다.
9. ★Link★ 단위 기호 영문 기재 보존: 단, 센티미터(cm), 킬로그램(kg), 그램(g), 미터(m), 리터(L), 밀리리터(ml), 밀리미터(mm)와 같은 실용 수치 단위는 예외적으로 영문 기호 그대로(예: cm, kg, g...) 노출 기재할 수 있으며 권장됩니다.
8. 길이 요건: ${limitWord}. 각 추천 문장들의 최종 도출 길이는 반드시 이 수치 요건을 철저히 준수하십시오.
9. ★★★ [초특급 중요] 10개 추천 문장의 복사 및 중복/유사 생성 절대 금지:
   하나의 관찰 요소에 대응해 생성되는 10개의 문장은 **첫 어미, 도입 부사, 중간의 서사 구조, 어조 뉘앙스가 완전히 독립적인 10개 고유의 다채로운 독창 문장**이어야 합니다.
   단 한 개라도 동일한 문장이나 어휘 몇 가지만 바꾼 복사판 문장(자가 복제)이 포함될 시 심각한 오류로 간주됩니다.
   서로 다 다른 상황(역할 책임, 참여 자세, 동료 소통, 성찰 태도)에 입각하여 각기 개성 있는 문맥으로 창조하여 1번부터 10번까지의 다양성을 극대화하십시오.

10. ★6★ [기재 품질 & 느낌 극대화 예시 지침 (Few-Shot)]
   반드시 다음의 실제 학교 현장 우수 평어 작성 느낌과 문장 스타일에 입각하여 추천 문장들을 생성해 주십시오:
   [우수 작성 예시]
   - (행사/개학 등): "바른 마음과 자세로 개학식에 참여하여 계획적이고 규칙적이며 안전한 생활을 위해 노력할 것을 다짐함.", "개학식에 바른 자세로 참여하며 밝게 웃으며 친구들과 인사하고 자신의 책상과 사물함 주변을 정리함.", "방학과제물을 잘 챙겨 개학식에 참여하고 친구들과 반갑게 인사하며 남은 생활을 알차게 보낼 것을 다짐함."
   - (방학/종업 등): "겨울방학식을 맞아 자신의 물건을 잘 정리하고 주변을 깨끗이 하며 방학동안 규칙적인 생활을 할 것을 다짐함.", "한 해를 반성하는 마음으로 종업식에 바른 자세로 참여하고 새 학년을 위해 준비해야 할 것이 무엇인지 알아봄.", "겨울 방학을 어떻게 보낼 것인지 계획하고 친구들 앞에서 발표한 후 지킬 것을 다짐함."
   - (임원선거/참여 등): "학급 임원의 역할을 바르게 알고 소견 발표를 주의 깊게 들으며 학급 임원 선거에 책임감을 가지고 임함.", "학급임원선거의 의미에 대해 알고 어떤 공약이 현실 가능한지 꼼꼼히 따져본 뒤 책임감 있는 한 표를 행사함.", "소견 발표를 주의 깊게 듣고 학급임원선거에 참여하여 적극적으로 학급 구성원 활동을 준비함."
   - (교육/안전 등): "가정폭력예방교육에 참여하여 가정폭력이 일어나는 상황을 찾아보고 가정폭력에 대한 대처 방법을 알아봄."

   이러한 예시의 느낌처럼 극도로 실제적이고 정갈하며, '진지한 자세', '책임감', '자기반성', '자기주도적 참여 및 성찰 행동'이 묻어나는 자연스러운 문장을 만드십시오. 불필요하고 추상적인 미사여구는 자제하십시오.
${additionalInstructions ? `11. 선생님 의뢰 추가 요건:\n${additionalInstructions}` : ""}`;

    const randomSeed = Math.floor(Math.random() * 100000);
    const promptUser = `위 지침과 아래 정보를 토대로, 창체 영역 "${domain}", 주제 "${topic}" 하에서 
아래 관찰 요소들 각각에 대해 완벽하게 관련된 고품격 추천 기재 문구를 요소별로 10개씩 생성해 주세요.
(생성 무작위 시드 코드: ${randomSeed} - 매 요청마다 완전히 새로운 독립적 서사와 문법 구조를 갖출 것.)

[★★ 10개 문장 고유성 부여 지침 ★★]
각 관찰 요소별로 생성하는 10개의 문장은 **절대로 비슷하거나 단어만 바꾼 동일한 문장이어서는 안 됩니다.**
각 번호(1~10안)는 다음의 각기 다른 실제 교실 상황 및 태도를 반영하여 전혀 다른 성향의 개성 있는 내용으로 각각 고유하게 작성해 주십시오:
- 1안 (주도성): 주도적으로 참여하여 솔선수범하는 리더십 성향의 상황
- 2안 (협업): 팀원들과 대화하고 공감하며 의사소통을 매끄럽게 이끄는 협력적 모습
- 3안 (책임감): 튀지 않으나 맡은 바 책임을 성실히 묵묵하게 이행하는 자세
- 4안 (배려): 어려움을 겪는 동료를 먼저 발견하고 배려와 나눔을 발휘하는 우정
- 5안 (자기성찰): 활동 과정에서 스스로의 실수를 돌아보고 피드백을 적용하는 깊은 성찰 태도
- 6안 (창의성): 탐구심이 넘쳐 창의적인 제안이나 새로운 시각을 보태는 주관적 관점
- 7안 (준법/모범): 약속이나 규칙을 매우 준수하며 안전하고 올바른 태도로 모범이 되는 일상
- 8안 (인내심): 힘든 상황에서도 포기하지 않고 끈기 있게 역할을 완수해내는 인내심
- 9안 (경청/도움): 상대방의 소견이나 조언을 주의 깊게 경청하고 조화롭게 녹여내는 조력자 자세
- 10안 (내면화): 활동의 목적과 의미를 깊이 이해하고 실천 가치를 내면화하는 자세

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

    try {
      let responseText = "";
      if (provider === "openai") {
        responseText = await callOpenAIDirectly(model, key, systemInstruction, promptUser, {
          responseMimeType: "application/json",
          temperature: tempValue
        });
      } else {
        responseText = await callGeminiDirectly(model, key, systemInstruction, promptUser, {
          responseMimeType: "application/json",
          temperature: tempValue
        });
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
            recommendedText: sanitizeRecordText(it.recommendedText || it.text || "")
          })) : []
        }));
      } else if (Array.isArray(data)) {
        results = [{
          element: selectedElementsList[0] || "",
          items: data.map((item: any) => ({
            id: item.id || Math.random(),
            recommendedText: sanitizeRecordText(item.recommendedText || item.text || "")
          }))
        }];
      } else {
        const items = data.sentences || data.items || [];
        results = [{
          element: selectedElementsList[0] || "",
          items: Object.keys(items).length > 0 ? items.map((item: any) => ({
            id: item.id || Math.random(),
            recommendedText: sanitizeRecordText(item.recommendedText || item.text || "")
          })) : []
        }];
      }

      return results;
    } catch (fallbackError: any) {
      console.error("Direct browser recommendation generation also failed:", fallbackError);
      throw new Error(formatClientErrorMessage(fallbackError));
    }
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

/**
 * 4. Generate Creative Elements Based on Custom Topic (Proxied through Backend with Direct Client Fallback)
 */
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
    console.warn("Backend elements generation failed. Attempting direct browser-to-API fallback...", error);

    const key = provider === "openai" ? openaiKey : geminiKey;
    if (!key || !key.trim()) {
      // Return beautiful offline elements
      return [
        `${topic} 활동에 성실하게 참여하여 주도적으로 과제를 해결하고 배운 점을 실천함.`,
        `${topic} 과정에서 동료의 의견을 존중하며 적극적으로 의사소통하고 합리적인 절충안을 제안함.`,
        `${topic} 규칙과 절차를 성실하게 준수하고 공동체의 안전과 청결을 위해 스스로 책임을 분담함.`,
        `${topic} 행동 중 발생한 개선점을 발전적 성찰을 통해 훌륭하게 해결하고 구성원 활동에 도움을 줌.`
      ];
    }

    const systemInstruction = `대덕초등학교, 서울중동초등학교 등 실제 교육 현장에서 사용되는 전문적이고 품격 있는 초등학교 및 중학교 '창의적 체험활동(자율활동, 동아리활동, 진로활동 등)' 기재 전문가이자 교사입니다.`;

    const promptUser = `창의적 체험활동 하위 영역 "${domain}"과 대표 실천 주제 및 활동명 "${topic}"에 매우 명확하게 부합하면서 학생의 구체적 활동, 적극적인 노력, 동료 배려 행동 등이 담긴 "구체적 행동 지향 및 관찰 요소" 4가지를 새로이 창조해서 추천해 주십시오. 

각 요소는 초등학교 나이스(NEIS) 생활기록부 기재 서사 구조에 맞도록 매우 구체적이어야 하며 다음 예시 스타일을 참고하십시오:
- (예시): "회의 중 소외된 친구들의 의견을 경청하고 조율하며 건설적인 규칙을 도출함"
- (예시): "자신에게 배정된 역할을 끝까지 성실하게 수행하여 모둠의 공동 과제 완수에 기여함"
- (예시): "블록 코딩 알고리즘 구현 중 난관을 겪는 조원을 위해 버그 수정 가이드를 찬찬히 조언함"

★ 중대한 기재 수칙 지침:
- '귀감이 됨', '타의 모범이 됨', '숭고한 정신', '훌륭한 성품', '존경을 받음' 처럼 과장되고 고루하며 일상적이지 않은 문어체 극찬 수준의 표현은 **절대 배제**하십시오. 교실 현장에서 흔히 목격되는 학생들의 자연스럽고 구체적이며 담백한 참여 및 소통 모습(주도적 임함, 솔선수범하여 수행함, 친절하게 도움, 해결책을 제안함 등)에 관한 사실 위주로 추천 문구를 작성해 주어야 합니다.
- 또한, 딱딱하거나 상투적인 '급우'라는 표현을 일절 배제하고, 대신 '친구', '또래', '동료', '모둠원', '학급 친구', '주변 친구' 등 교감 있고 한층 자연스러운 어휘를 활용하십시오.
- 특정 사기업 브랜드명, 특정 플랫폼 및 영문 도구 명칭은 직접 기재가 엄격히 금지되므로 다음 대체 표현으로 완전히 순화해서 한글로 작성하십시오:
  - Google(구글), NAVER(네이버), Daum(다음) 등 -> '포털사이트'
  - Google Classroom, EBS 온라인클래스, 클래스팅 등 -> '학습 플랫폼', '클래스관리 도구'
  - TikTok 등 -> '엔터테인먼트 플랫폼'
  - Gather Town, ZEPETO, ifland 등 -> '메타버스 플랫폼' 또는 '메타버스', '소셜커뮤니케이션서비스'
  - miricanvas, mangoboard, Canva 등 -> '디자인 제작 플랫폼'
  - YouTube, TVING, watcha, netflix, wavve, disneyplus, OTT 등 -> '동영상 플랫폼', '동영상 공유 서비스'
  - Vllo, Premiere Pro, Final Cut Pro 등 -> '영상 제작 프로그램', '영상 편집 프로그램'
  - YouTuber -> '동영상 크리에이터', '동영상 제공자', '개인 미디어 제작자'
  - KakaoTalk, 카카오톡, 카톡 등 -> '메신저', '메신저 서비스'
  - Instagram, LINE, Twitter, Meta, Facebook 등 -> '소셜네트워크서비스' (또는 SNS)
  - Padlet, ThinkerBell, Allo 등 -> '협업 플랫폼', '온라인 협업 플랫폼'
  - Google Docs 등 -> '온라인 문서 편집기'
  - careernet, majormap 등 -> '진로정보망', '진로 정보 사이트'
  - Holland 검사 등 -> '직업선호도 검사'
  - KTX, SRT 등 -> '초고속 열차', '고속 열차'
  - UN, EU, WHO, WTO, OECD, IMF, UNESCO, IAEA, NATO 등 -> '국제기구'
  - Zoom 등 -> '화상 회의'
  - MBTI 등 -> '성격유형 검사'
  - HTML 등 -> '하이퍼텍스트 마크업 언어', '웹 페이지 제작 언어'
  - CSS 등 -> '스타일 시트 언어'
  - iPad, Galaxy Tab 등 -> '태블릿PC'
  - chrome book 등 -> '휴대용 컴퓨터'
  - Chat GPT, wrtn, bing Chat, 바드, 하이퍼클로바X 등 -> '대화형 인공지능', '생성형 인공지능'
  - Altcoin, Bitcoin 등 -> '가상화폐'
  - Python 등 -> '프로그래밍 언어'
  - TED 등 -> '온라인 강연회'

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

    try {
      let responseText = "";
      if (provider === "openai") {
        responseText = await callOpenAIDirectly(model, key, systemInstruction, promptUser, {
          responseMimeType: "application/json",
          temperature: 0.7
        });
      } else {
        responseText = await callGeminiDirectly(model, key, systemInstruction, promptUser, {
          responseMimeType: "application/json",
          temperature: 0.7
        });
      }

      let cleanText = responseText.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
      }
      const data = JSON.parse(cleanText);
      return data.elements || [];
    } catch (fallbackError: any) {
      console.error("Direct browser elements generation also failed:", fallbackError);
      // Return default offline elements
      return [
        `${topic} 활동에 성실하게 참여하여 주도적으로 과제를 해결하고 배운 점을 실천함.`,
        `${topic} 과정에서 동료의 의견을 존중하며 적극적으로 의사소통하고 합리적인 절충안을 제안함.`,
        `${topic} 규칙과 절차를 성실하게 준수하고 공동체의 안전과 청결을 위해 스스로 책임을 분담함.`,
        `${topic} 행동 중 발생한 개선점을 발전적 성찰을 통해 훌륭하게 해결하고 구성원 활동에 도움을 줌.`
      ];
    }
  }
}
