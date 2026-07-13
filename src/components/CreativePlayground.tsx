import React, { useState, useEffect } from "react";
import { 
  clientGenerateCreativeRecommendations,
  clientGenerateCreativeElements
} from "../services/aiService";
import { 
  Sparkles, Compass, Check, Copy, Edit2, CheckCircle2, RotateCcw, AlertTriangle, HelpCircle, 
  Settings2, BookOpen, User, Info, FileText, Download, Plus, Trash2
} from "lucide-react";

interface CreativePlaygroundProps {
  provider: "gemini" | "openai" | "groq" | "xai";
  model: string;
  geminiKey: string;
  openaiKey: string;
  groqKey?: string;
  xaiKey?: string;
  onShowKeyPanel: () => void;
}

interface ActivityPreset {
  topic: string;
  elements: string[];
}

// 21 Clean Simplified Presets (활동명만 가짐) - 2022 개정 세팅 반영
const CREATIVE_PRESETS: Record<string, ActivityPreset[]> = {
  "자율활동": [
    {
      topic: "학급 자치 회의",
      elements: [
        "회의 중 소외된 친구들의 의견을 경청하고 조율하며 건설적인 규칙을 도출함",
        "민주적인 의사결정 방식의 가치를 깨닫고 갈등 발생 시 평화로운 타협안을 이끌어냄",
        "학급의 크고 작은 문제 상황에서 합리적 대안을 제시하며 모두의 합의를 유도함",
        "자치 토의에 솔선하여 참여하며 학급 공동체의 소통 문화를 정착시키는 데 공헌함"
      ]
    },
    {
      topic: "1인 1역 봉사",
      elements: [
        "자신에게 배정된 역할을 묵묵하고 성실하게 끝까지 수행하여 주변 친구들에게 모범이 됨",
        "학급 물품 정돈과 위생 관리 활동에 자발적으로 참여해 쾌적한 교실 환경 구축에 기여함",
        "모두가 꺼리는 일에 솔선수범 나서서 책임을 다하며 학급 구성원의 안전과 편의를 도움",
        "매일 아침 학급 환경 정리를 책임지고 주도하여 학급 친구들의 위생적인 생활에 긍정적 보탬을 줌"
      ]
    },
    {
      topic: "또래 멘토 상담",
      elements: [
        "학습에 한 발 늦은 친구를 따뜻하고 온화한 태도로 지원하는 지목 멘토 활동을 전개함",
        "또래들의 소소한 어려움을 귀담아듣고 공감하며 갈등을 중재하는 평화 중재자로 활동함",
        "어색한 팀원 간 긍정적인 다리 역할을 도맡아 정서적 안정과 소통의 기회를 제공함",
        "자신의 지식이나 배움의 결실을 학급 친구들과 나눔으로써 더불어 살아가는 공동체 의식을 행동화함"
      ]
    },
    {
      topic: "폭력 예방 캠페인",
      elements: [
        "고운 말 고운 언어 실천 서약 문구를 완성하여 교실 내 바른 언어 예절의 본보기가 됨",
        "사이버 폭력 예방 챌린지를 제안하고 따뜻한 우정을 나눌 수 있는 칭찬 릴레이를 선도함",
        "교우 관계 관찰 및 갈등 예방에 관심이 생겨 긍정적 분위기를 주도하는 평화 문화를 자아냄",
        "모든 학우가 무리에 골고루 소속되어 즐겁게 소통할 수 있도록 중재자이자 공감자로 다가감"
      ]
    },
    {
      topic: "재난 안전 대피",
      elements: [
        "위기 상황의 방재 대피 행동강령 요령을 숙지하여 민첩하고 차분한 질서 준수를 몸소 행함",
        "학교 주변의 잠재적 위험 사각지대를 예리하게 파악하여 교내 안전 지킴이로 활약함",
        "등교 및 복도 질서 지키기 수칙을 학급에 공유해 사고 발생을 방해하는 안전 리더로 공인됨",
        "계절별 보건 지침 매뉴얼을 학급 보드판에 손수 그래픽 지도로 게시해 학우들의 동행을 이끔"
      ]
    },
    {
      topic: "교실 환경 미화",
      elements: [
        "분리배출 자원 순환 1인 1역 요령을 알차게 홍보하며 탄소 배출 저감에 공익적 면모를 보임",
        "교단 가꾸기 식물 돌봄 봉사 활동을 성실성과 책임감으로 소유하여 교정 미화에 기여함",
        "교실 낭비 에너지를 주도적으로 점검하고 대기 전력 소모를 차단하는 환경 수호자로 거듭남",
        "생활관 및 환경 정리 등 굳은 업무에 항상 자원하여 깨끗하고 건강한 교정 문화를 퍼뜨림"
      ]
    },
    {
      topic: "학급 규칙 정립",
      elements: [
        "학급의 원활한 소통을 도모하고자 공동체 존중 규칙과 매너 가이드를 학우들과 함께 완성함",
        "교실 내 미덕 저금통을 기획하여 긍정 가치 실천을 도모하고 상호 칭찬하는 분위기를 형성함",
        "작은 약속이라도 반드시 지키고자 노력하며 학급 동참 서약을 실현하는 도우미로 기능함",
        "매주 자치 피드백 시간에 건설적인 규칙 보완책을 제시하여 모두가 평화롭고 편안한 일상을 가꿈"
      ]
    }
  ],
  "동아리활동": [
    {
      topic: "AI 소프트웨어",
      elements: [
        "블록 코딩 알고리즘 구현 중 난관을 겪는 조원을 위해 버그 수정 가이드를 따뜻하게 지도함",
        "탄소 저감 시뮬레이션 게임을 창의 설계해 생태주의 메시지를 전달하는 지능적 메이커로 활약함",
        "조별 과학 가치 프로젝트에서 동작 체계를 전담하고 끝내 완성도 높은 테스트 결과를 일구어냄",
        "AI 응용 설계 기본 개념을 학우들이 알기 쉬운 카드 뉴스로 만들어 배움과 정보를 적극 공유함"
      ]
    },
    {
      topic: "자원 업사이클링",
      elements: [
        "폐재활용품을 멋진 창의성으로 리폼하여 소외된 이웃에 기증하는 따뜻한 친선 봉사를 실천함",
        "온실가스 줄이기 생활 수칙 안내판을 설계하여 생태 시민으로서의 지구 사랑 정신을 보여줌",
        "생활 쓰레기 배출 축소 인포그래픽 만화를 그려 전파하며 지속 가능한 소비의 가치를 일깨움",
        "사용되지 않는 유휴 비품과 교구들을 정리 정돈해 에너지 절약 분위기를 선도하는 데 기여함"
      ]
    },
    {
      topic: "기후 대응 챌린지",
      elements: [
        "교내 탄소 중립 실천 행동 수칙을 디자인하여 전교생 기후 챌린지 참가를 능동 유도함",
        "생활 폐기물의 올바른 순환 경제 인포그래픽을 제작하여 지속 가능한 소비를 생활화함",
        "에너지 절약의 필요성을 명시한 학내 계량 보드판을 가꾸며 탄소 제로 실천의 중요성을 강조함",
        "실험 도구 및 재료들을 정리하며 환경 오염을 최소화하기 위한 안전 지침을 철저하게 준수함"
      ]
    },
    {
      topic: "음악 합주 연습",
      elements: [
        "나의 독주 소리가 두드러지기보다는 전체 조화로운 선율을 위해 박자와 음량을 겸허히 조절함",
        "악보 독해가 늦거나 서툰 부원을 곁에서 다독이며 연주법과 파트 숙달을 우호적으로 조력함",
        "등굣길 힐링 음악 연주 나눔 콘서트에 솔선 동참해 악기를 재능 기부 연주하며 평화를 나눔",
        "안정적인 베이스 파트를 자율적으로 도맡아 묵묵하고 정직하게 팀 전체 화음을 받쳐주는 역할을 수행함"
      ]
    },
    {
      topic: "과학 발명 실험",
      elements: [
        "생활 속 불편 요소를 정교한 생활 자재 공학과 발명으로 개선하는 탁월한 문제 해결력을 자랑함",
        "합성 화학 탐구 중 안전 수칙을 엄격하게 선엄 준수하고 뒷정리 처리에 자부심을 가진 정직을 실천함",
        "실패를 겪는 과정에서도 유연하고 긍정적인 극복의 대안을 동료들에게 안겨주며 대오를 리드함",
        "시리얼 통을 개조해 정밀 미세먼지 측정 조형을 주체적으로 설계하며 팀 창의 가치를 끌어올림"
      ]
    },
    {
      topic: "체육 스포츠 클럽",
      elements: [
        "모의 축구 및 협동 경기 중 상대방의 반칙 실수를 배려 깊게 포용하며 안전한 즐거움을 보장함",
        "애매한 규칙 시비가 벌어지거나 감정이 마찰할 때 기꺼이 양보하여 건전한 스포츠십을 빛냄",
        "교구 정리 및 체육 기구의 이동 보관 등 묵직한 배후 정리에 자청하여 팀 가치에 성실히 기여함",
        "패배 속에서도 경기력 자체를 축복하며 상대방의 노력을 드높여 격려하고 상호 신뢰를 격려함"
      ]
    },
    {
      topic: "독서 토론 창작",
      elements: [
        "인류 연대적 가치가 수록된 고전을 읽고 평화와 배려 철학을 한 편의 정밀한 서사 에세이로 피력함",
        "토론 배심원단 역할을 진중히 수행하며 치우침 없이 찬반 이견의 근거 요소를 명확하게 균형 분석함",
        "자연과의 상생적 공감대 회복 독후 발표에서 수려하고 진솔한 감성 어투로 감명을 선사함",
        "도서 교환 재능 나눔 행사 기획 시 자발적 환경 봉사를 선도해 원만하게 행사가 진행되도록 힘씀"
      ]
    }
  ],
  "진로활동": [
    {
      topic: "성격 유형 탐색",
      elements: [
        "나의 다중 인격 유형 데이터를 심층 분석하며 나눔 지향의 강점 성품을 직업 비전에 투영함",
        "이타주의적이고 기품 있는 사회적 활동의 위상을 확인하며 나의 직업 푯대를 맹렬하게 형성함",
        "자기 결점 및 가치관 시각 편지글 작성을 정직하게 도모하며 지속적 성찰을 위한 로드맵을 마련함",
        "서로 다른 동료 부원들의 특이 꿈을 관대히 존중하며 찬사를 보내 공동 진로 성장의 동기를 일굼"
      ]
    },
    {
      topic: "유망 직업 탐구",
      elements: [
        "기후 조율 탄소 중개 전문가 등 지속 지구에 기여하는 신직업 리포트를 독학하고 보고서를 설계함",
        "과학 공생 미래 직업군 동작 로드맵을 10년 주기별 연계 수칙으로 나누어 체계적으로 집대성함",
        "신기술 일자리 적응 면접 설문을 기민하게 준비하고 인공지능이 채울 수 없는 인간 성품을 고찰함",
        "미래 복지 수호 직업 연계 가이드를 제작하여 학우들과 함께 상생 꿈을 일구는 활력소가 되어줌"
      ]
    },
    {
      topic: "롤모델 평전 분석",
      elements: [
        "의료 봉사에 헌신한 위인의 전기문을 분석하고 본받고 싶은 태도와 직업 윤리에 대해 고찰함",
        "공공 윤리를 지지하는 기업인들의 전기를 분석해 사회공헌의 가치와 자신의 진로 방향성을 연결하여 정리함",
        "자신이 롤모델로 삼은 인물의 역량과 가치관을 일목요연한 인포그래픽으로 제작하여 조리 있게 발표함",
        "다양한 직업군 종사자들의 실제 노력과 기여도를 분석하고, 직업을 통해 실현할 수 있는 사회적 가치를 정리함"
      ]
    },
    {
      topic: "직업 체험 학습",
      elements: [
        "가상 현실 소방 지점 체험 후 사명감 가득한 직업 안전 인물들의 숭고한 정신을 논리 정연히 기재함",
        "스마트 교통 디자인 가상 부스 관람 중 첨단 문명 속 배려 장치의 필요성을 예리하게 지적함",
        "직무 활동 체험에서 성실과 위기 안전 수칙을 완벽히 지키며 체험 분위기의 수준을 배가시킴",
        "체험 마당 시 모둠 아동들이 지지부진하지 않도록 차례를 조율해 고르고 행복한 관람을 리드함"
      ]
    },
    {
      topic: "대학 학과 기획",
      elements: [
        "관심 있는 미래 생명 과학과 진로 탐구를 바탕으로 인물 평화 가상 실현 로드맵을 정립함",
        "진로 인재성 조건에 부합하는 중장기 독서 수립록을 체계적으로 서술하며 학습 열망을 높임",
        "선망 학과의 이타적 실천 동아리 활동을 손수 기획 연구하여 소감 보고서를 완성도 높게 전함",
        "진로 정보 기여 재능 발표 기회를 빌려 구체적 로드맵을 알찬 조리로 발표하여 칭송을 유도함"
      ]
    },
    {
      topic: "커리어 설계 플래닝",
      elements: [
        "AI 분석 조언가 피드백을 수용하여 평화 공조 직무 설계에 따른 고차원 자율 플래닝을 실현함",
        "미래 고정 관념을 탈피한 유연한 커리어 다변화 전술을 구축하고 이타적 재능 나눔을 최종 목표에 넣음",
        "커리어 마인드맵 수립에서 자율, 협조, 봉사 중심 3대 가치 단어를 엮어 선명한 비전을 구사함",
        "동료들과 미래 성장계획 연동 워크숍을 자영 전개해 든든하게 격려하는 서사 교류 시간을 주도함"
      ]
    },
    {
      topic: "기업가정신 모의",
      elements: [
        "사회적 약자를 돕는 공생적 벤처 아이디어를 기획하고 동료들의 참여를 이끌어내는 협동력을 보임",
        "모의 투자 유치 발표회에서 배려 가치를 담은 브랜딩 논점을 자신감 있게 피력해 박수를 받음",
        "성공이나 고수익을 겨냥하기보다 공익적 파급력에 초점을 둔 착한 이윤 추구 전략을 수립함",
        "사업 타당성 팀 토론 과정에서 다른 팀원의 제안에 적극 공감하며 합리적이고 유려하게 타협을 일굼"
      ]
    }
  ]
};

