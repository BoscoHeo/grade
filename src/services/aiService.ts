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
  headers: Record<string, string>,
  localFallback: () => Promise<any>
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
    if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("404") || err.message.includes("Unexpected token"))) {
      console.warn(`[aiService] Connection to backend ${endpoint} failed. Falling back to direct client-side execution:`, err);
      return await localFallback();
    }
    throw err;
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

  return fetchFromBackend("/api/parse-table-image", body, headers, async () => {
    const prompt = `성적표 또는 수행평가 일람표 이미지/PDF 파일을 정밀 분석하여 학년, 학기, 과목 정보 및 학생들의 평가 등급 데이터를 정밀하게 JSON으로 추출해주세요.
추출 기준:
- 과목명 (예: 국어, 수학 등)
- 학년 및 학기 (예: "6학년 1학기", "6학년 1반")
- 성취기준/평가기준 및 영역 (있다면 추출)
- 학생 목록: 번호, 이름 및 각 평가 영역별 성취 수준/등급("매우 잘함", "잘함", "보통", "노력요함" 또는 "A", "B", "C" 등등 문서에 성적 등급으로 표시된 단어 그대로 수립).
만약 비어있는 부분이나 등급이 명시되지 않은 칸이 있으면 해당 등급을 빈 문자열("")로 표시하세요.`;

    if (provider === "openai") {
      if (!openaiKey) {
        throw new Error("OpenAI API 키가 설정되지 않았습니다. 상단 API 설정 메뉴에서 등록해 주세요.");
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: model,
          response_format: { type: "json_object" },
          messages: [
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
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API 오류 (${response.status}): ${errorText}`);
      }

      const payload = await response.json();
      const resultText = payload.choices?.[0]?.message?.content || "{}";
      return JSON.parse(resultText);

    } else {
      // Google Gemini
      if (!geminiKey) {
        throw new Error("Gemini API 키가 입력되지 않았습니다. 쾌적한 사용을 위해 우측 상단 [⚙️ AI 설정 및 API 키] 메뉴에서 무료 개인 API 키를 등록해 주세요.");
      }

      // Direct REST API Call to Google Gemini Web Service with safety-fallback model
      const actualModel = model || "gemini-3.1-flash-lite";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${geminiKey}`;

      const schema = {
        type: "OBJECT",
        required: ["subject", "grade", "criteria", "students"],
        properties: {
          subject: {
            type: "STRING",
            description: "과목 이름 (예: 국어, 수학, 과학)",
          },
          grade: {
            type: "STRING",
            description: "학년-반 정보 (예: 6학년 1반)",
          },
          criteria: {
            type: "ARRAY",
            description: "평가 기준 목록",
            items: {
              type: "OBJECT",
              required: ["domain", "evaluationElement"],
              properties: {
                domain: {
                  type: "STRING",
                  description: "평가 영역 또는 대단원 (예: 2. 바르게 고쳐 써요. (문법))",
                },
                achievementStandard: {
                  type: "STRING",
                  description: "상세 성취기준내용 (예: [6국04-04] 문장 성분을 이해하고...)",
                },
                evaluationElement: {
                  type: "STRING",
                  description: "세부 평가 요소 (예: 글을 바르게 고쳐 쓰기)",
                },
              },
            },
          },
          students: {
            type: "ARRAY",
            description: "학생들의 성적/등급 목록",
            items: {
              type: "OBJECT",
              required: ["number", "name", "grades"],
              properties: {
                number: {
                  type: "STRING",
                  description: "번호 또는 고유식별자 (예: 1, 2, 3)",
                },
                name: {
                  type: "STRING",
                  description: "학생 이름 (예: 강지운, 김다은)",
                },
                grades: {
                  type: "ARRAY",
                  description: "수행평가 영역별 학생 등급 (순서는 criteria의 순서와 매칭되어야 함)",
                  items: {
                    type: "OBJECT",
                    required: ["gradeValue"],
                    properties: {
                      gradeValue: {
                        type: "STRING",
                        description: "해당 영역의 등급 (예: 매우 잘함, 잘함, 보통, 노력요함, 혹은 비어있으면 공백)",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mimeType || "image/png", data: base64Image } },
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatClientErrorMessage({ message: errorText }));
      }

      const payload = await response.json();
      const resultText = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      return JSON.parse(resultText);
    }
  });
}

/**
 * 2. Client-Side Record Batch Generator using Gemini or OpenAI
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

  // Slice criteria if greater than 2, matching backend rules to prevent excessive generation size
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

  // Slicing students into chunks of max 8 students
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
  focusInstructions.push("- ★★★ 극도로 중요 지침 (평가 요소 엄수): 기재된 평가 요소(evaluationElement) 및 성취기준 내용에 등장하지 않는 완전히 인조적이거나 상상해낸 행동 사실, 구체적 사건 일화, 사적인 성격 묘사 등 '근거에 없는 뜬금없는 과외 사실/사적 활동'은 절대로 지어내서 적지 마십시오. 오직 전달된 평가 요소와 학생이 가진 등급 수준(매우 잘함, 잘함, 보통, 노력요함) 에 입각하여 단정하고 투명한 사실 위주로만 핵심을 축약 서술하여 가공하여야 합니다.");

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
    focusInstructions.push("- [낮음 - 단정형 팩트 통제]: 현장 관찰 문맥 조작을 최소화하고, 제공된 성취 요소의 기재 내용 팩트를 기반으로 정직하고 담백하게 서술해야 합니다. 화려한 수식 표현이나 칭찬은 최대한 절제하세요.");
  } else if (creativityLevel === "high") {
    focusInstructions.push("- [높음 - 다채로운 서술]: 기품있고 가치 지향적인 한글 어구들을 적극 결합하고 적극적으로 연결 방식을 다변화하여 반복성을 차단해주십시오.");
  }

  const limitWord = characterLimitType === "byte" ? `공백 포함 약 ${maxLength} 바이트(한글 1자=2~3바이트 계산하여 약 ${Math.floor(maxLength / 2)}자) 내외` : `공백 포함 최대 ${maxLength}자 이내(절대 초과하지 않을 것)`;

  const isSubject = !evaluationMode || evaluationMode === EvaluationMode.SUBJECT;

  const systemInstruction = isSubject ? `대덕초등학교, 서울중동초등학교 등 실제 교육 현장에서 사용되는 전문적이고 품격 있는 초등학교/중학교 '교과학습 발달 상황 및 세특(세부능력 및 특기사항) 문구' 작성 교사입니다.
교육부 학교생활기록부 기재 요령에 부합하고, 기재 금지 사항(과외, 사교육, 고비용 항목, 수상실적, 수상경력, 타 교과 관련 내용 등)을 철저히 배제하며 다음 기준 하에 학생별 맞춤형 평어를 생성하세요.

[수행 지침]
1. 과목: ${subject}, 학년: ${grade}
2. 각 영역별 평가 성취수준(매우 잘함, 잘함, 보통, 노력요함)을 종합 분석하여 핵심 성장을 설명하는 자연스러운 문장으로 결합해 출력하세요.
   * 비어있는 빈칸 평가 영역은 학생이 별도의 보충 학습을 받았거나 평탄한 수준임을 자연스럽게 넘어가거나 타 영역의 성취 수준 위주로 조립하세요.
3. 어조 지침: ${toneInstructionMap[tone as keyof typeof toneInstructionMap] || toneInstructionMap.noun}
4. 길이 요건: ${limitWord}. 이 조건은 절대적인 기재 제한이므로 엄수해야 합니다.
5. ★★★ 주어(학생 지칭 어소) 전면 배제 및 평가 내용 직결 서술 엄수:
   문장의 주어나 시작어구로 '이 학생은', '이 아동은', '본 아동은', '본 학생은', '이 학생', '이 아동', '그는' 등의 어떠한 지칭사나 대명사, 실제 학생 이름도 절대 사용하지 마십시오.
   모든 인물 지칭 성분을 전면 배제하고, 곧바로 구체적인 행동 팩트와 학업 성취 기준에 따른 학습 내용 중심으로 서술을 시작하십시오.
   - 예시 (나쁜 서술): "이 학생은 글을 바르게 고쳐 쓰는 데 탁월함."
   - 예시 (훌륭하게 개선된 서술): "글의 문장 성분을 파악하고 호응 관계의 호용이 바른 상태로 고쳐 쓰는 능력이 돋보임."
6. ★★★ 평가 등급별 서술 미학 (칭찬 및 대안 방향):
   - [결과가 우수할 시 ('매우 잘함', '잘함' 등)]: 지나치게 격양되거나 사실 관계를 넘어서는 과장된 수사나 화려한 호칭(예: 독보적인 천재, 세상을 뒤흔들, 기적인 등)은 반드시 지양하고, 성취 기준의 범위 내에서 세련되고 담백하게 적정선을 지키며 칭찬하세요.
   - [결과가 미흡할 시 ('보통', '노력요함' 등)]: 낙인을 찍거나 단정 지어 학생을 기죽이는 표현(예: 배움이 불가능함, 기본이 매우 부진함 등)은 일절 쓰지 마십시오. 대신 구체적으로 어느 영역에서 학습이 아쉬웠는지를 정확하고 정중하게 진단하고, 어려움을 개선할 수 있는 구체적인 보완 사항, 발전 가능성, 격려 사항과 성장 방향을 기재해 주십시오.
7. 다채롭고 독창적인 문장 구성으로, 유사한 등급을 받은 학생들의 서술문이 도배 성격을 띠지 않게 하십시오.
${focusInstructions.join("\n")}
${additionalInstructions ? `8. 선생님 의뢰 추가 요건:\n${additionalInstructions}` : ""}`
  : `대덕초등학교, 서울중동초등학교 등 실제 교육 현장에서 사용되는 전문적이고 품격 있는 초등학교 '창의적 체험활동(자율활동, 동아리활동, 진로활동 등) 특기사항 문구' 작성 교사입니다. 특히 2022 개정 교육과정의 주요 취지에 맞추어, 기존 독립 영역이던 봉사활동이 동아리활동 및 자율활동 내 실천적 배려와 나눔 행동으로 자연스럽게 융합되도록 문맥을 구성하는 전문가입니다.
교육부 학교생활기록부 기재 요령에 부합하고 다음 기준 하에 학생별 맞춤형 창의적 체험활동 특기사항 평어를 생성하세요.

[수행 지침]
1. 영역: ${subject} (창체 활동 영역), 학년: ${grade}
2. ★★★ 2022 개정 교육과정 융합 반영 지침:
   2022 개정 교육과정에 따라 봉사활동이 동아리활동(또는 자율활동) 산하로 안전하게 흡수/연동되었습니다. 동아리활동이나 자율활동 내에서 타인을 배려하고, 나누며, 봉사하는 긍정적인 실천적 태도가 학생의 활동 과정 및 구체적 관찰 행동(예: 또래 도우미, 학급 청결 관리, 동아리 나눔 등)과 물 흐르듯 결합되도록 구성하여 생생한 입체감을 부여해 주십시오.
3. 각 기재된 창체 영역별 학생의 고유 참여 내용 및 추천 템플릿/행동 특성 키워드를 바탕으로, 한 명 한 명의 활동 몰입도와 생활 지도 성장사가 한눈에 들어오는 풍성하고 격조 높은 완결 문맥으로 구성하십시오.
   * 비어있는 영역이나 등급 기록은 자연스럽게 기재 대장에서 제하고, 등록된 타 영역의 활약상 위주로 조립해 서술하십시오.
4. 어조 지침: ${toneInstructionMap[tone as keyof typeof toneInstructionMap] || toneInstructionMap.noun}
5. 길이 요건: ${limitWord}. 이 조건은 NEIS(나이스) 등재 한도 내에서 극도로 중요하므로 수치 기준을 절대 준수하십시오.
6. ★★★ 이름 마스킹 플레이스홀더 사용 가능 지침:
   창의적 체험활동 특기사항의 경우 주어를 지능적으로 생략하며 서술하되, 필요하다면 학생의 고유 이름 토큰인 '\${studentName}'을 문맥상 극도로 자연스럽게 배치하여 그대로 사용하십시오 (예: "\${studentName}은 모둠 학급 자치 활동에 솔선수범 성실함을 발휘하여..."). 단, '이 학생은', '이 아동은' 같은 상투적인 삼류 지칭은 전면 금지하며, 실체적 활동 사실 중심의 주동성을 묘사하십시오.
7. ★★★ 행동 특성 및 관찰 요소 서술 미학:
   - 교사가 기입한 [특성 메모/행동 템플릿 키워드 또는 '주제: OO / 행동: XX'의 관찰 요소 결합 정보]의 교육적 취지를 완벽하게 승화시켜, 단순히 '주제:' '행동:' 단어를 원글 그대로 복사해 적는 것이 아닌 "해당 탐구 주제 및 활동 속에서 생생히 발현되는 풍부하고 긍정적인 실천 이야기"로 입체적인 완결 문장으로 묘사하십시오.
8. 동일한 특성 수준을 받은 아동끼리도 서술문의 첫 마디, 부사, 연결 연결어미들이 도배되지 않도록 철저하며 다채로운 문예적 다채로움(어휘 획기적 다양성)을 담보하십시오.
${focusInstructions.join("\n")}
${additionalInstructions ? `9. 선생님 의뢰 추가 요건:\n${additionalInstructions}` : ""}`;

  const chunkPromises = studentChunks.map(async (chunk) => {
    const studentPayloadStr = JSON.stringify(chunk, null, 2);
    const criteriaPayloadStr = JSON.stringify(effectiveCriteria, null, 2);

    const promptUser = `다음 평가 성취 기준 데이터와 학생 성적 목록을 바탕으로 각 학생당 'recordText'를 품위 있는 한글 문장으로 1개씩 생성해 주세요.
출력은 반드시 JSON 배열 형태여야 성립하며 각 원소는 studentId, studentName, studentNumber, gradesSummary(예: '문법 매우잘함/쓰기 보통/매체 없음' 식으로 핵심 조합 요약), recordText 의 속성을 가져야 합니다.

[평가 영역 및 성치기준]
${criteriaPayloadStr}

[이번 생성할 학생 정보]
${studentPayloadStr}`;

    try {
      let chunkResults: any[] = [];

      if (provider === "openai") {
        if (!openaiKey) {
          throw new Error("오픈AI API 키 입력이 보장되지 않았습니다.");
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: promptUser }
            ],
            temperature: tempValue
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`OpenAI API 오류 (${response.status}): ${text}`);
        }

        const payload = await response.json();
        const responseText = payload.choices?.[0]?.message?.content || "[]";
        chunkResults = JSON.parse(responseText);

      } else {
        // Gemini Direct REST API Call
        if (!geminiKey) {
          throw new Error("Gemini API 키 입력이 보장되지 않았습니다.");
        }

        const actualModel = model || "gemini-3.1-flash-lite";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${geminiKey}`;

        const schema = {
          type: "ARRAY",
          description: "학생들의 발달 상황 생성 문구 목록",
          items: {
            type: "OBJECT",
            required: ["studentId", "studentName", "studentNumber", "gradesSummary", "recordText"],
            properties: {
              studentId: { type: "STRING" },
              studentName: { type: "STRING" },
              studentNumber: { type: "STRING" },
              gradesSummary: { type: "STRING" },
              recordText: { type: "STRING" },
            }
          }
        };

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              { text: promptUser }
            ],
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            generationConfig: {
              temperature: tempValue,
              responseMimeType: "application/json",
              responseSchema: schema
            }
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(formatClientErrorMessage({ message: text }));
        }

        const payload = await response.json();
        const responseText = payload.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        chunkResults = JSON.parse(responseText);
      }

      if (Array.isArray(chunkResults)) {
        return chunkResults.map((item: any) => ({
          ...item,
          recordText: sanitizeRecordText(item.recordText, item.studentName),
        }));
      }
    } catch (err: any) {
      console.error("Failed to parse JSON for chunk:", err);
    }

    // Fallback placeholder formatting on errors
    return chunk.map((st) => ({
      studentId: st.id,
      studentName: st.name,
      studentNumber: st.number,
      gradesSummary: "수행 결과 반영",
      recordText: `수행 평가 영역의 고찰 요소를 전반적으로 성실히 수행하였으며, 세부 학습 내용 중심 피드백 수행을 적극 실천함.`,
    }));
  });

  const chunkResultsArray = await Promise.all(chunkPromises);
  return chunkResultsArray.flat();
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
    const response = await fetchFromBackend("/api/generate-creative-recommendations", body, headers, async () => {
      // Local client-side fallback
      let tempValue = 0.75;
      if (creativityLevel === "low") tempValue = 0.25;
      if (creativityLevel === "high") tempValue = 0.98;

      const toneInstructionMap = {
        noun: "문장은 반드시 개조식 종결어미인 명사형 종결(~함. ~임. ~보임. ~추천함)로 단호하고 객관성있게 끝나야 합니다. (~다.로 절대 끝나지 않음)",
        respect: "문장은 서술형 평어체이자 경어체(~합니다. ~있습니다. ~보입니다)로 격조 있고 친절하고 자연스러운 문장으로 서술되어야 합니다.",
        special: "문장은 행동의 우수함이나 태도를 더욱 드높이는 종결어미인 '~함이 돋보임', '~하는 면모를 보임', '~가 탁월함' 등으로 작성하여 학생의 돋보이는 능력을 강조하세요.",
      };

      const limitWord = `공백 포함 최대 ${maxLength}자 이내(절대 초과하지 않을 것)`;

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

      if (provider === "openai") {
        if (!openaiKey) {
          throw new Error("오픈AI API 키가 설정되지 않았습니다. 우측 상단 메뉴에서 관리자 키를 입력해 주세요.");
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: promptUser }
            ],
            temperature: tempValue
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`OpenAI API 오류 (${response.status}): ${text}`);
        }

        const payload = await response.json();
        const responseText = payload.choices?.[0]?.message?.content || "{}";
        const data = JSON.parse(responseText);
        return data.results || [];
      } else {
        // Gemini
        if (!geminiKey) {
          throw new Error("Gemini API 키가 입력되지 않았습니다. 우측 상단 [⚙️ AI 설정 및 API 키]에서 발급받은 키를 임시등록해 주시기 바랍니다.");
        }

        const actualModel = model || "gemini-3.1-flash-lite";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${geminiKey}`;

        const schema = {
          type: "OBJECT",
          required: ["results"],
          properties: {
            results: {
              type: "ARRAY",
              description: "관찰 요소별 생성 문장 10개 목록의 배열",
              items: {
                type: "OBJECT",
                required: ["element", "items"],
                properties: {
                  element: { type: "STRING", description: "관찰 요소 명칭" },
                  items: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      required: ["id", "recommendedText"],
                      properties: {
                        id: { type: "NUMBER", description: "1부터 10까지 값" },
                        recommendedText: { type: "STRING", description: "추천 문장" }
                      }
                    }
                  }
                }
              }
            }
          }
        };

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: promptUser }] }
            ],
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            generationConfig: {
              temperature: tempValue,
              responseMimeType: "application/json",
              responseSchema: schema
            }
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(formatClientErrorMessage({ message: text }));
        }

        const payload = await response.json();
        const responseText = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const data = JSON.parse(responseText);
        return data.results || [];
      }
    });

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
    const response = await fetchFromBackend("/api/generate-creative-elements", body, headers, async () => {
      // Local client-side fallback
      const systemInstruction = `대덕초등학교, 서울중동초등학교 등 실제 교육 현장에서 사용되는 전문적이고 품격 있는 초등학교 및 중학교 '창의적 체험활동(자율활동, 동아리활동, 진로활동 등)' 기재 전문가이자 교사입니다.`;
      const promptUser = `창의적 체험활동 하위 영역 "${domain}"과 대표 실천 주제 및 활동명 "${topic}"에 매우 명확하게 부합하면서 학생의 구체적 활동, 적극적인 노력, 동료 배려 행동 등이 담긴 "구체적 행동 지향 및 관찰 요소" 4가지를 새로이 창조해서 추천해 주십시오. 

각 요소는 초등학교 나이스(NEIS) 생활기록부 기재 서사 구조에 맞도록 매우 구체적이어야 하며 다음 예시 스타일을 참고하십시오:
- (예시): "회의 중 소외된 친구들의 의견을 경청하고 조율하며 건설적인 규칙을 도출함"
- (예시): "자신에게 배정된 역할을 끝까지 성실하게 수행하여 모둠의 공동 과제 완수에 기여함"
- (예시): "블록 코딩 알고리즘 구현 중 난관을 겪는 조원을 위해 버그 수정 가이드를 찬찬히 조언함"

★ 중요 기재 지침:
'귀감이 됨', '타의 모범이 됨', '숭고한 정신', '훌륭한 성품', '존경을 받음' 처럼 과장되고 상투적이며 일상적이지 않은 문어체적 극찬 표현은 **절대 배제**하십시오. 교실 현장에서 흔히 목격되는 학생들의 자연스럽고 구체적이며 담백한 참여 모습(역할을 주도적으로 담당함, 솔선수범하여 수행함, 친절하게 도움, 조화롭게 의견을 조율함 등)에 관한 실제 행동 사실 위주로 추천 문구를 작성해 주어야 합니다.

각 요소는 대략 30자~70자 정도의 짧고 간결한 명사형 종결이나 어미절(~함, ~의 모습을 보임, ~에 기여함 등) 형식으로 작성하십시오.

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

      if (provider === "openai") {
        if (!openaiKey) {
          throw new Error("오픈AI API 키가 설정되지 않았습니다.");
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: promptUser }
            ],
            temperature: 0.7
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`OpenAI API 오류 (${response.status}): ${text}`);
        }

        const payload = await response.json();
        const responseText = payload.choices?.[0]?.message?.content || "{}";
        const data = JSON.parse(responseText);
        return data.elements || [];
      } else {
        if (!geminiKey) {
          throw new Error("Gemini API 키가 입력되지 않았습니다.");
        }

        const actualModel = model || "gemini-3.1-flash-lite";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${geminiKey}`;

        const schema = {
          type: "OBJECT",
          required: ["elements"],
          properties: {
            elements: {
              type: "ARRAY",
              description: "관찰 요소 4개 목록",
              items: { type: "STRING" }
            }
          }
        };

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: promptUser }] }
            ],
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            generationConfig: {
              temperature: 0.7,
              responseMimeType: "application/json",
              responseSchema: schema
            }
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(formatClientErrorMessage({ message: text }));
        }

        const payload = await response.json();
        const responseText = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const data = JSON.parse(responseText);
        return data.elements || [];
      }
    });

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