const DOMAIN_INFO: Record<string, string> = {
  "자율활동": "자치·학급 자율 협의 중심의 성향과, 실천적 또래 조력 및 나눔 등 공동체 배려 의식이 녹아 있는 활동입니다.",
  "동아리활동": "학술·문화예술·체육 탐구 동아리 내에서, 실천적인 타인 배려와 나눔 활동이 결합된 형태입니다.",
  "진로활동": "자기 소질 발견, 진로 탐색, 롤모델의 사회 기여 분석을 통해 바람직한 직업관을 정립하는 활동입니다."
};

interface GroupedRecommendations {
  element: string;
  items: { id: number; recommendedText: string }[];
}

// On-the-fly sanitizer to enforce user intent rules:
// 1. Double quotes replaced with single quotes
// 2. Remove leading student Name prefix like `${studentName}은/는/이/가` etc.
function processSentenceCleanup(rawText: string, replaceName?: string): string {
  let text = rawText.trim();
  
  // Replace double quotes with single quotes as requested
  text = text.replace(/"/g, "'");

  // Remove the leading placeholder and its particle if present at the start of sentence
  text = text.replace(/^\$\{studentName\}\s*(은\/는|이\/가|은|는|이|가|이\(가\))?\s*/, "");
  
  if (replaceName) {
    // If a custom replace name is set, strip it also if it was generated at the beginning
    const rx = new RegExp(`^${replaceName}\\s*(은\\/는|이\\/가|은|는|이|가|이\\(가\\))?\\s*`);
    text = text.replace(/\$\{studentName\}/g, replaceName);
    text = text.replace(rx, "");
  }

  // Double check and strip redundant starting spaces
  return text.trim();
}

export default function CreativePlayground({
  provider,
  model,
  geminiKey,
  openaiKey,
  groqKey = "",
  xaiKey = "",
  onShowKeyPanel
}: CreativePlaygroundProps) {
  // Domain selection (2022 revised lists)
  const [activeDomain, setActiveDomain] = useState<string>("자율활동");
  
  // Selected values
  const [selectedTopic, setSelectedTopic] = useState<string>(CREATIVE_PRESETS["자율활동"][0].topic);
  const [selectedElements, setSelectedElements] = useState<string[]>([CREATIVE_PRESETS["자율활동"][0].elements[0]]);
  
  // Custom text override toggle
  const [customTopic, setCustomTopic] = useState<string>("");
  const [customElement, setCustomElement] = useState<string>("");
  const [isCustomTopicUsed, setIsCustomTopicUsed] = useState<boolean>(false);
  const [isCustomElementUsed, setIsCustomElementUsed] = useState<boolean>(false);

  // AI-generated elements states
  const [aiGeneratedElements, setAiGeneratedElements] = useState<string[]>([]);
  const [isGeneratingElements, setIsGeneratingElements] = useState<boolean>(false);

  // General settings state
  const [tone, setTone] = useState<string>("noun");
  
  // Fully custom character limit input (allowing teacher to directly input)
  const [maxLength, setMaxLength] = useState<number>(180);
  
  const [creativityLevel, setCreativityLevel] = useState<string>("medium");
  const [additionalInstructions, setAdditionalInstructions] = useState<string>("");
  
  // Grouped results display
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [groupedResults, setGroupedResults] = useState<GroupedRecommendations[]>([]);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(0);
  
  // Extra controls
  const [replaceName, setReplaceName] = useState<string>("");
  const [copySuccessId, setCopySuccessId] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editTextValue, setEditTextValue] = useState<string>("");

  // Cumulative storage states
  const [accumulatedItems, setAccumulatedItems] = useState<Array<{
    id: string;
    domain: string;
    topic: string;
    element: string;
    text: string;
  }>>(() => {
    try {
      const saved = localStorage.getItem("creative_accumulated_items");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [accumulatedIds, setAccumulatedIds] = useState<Record<string, boolean>>({});

  // Sync accumulatedItems to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("creative_accumulated_items", JSON.stringify(accumulatedItems));
    } catch (e) {
      console.error("Failed to save creative_accumulated_items to localStorage", e);
    }
  }, [accumulatedItems]);

  // Keep dropdown values in sync when Domain switches
  useEffect(() => {
    const list = CREATIVE_PRESETS[activeDomain] || [];
    if (list.length > 0) {
      setSelectedTopic(list[0].topic);
      setSelectedElements([list[0].elements[0]]);
      setIsCustomTopicUsed(false);
      setIsCustomElementUsed(false);
      setCustomTopic("");
      setCustomElement("");
      setAiGeneratedElements([]);
    }
  }, [activeDomain]);

  const activeTopicValue = isCustomTopicUsed ? customTopic : selectedTopic;
  
  // Sub observation list determined by active topic
  const currentTopicList = CREATIVE_PRESETS[activeDomain] || [];
  const currentElementsList = (isCustomTopicUsed && aiGeneratedElements.length > 0)
    ? aiGeneratedElements
    : (currentTopicList.find(t => t.topic === selectedTopic)?.elements || []);

  const handleToggleElement = (element: string) => {
    if (selectedElements.includes(element)) {
      setSelectedElements(selectedElements.filter(el => el !== element));
    } else {
      setSelectedElements([...selectedElements, element]);
    }
  };

  const handleSelectAllElements = () => {
    setSelectedElements([...currentElementsList]);
  };

  const handleDeselectAllElements = () => {
    setSelectedElements([]);
  };

  const handleGenerateElements = async () => {
    if (!customTopic.trim()) {
      alert("먼저 대표 실천 주제 및 활동명을 직접 입력해 주십시오.");
      return;
    }

    setIsGeneratingElements(true);
    try {
      const elements = await clientGenerateCreativeElements({
        domain: activeDomain,
        topic: customTopic.trim(),
        provider,
        model,
        geminiKey,
        openaiKey,
        groqKey,
        xaiKey
      });

      if (elements && elements.length > 0) {
        setAiGeneratedElements(elements);
        setSelectedElements(elements);
        setIsCustomElementUsed(false); // Switch to checkboxes list to make sure they see them
      } else {
        alert("원하는 구체적 관찰 요소를 자동으로 생성하지 못했습니다. 다시 시도해 주십시오.");
      }
    } catch (error: any) {
      console.error(error);
      alert("관찰 요소 생성 도중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsGeneratingElements(false);
    }
  };

  const handleGenerate = async () => {
    if (!activeTopicValue.trim()) {
      alert("대표 실천 주제 및 활동명을 입력하거나 선택해 주십시오.");
      return;
    }

    const finalElementsToProcess = isCustomElementUsed 
      ? (customElement.trim() ? [customElement.trim()] : [])
      : selectedElements;

    if (finalElementsToProcess.length === 0) {
      alert("구체적 관찰 요소를 1개 이상 입력하거나 선택해 주십시오.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setGroupedResults([]);
    setActiveGroupIndex(0);

    try {
      const results = await clientGenerateCreativeRecommendations({
        domain: activeDomain,
        topic: activeTopicValue,
        element: finalElementsToProcess[0], // fallback singular
        elements: finalElementsToProcess,    // plural list
        tone,
        maxLength,
        creativityLevel,
        additionalInstructions,
        provider,
        model,
        geminiKey: geminiKey ? geminiKey.trim() : "",
        openaiKey: openaiKey ? openaiKey.trim() : "",
        groqKey: groqKey ? groqKey.trim() : "",
        xaiKey: xaiKey ? xaiKey.trim() : ""
      });

      if (results && Array.isArray(results) && results.length > 0) {
        setGroupedResults(results);
        setActiveGroupIndex(0);
      } else {
        throw new Error("올바른 응답 데이터를 받지 못했습니다. 다시 시도해 주세요.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "평어 구절 생성 도중 일시적인 네트워크 오류가 생겼습니다. API 키나 서버 리소스를 확인해 주십시오.");
    } finally {
      setIsLoading(false);
    }
  };

  // Safe handler to copy sentence
  const handleCopy = (id: number, text: string) => {
    const cleanedText = processSentenceCleanup(text, replaceName);
    navigator.clipboard.writeText(cleanedText);
    setCopySuccessId(id);
    setTimeout(() => setCopySuccessId(null), 1500);
  };

  const handleSaveEdit = (idx: number) => {
    const updated = [...groupedResults];
    updated[activeGroupIndex].items[idx].recommendedText = editTextValue;
    setGroupedResults(updated);
    setEditIndex(null);
  };

  // Copies all sentences of the currently active elements tab group
  const handleCopyAllActiveGroup = () => {
    const activeGroup = groupedResults[activeGroupIndex];
    if (!activeGroup) return;

    const bulletedText = activeGroup.items.map((r, i) => {
      const cleaned = processSentenceCleanup(r.recommendedText, replaceName);
      return `${i + 1}. ${cleaned}`;
    }).join("\n");
    
    navigator.clipboard.writeText(bulletedText);
    alert(`"${activeGroup.element}" 관련 생성된 10개의 명문이 클립보드에 일괄 복사되었습니다!`);
  };

  // Export as CSV/Excel helper for Creative Experience (창체)
  const handleExportCSV = () => {
    if (groupedResults.length === 0) return;

    // CSV Header with BOM for Korean Excel compatibility
    let csvContent = "\uFEFF";
    csvContent += "하위영역,대표실천주제,선택관찰요소,추천구분,추천기재평어,글자수\n";

    groupedResults.forEach((group) => {
      group.items.forEach((item, idx) => {
        const cleanedText = processSentenceCleanup(item.recommendedText, replaceName);
        const lengthChar = cleanedText.length;
        
        // Escape commas and double quotes for clean CSV
        const escapedDomain = activeDomain.replace(/"/g, '""');
        const escapedTopic = activeTopicValue.replace(/"/g, '""');
        const escapedElement = group.element.replace(/"/g, '""');
        const escapedCleanText = cleanedText.replace(/"/g, '""');
        
        csvContent += `"${escapedDomain}","${escapedTopic}","${escapedElement}","${idx + 1}안","${escapedCleanText}",${lengthChar}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeDomain}_${activeTopicValue}_창체_기재평어_추천목록.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add individual recommendation to cumulative array
  const handleAddToAccumulation = (originalId: number | string, text: string, element: string) => {
    const cleanedText = processSentenceCleanup(text, replaceName);
    const isAlreadyAdded = accumulatedItems.some(
      (item) => item.text === cleanedText && item.topic === activeTopicValue
    );

    if (isAlreadyAdded) {
      alert("이미 누적 보관함에 동일한 성취 문구가 보존되어 있습니다.");
      return;
    }

    const newItem = {
      id: `${originalId}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      domain: activeDomain,
      topic: activeTopicValue,
      element: element,
      text: cleanedText
    };

    setAccumulatedItems(prev => [...prev, newItem]);

    // Set momentary visual success feedback
    setAccumulatedIds(prev => ({ ...prev, [originalId]: true }));
    setTimeout(() => {
      setAccumulatedIds(prev => ({ ...prev, [originalId]: false }));
    }, 1500);
  };

  // Bulk add current active tab's 10 items
  const handleAddAllActiveGroupToAccumulation = () => {
    const activeGroup = groupedResults[activeGroupIndex];
    if (!activeGroup) return;

    let addedCount = 0;
    const newItems: Array<{
      id: string;
      domain: string;
      topic: string;
      element: string;
      text: string;
    }> = [];

    activeGroup.items.forEach((item) => {
      const cleanedText = processSentenceCleanup(item.recommendedText, replaceName);
      const isAlreadyAdded = accumulatedItems.some(
        (existing) => existing.text === cleanedText && existing.topic === activeTopicValue
      );
      if (!isAlreadyAdded) {
        newItems.push({
          id: `${item.id}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          domain: activeDomain,
          topic: activeTopicValue,
          element: activeGroup.element,
          text: cleanedText
        });
        addedCount++;
      }
    });

    if (newItems.length > 0) {
      setAccumulatedItems(prev => [...prev, ...newItems]);
      alert(`새로운 ${addedCount}개의 창체 평어를 누적 보관함에 성공적으로 담았습니다.`);
    } else {
      alert("현재 탭의 모든 문구가 이미 보관함에 담겨있습니다.");
    }
  };

  // Delete individual saved row
  const handleDeleteAccumulatedItem = (idToDelete: string) => {
    setAccumulatedItems(prev => prev.filter(item => item.id !== idToDelete));
  };

  // Clear list with confirm
  const handleClearAccumulatedItems = () => {
    if (window.confirm("정말로 누적 보관함의 모든 저장 항목을 초기화(기밀 삭제)하시겠습니까?")) {
      setAccumulatedItems([]);
    }
  };

  // Export accumulated data as unified CSV
  const handleExportAccumulatedCSV = () => {
    if (accumulatedItems.length === 0) {
      alert("보관함이 비어있습니다. 먼저 문구를 생성하여 보관함에 담아 주십시오.");
      return;
    }

    // CSV Header with BOM for Korean Excel compatibility
    let csvContent = "\uFEFF";
    csvContent += "하위영역,대표실천주제/활동명,선택관찰요소,누적기재평어,글자수\n";

    accumulatedItems.forEach((item) => {
      // Escape commas and double quotes for clean CSV
      const escapedDomain = item.domain.replace(/"/g, '""');
      const escapedTopic = item.topic.replace(/"/g, '""');
      const escapedElement = item.element.replace(/"/g, '""');
      const escapedCleanText = item.text.replace(/"/g, '""');
      const lengthChar = item.text.length;
      
      csvContent += `"${escapedDomain}","${escapedTopic}","${escapedElement}","${escapedCleanText}",${lengthChar}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `창의적체험활동_누적_생기부_평어목록.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasApiKey = 
    (provider === "gemini" && geminiKey) || 
    (provider === "openai" && openaiKey) ||
    (provider === "groq" && groqKey) ||
    (provider === "xai" && xaiKey);

  return (
    <div id="creative-playground-container" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      {/* LEFT COLUMN: Input controls & presets selection (7/12 cols) */}
      <section id="creative-inputs-column" className="lg:col-span-7 space-y-6">
        
        {/* Mode & Domain Selector Card */}
        <div id="domain-selector-card" className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl space-y-4">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">1. 2022 개정 창체 하위 영역 선택</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.keys(CREATIVE_PRESETS).map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => setActiveDomain(domain)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  activeDomain === domain
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-600 hover:text-slate-900 border-slate-200"
                }`}
              >
                {domain}
              </button>
            ))}
          </div>
          <div className="p-3 bg-white border border-slate-100 rounded-xl flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-slate-500 font-sans">
              <strong>{activeDomain} 통합 지침:</strong> {DOMAIN_INFO[activeDomain]}
            </p>
          </div>
        </div>

        {/* Preset Selectors Component */}
        <div id="presets-selector-card" className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-sm">2. 핵심 활동 및 관찰 요소 선택 및 보완</h3>
            </div>
            
            <span className="text-[10px] text-slate-450 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200/50 font-semibold">
              활동명 기준 신속 반영
            </span>
          </div>

          {/* Master Topic Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">대표 실천 주제 및 활동명 예시</label>
              <button
                type="button"
                onClick={() => setIsCustomTopicUsed(!isCustomTopicUsed)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
              >
                {isCustomTopicUsed ? "🎯 추천 예시 목록형 보기" : "✏️ 자유 수동 입력하기"}
              </button>
            </div>

            {isCustomTopicUsed ? (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="custom-topic-input"
                    type="text"
                    value={customTopic}
                    onChange={(e) => {
                      setCustomTopic(e.target.value);
                      if (aiGeneratedElements.length > 0) {
                        setAiGeneratedElements([]);
                        setSelectedElements([]);
                      }
                    }}
                    placeholder="학교에서 운영한 활동명(예: 학급 환경 지킴이, 교내 코딩 해커톤 등)을 직접 적으세요."
                    className="flex-1 px-3.5 py-2.5 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateElements}
                    disabled={isGeneratingElements || !customTopic.trim()}
                    className={`px-4 py-2.5 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs ${
                      isGeneratingElements || !customTopic.trim()
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : "bg-indigo-600 border border-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                    }`}
                  >
                    <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isGeneratingElements ? "animate-spin" : ""}`} />
                    <span>{isGeneratingElements ? "관찰요소 생성 중..." : "관찰요소 AI 추천받기"}</span>
                  </button>
                </div>
                {aiGeneratedElements.length > 0 && (
                  <p className="text-[10.5px] text-indigo-700 font-sans font-semibold flex items-center gap-1.5 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100/60 leading-normal">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>입력하신 활동명에 부합하는 관찰요소 4가지가 아래 목록에 추천 적용되었습니다! 다중 선택하여 기재 문구를 생성해 보세요.</span>
                  </p>
                )}
              </div>
            ) : (
              <select
                id="preset-topic-selector"
                value={selectedTopic}
                onChange={(e) => {
                  setSelectedTopic(e.target.value);
                  const selectedObj = currentTopicList.find(t => t.topic === e.target.value);
                  if (selectedObj && selectedObj.elements.length > 0) {
                    setSelectedElements([selectedObj.elements[0]]);
                  } else {
                    setSelectedElements([]);
                  }
                }}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/15 text-slate-750 bg-slate-50 hover:bg-slate-105"
              >
                {currentTopicList.map((t, i) => (
                  <option key={i} value={t.topic}>{t.topic}</option>
                ))}
              </select>
            )}
          </div>

          {/* Sub Observation Elements Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                구체적 행동 지향 및 관찰 요소 (복수 선택하여 문장 개별 발급 가능)
              </label>
              <button
                type="button"
                onClick={() => setIsCustomElementUsed(!isCustomElementUsed)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
              >
                {isCustomElementUsed ? "🎯 추천 예시 활용과 선택" : "✏️ 수동 관찰요소 직접 입력"}
              </button>
            </div>

            {isCustomElementUsed ? (
              <textarea
                id="custom-element-input"
                rows={3}
                value={customElement}
                onChange={(e) => setCustomElement(e.target.value)}
                placeholder="학생의 행동 특색, 자발적 실천 모습을 자유롭게 기록하세요."
                className="w-full px-3.5 py-2.5 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs focus:outline-none"
              />
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-200/60 sticky top-0 bg-transparent">
                  <span className="text-[10.5px] font-semibold text-slate-500">
                    요소를 다중 선택 가능 ({selectedElements.length}개)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllElements}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 px-1 py-0.5"
                    >
                      전체선택
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllElements}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-600 px-1 py-0.5"
                    >
                      전체해제
                    </button>
                  </div>
                </div>
                {currentElementsList.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">하위 관찰행동 예시가 부재합니다.</p>
                ) : (
                  <div className="space-y-1.55">
                    {currentElementsList.map((el, i) => {
                      const isSelected = selectedElements.includes(el);
                      return (
                        <div
                          key={i}
                          onClick={() => handleToggleElement(el)}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border text-[11px] leading-relaxed transition-all cursor-pointer select-none ${
                            isSelected
                              ? "bg-indigo-50 border-indigo-200 text-indigo-950"
                              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
                          }`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {isSelected ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-slate-300 bg-white" />
                            )}
                          </div>
                          <span className="font-semibold leading-normal">{el}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-slate-400 font-sans">
              * 여러 관찰 요소를 선택하시면 요소 마다 각각 전용 명문 10개 세트가 생성되어 탭으로 분류됩니다.
            </p>
          </div>

        </div>

        {/* Quality Controls Configuration Card */}
        <div id="quality-configuration-card" className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">3. 상세 조건 및 한도 글자수 맞춤 조율</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Tone Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600">서술형 문장 종결 어미</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="noun">~함. ~임. (개조 명사식 종결 - 추천)</option>
                <option value="respect">~합니다. ~어울림. (정중 구체 서술체)</option>
                <option value="special">~함이 돋보임. ~가 탁월함. (극찬 강조형)</option>
              </select>
            </div>

            {/* Editable Max Length Count */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600">공백포함 기재 한도 글자 자수</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={maxLength}
                  onChange={(e) => setMaxLength(Math.max(10, Number(e.target.value) || 150))}
                  min={10}
                  max={1000}
                  className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-1 items-center">
                  {[120, 180, 250].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMaxLength(num)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        maxLength === num
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-2xs"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {num}자
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Creativity/Freedom Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600">문장 표현 다양성 수준</label>
              <select
                value={creativityLevel}
                onChange={(e) => setCreativityLevel(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="low">낮음 (골라진 조건 단어 보존적 기재)</option>
                <option value="medium">중간 (기품 있고 수려한 표현 혼용 - 추천)</option>
                <option value="high">높음 (가장 다채롭고 감화력 있는 유의어 확장)</option>
              </select>
            </div>

            {/* Target Student Name for On-the-fly replacement */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-indigo-600 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>기재 교체 타겟 학생 이름 (선택)</span>
              </label>
              <input
                type="text"
                value={replaceName}
                onChange={(e) => setReplaceName(e.target.value)}
                placeholder="공란 제출 시 학생명은 생략/지능 처리"
                className="w-full p-2.5 bg-indigo-50/25 border border-indigo-100/50 rounded-xl text-xs font-bold text-slate-705 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:font-normal placeholder:text-slate-400"
              />
            </div>

          </div>

          {/* Teacher custom prompt input */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-bold text-slate-600">나머지 선생님 개별 요청 사항 (선택)</label>
            <input
              type="text"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="예: 조장 역할을 좀더 구체적으로 칭찬, 온화한 배려 미덕 강조"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-550/10"
            />
          </div>

          {/* Generation Trigger Area */}
          <div className="pt-3 border-t border-slate-100">
            {!hasApiKey && (
              <div className="p-3 bg-amber-50 border border-amber-100/60 rounded-xl text-amber-800 text-[11px] mb-3 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>개인 관찰 API 연동 안내:</strong> 
                  <span className="ml-1">
                    우측 상단 [⚙️ AI 설정 및 API 키] 메뉴에 키를 추가하시면 원외 우수 속도로 직접 집필합니다. 미등록 상태에서는 로컬 기본 템플릿 명문이 지급됩니다.
                  </span>
                  <button
                    type="button"
                    onClick={onShowKeyPanel}
                    className="ml-1.5 text-indigo-600 font-extrabold underline hover:text-indigo-805 inline-block"
                  >
                    키 입력창 열기
                  </button>
                </div>
              </div>
            )}

            <button
              id="btn-creative-recommend-generate"
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-extrabold text-xs shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>2022 개정 창체 요소별 문구 분활 집필 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>🎯 고품격 창체 특기사항 개별 후보문 발급하기</span>
                </>
              )}
            </button>
          </div>
        </div>

      </section>

      {/* RIGHT COLUMN: Output display window (5/12 cols) */}
      <section id="creative-outputs-column" className="lg:col-span-5 space-y-6">
        
        {/* Output container */}
        <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm min-h-[460px] space-y-4">
          
          <div className="flex justify-between items-start border-b border-slate-100 pb-4">
            <div className="space-y-0.5">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <FileText className="w-4.5 h-4.5 text-indigo-600" />
                <span>추천 기재 평어 확인 및 등재</span>
              </h3>
              <p className="text-[10px] text-slate-400">
                따옴표가 전면 배제되고 이름이 시작하지 않는 세련된 문장들이 배치됩니다.
              </p>
            </div>

            {groupedResults.length > 0 && groupedResults[activeGroupIndex] && (
              <div className="flex flex-wrap gap-1.5 items-center shrink-0">
                <button
                  type="button"
                  onClick={handleAddAllActiveGroupToAccumulation}
                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                  title="현재 탭에 생성된 10개 문구를 모두 누적 보관함에 저장"
                >
                  <Plus className="w-3 h-3" />
                  <span>➕ 전체 담기</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                  title="현 활동 엑셀(CSV) 파일로 내보내기"
                >
                  <Download className="w-3 h-3" />
                  <span>다운로드</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyAllActiveGroup}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                >
                  <Copy className="w-3 h-3" />
                  <span>일괄복사</span>
                </button>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed">
              <AlertTriangle className="w-4.5 h-4.5 text-red-650 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-red-800">기재 오류 발생원인 통지</p>
                <p className="text-[11px] text-red-600 font-medium whitespace-pre-wrap">{errorMessage}</p>
                <p className="text-[10px] text-slate-500 pt-1">
                  💡 개인 수령한 API 키가 설정되어 있는지 재확인하여 보시기 바랍니다.
                </p>
              </div>
            </div>
          )}

          {/* Loading status representation */}
          {isLoading && (
            <div className="py-16 text-center space-y-4 animate-pulse">
              <div className="w-10 h-10 bg-indigo-150 rounded-full flex items-center justify-center mx-auto text-indigo-600 animate-spin">
                <RotateCcw className="w-5 h-5" />
              </div>
              <p className="text-xs text-indigo-600 font-bold">인공지능 문예 전문가가 2022 영역 지침을 심층 학습 중입니다.</p>
              <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                선택하신 개별 관찰 요소별로 독립된 문장을 생성하고 있는 단계입니다. 문장 첫 어투에 학생명 주격 조사를 완전 배제하고, 따옴표 없이 자연스럽게 완성합니다.
              </p>
            </div>
          )}

          {/* Empty guidance screen representation */}
          {!isLoading && groupedResults.length === 0 && (
            <div className="py-20 text-center space-y-4">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-450">
                <Compass className="w-6 h-6 text-indigo-505" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-700">추천 기재가 준비되어 대기 중입니다</h4>
                <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  좌측에서 연계된 하위 실천 및 요소를 복수 선택한 후, 하단 <strong>[창체 특기사항 개별 후보문 발급하기]</strong> 버튼을 누르십시오.
                </p>
              </div>
            </div>
          )}

          {/* Grouped Tabbed Navigation Results Rendering */}
          {!isLoading && groupedResults.length > 0 && (
            <div className="space-y-4">
              
              {/* Tabs list for each element */}
              <div className="flex border-b border-slate-200 overflow-x-auto gap-1 pb-1 -mx-2 px-2 scrollbar-none">
                {groupedResults.map((group, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveGroupIndex(idx);
                      setEditIndex(null);
                    }}
                    className={`px-3 py-1.5 rounded-t-lg text-[10.5px] font-bold text-center border-t border-x transition-all shrink-0 cursor-pointer ${
                      activeGroupIndex === idx
                        ? "bg-indigo-50 border-slate-250 text-indigo-750 font-extrabold"
                        : "bg-white border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {group.element.length > 12 ? `${group.element.substring(0, 11)}...` : group.element}
                  </button>
                ))}
              </div>

              {/* Alert Badge */}
              <div className="p-3 bg-indigo-50/40 border border-indigo-150/20 rounded-xl text-indigo-950 text-[10.5px] leading-relaxed flex items-start gap-1.5">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-indigo-805">💡 생기부 등록 극대화 가이드</p>
                  <p className="text-slate-500 font-sans leading-relaxed">
                    선택한 요소 <strong>"{groupedResults[activeGroupIndex]?.element}"</strong> 전용 후보입니다. 시작 주어로 이름이 오지 않으며 큰따옴표가 전면 배제되어 완벽히 내이스 규격에 일치합니다.
                  </p>
                </div>
              </div>

              {/* Active list contents */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {groupedResults[activeGroupIndex]?.items.map((item, idx) => {
                  const processed = processSentenceCleanup(item.recommendedText, replaceName);
                  const lengthChar = processed.length;
                  const isEditing = editIndex === idx;

                  return (
                    <div 
                      key={item.id} 
                      className="p-3.5 rounded-2xl border border-slate-100 hover:border-slate-250 bg-white hover:bg-slate-50/25 transition-all text-xs font-sans shadow-2xs group relative"
                    >
                      {/* Top labels */}
                      <div className="flex items-center justify-between mb-1.5 select-none">
                        <span className="font-bold text-slate-400 text-[10px] font-mono">
                          MATCHER {idx + 1}안
                        </span>
                        <span className="text-[9.5px] text-slate-400 font-mono">
                          {lengthChar}자 (한글포함)
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            rows={3}
                            value={editTextValue}
                            onChange={(e) => setEditTextValue(e.target.value)}
                            className="w-full p-2 border border-slate-250 rounded-xl text-xs focus:outline-none focus:border-indigo-400"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditIndex(null)}
                              className="px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 rounded"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(idx)}
                              className="px-2.5 py-0.5 text-[10px] bg-indigo-600 text-white rounded font-semibold"
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-slate-700 leading-normal font-sans font-medium pr-10 select-text selection:bg-indigo-100">
                            {processed}
                          </p>

                          {/* Float action buttons on hover */}
                          <div className="absolute right-2 bottom-20 group-hover:block hidden flex flex-col gap-1">
                            {/* edit button */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditIndex(idx);
                                setEditTextValue(item.recommendedText);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/80 rounded transition-colors cursor-pointer block"
                              title="수동 수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Quick action buttons */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100/60 flex justify-between items-center bg-transparent">
                            <span className="text-[10px] text-slate-400 font-medium">교사 검토 완료</span>
                            <div className="flex gap-1.5">
                              {/* Add to Cumulative Tray button */}
                              <button
                                type="button"
                                onClick={() => handleAddToAccumulation(item.id, item.recommendedText, groupedResults[activeGroupIndex].element)}
                                className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all flex items-center gap-1 ${
                                  accumulatedIds[item.id]
                                    ? "bg-indigo-100 border-indigo-300 text-indigo-805 scale-95"
                                    : "bg-white hover:bg-indigo-50 border-slate-200 text-indigo-650 shadow-3xs cursor-pointer"
                                }`}
                                title="이 문구를 누적 보관함에 담기 (여러 활동의 문구를 한번에 모아 내보낼 수 있습니다)"
                              >
                                {accumulatedIds[item.id] ? (
                                  <>
                                    <Check className="w-3 h-3 text-indigo-650" />
                                    <span>담기 완료!</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span>보관함 담기</span>
                                  </>
                                )}
                              </button>

                              {/* Clipboard copy button */}
                              <button
                                type="button"
                                onClick={() => handleCopy(item.id, item.recommendedText)}
                                className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all flex items-center gap-1 ${
                                  copySuccessId === item.id
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 scale-95"
                                    : "bg-slate-50 hover:bg-slate-100 border-slate-250 text-slate-700 shadow-3xs cursor-pointer"
                                }`}
                              >
                                {copySuccessId === item.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600 animate-pulse" />
                                    <span>복사완료</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>즉시 복사</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </div>

      </section>

      {/* 📂 Consolidated Cumulative Tray Console (col-span-12) */}
      <section id="creative-accumulated-tray-panel" className="col-span-12 bg-gradient-to-br from-indigo-50/30 via-white to-slate-50/50 border border-slate-250 p-6 rounded-3xl shadow-xs space-y-5 mt-4">
        
        {/* Panel Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-100 pb-4">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="p-1 px-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-mono font-extrabold shadow-3xs">
                NEIS CUMULATOR
              </span>
              <span>📂 창의적 체험활동 생기부 기재 누적 보관함</span>
              <span className="bg-indigo-600 text-white rounded-full px-2.5 py-0.5 text-[11px] font-sans font-black shadow-xs">
                {accumulatedItems.length}개 보관 중
              </span>
            </h3>
            <p className="text-[10.5px] text-slate-400 font-sans">
              각기 다른 창체 영역과 실천 주제에서 생성한 선호 문구를 차곡차곡 모아, 단 하나의 엑셀(CSV) 파일로 일괄 수집하여 출력합니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {accumulatedItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleClearAccumulatedItems}
                  className="px-3.5 py-2 hover:bg-red-50 text-red-650 hover:text-red-700 rounded-xl text-xs font-bold border border-red-200/60 hover:border-red-350 transition-colors flex items-center gap-1.5 shadow-2xs bg-white cursor-pointer"
                  title="누적 보관함을 원클릭 기밀 비우기합니다"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>보관함 비우기</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAccumulatedCSV}
                  className="px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
                  title="일괄 누적 엑셀(CSV) 다운로드"
                >
                  <Download className="w-4 h-4" />
                  <span>📥 누적 파일(CSV) 일괄 다운로드</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Console Box Body content */}
        {accumulatedItems.length === 0 ? (
          <div className="py-12 text-center space-y-3 bg-white/40 border border-dashed border-slate-200/80 rounded-2xl">
            <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Plus className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-600">누적 저장소가 현재 깨끗이 비어 있습니다.</h4>
              <p className="text-[10.5px] text-slate-400 max-w-lg mx-auto leading-relaxed">
                우측 추천 문고 후보군 밑에 있는 <strong className="text-indigo-600 font-bold">[보관함 담기]</strong> 버튼이나 상단의 <strong className="text-indigo-600 font-bold">[➕ 전체 담기]</strong> 버튼을 클릭하여 학급 학생들을 위한 우량 평어들을 기재 종류별로 수합해 보세요!
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Table layout for Desktop view, flex-card for Mobile */}
            <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-2xl bg-white">
              <table className="w-full text-left border-collapse text-xs font-sans">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 font-mono select-none">
                    <th className="py-3 px-4 w-24">하위 영역</th>
                    <th className="py-3 px-4 w-40">실천 주제 / 활동명</th>
                    <th className="py-3 px-4 w-44">선택 관찰요소</th>
                    <th className="py-3 px-4">누적 기재평어 (한글 2022 개정)</th>
                    <th className="py-3 px-4 w-20 text-center">글자수</th>
                    <th className="py-3 px-4 w-16 text-center">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accumulatedItems.map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50/40 transition-colors font-medium">
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-bold text-[10px]">
                          {item.domain}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-705 font-semibold font-sans">{item.topic}</td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] truncate max-w-[160px]" title={item.element}>
                        {item.element}
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 break-all select-text font-sans tracking-tight pr-6">
                        {item.text}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-[11px] text-slate-450">
                        {item.text.length}자
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteAccumulatedItem(item.id)}
                          className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer inline-block"
                          title="이 행만 보관함에서 삭제합니다"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards list backup */}
            <div className="md:hidden space-y-2.5">
              {accumulatedItems.map((item) => (
                <div key={item.id} className="p-3.5 bg-white border border-slate-200 rounded-2xl text-xs space-y-2.5 relative">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-bold text-[10px]">
                      {item.domain}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{item.text.length}자</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-755 font-sans">
                      <span className="text-slate-400 mr-1">주제:</span> {item.topic}
                    </p>
                    <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                      <span className="text-slate-400 mr-1">요소:</span> {item.element}
                    </p>
                    <p className="text-slate-800 leading-relaxed pt-1 select-text">{item.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAccumulatedItem(item.id)}
                    className="absolute right-2 top-2 p-1.5 bg-red-50 text-red-500 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Micro Helpful guide banner */}
            <div className="p-3.5 bg-indigo-50/30 border border-indigo-100/50 rounded-xl leading-relaxed text-[11px] text-indigo-900/80 font-sans font-medium flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.2" />
              <div>
                <strong>💡 보관함 마스터 팁:</strong> 브라우저 저장소(localStorage) 덕분에 창을 끄거나 새로고침하여도 자료가 전적으로 보호됩니다. 각 실천 주제를 하실 때마다 그때그때 보관함에 담아두었다가 일과 종료 후 하단의 <strong>[📥 누적 파일(CSV) 일괄 다운로드]</strong> 버튼을 누르면 단 한 장의 엑셀 문서로 정리 수납되어 나이스 기재 업무 시간을 혁신적으로 절감합니다.
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
