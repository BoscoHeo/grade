import React, { useState, useRef } from "react";
import { Student, EvaluationCriterion, EvaluationGrade, MaskingStyle, EvaluationMode } from "../types";
import { parsePastedTable, maskName } from "../utils";
import { clientParseTableImage } from "../services/aiService";
import { 
  Users, Trash2, Plus, Copy, RefreshCw, FileSpreadsheet, Upload, Table, Sparkles, CheckCircle2 
} from "lucide-react";

interface Props {
  evaluationMode: EvaluationMode;
  criteria: EvaluationCriterion[];
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  setCriteria: React.Dispatch<React.SetStateAction<EvaluationCriterion[]>>;
  onImportExcelSuccess: (rowHeaders: string[], parsedStudents: any[]) => void;
  maskingStyle: MaskingStyle;
  setMaskingStyle: React.Dispatch<React.SetStateAction<MaskingStyle>>;
}

const parseGradeString = (gradeStr: string) => {
  if (!gradeStr) return { topic: "", behavior: "" };
  
  const topicMatch = gradeStr.match(/주제:\s*([^/]+)/);
  const behaviorMatch = gradeStr.match(/행동:\s*(.+)$/);
  
  const topic = topicMatch ? topicMatch[1].trim() : "";
  const behavior = behaviorMatch ? behaviorMatch[1].trim() : "";
  
  if (!topic && !behavior) {
    if (gradeStr.includes("/")) {
      const parts = gradeStr.split("/");
      return { topic: parts[0].trim(), behavior: parts[1].trim() };
    }
    return { topic: gradeStr, behavior: "" };
  }
  
  return { topic, behavior };
};

const getCreativeDropdownsForDomain = (domainStr: string) => {
  const normalized = (domainStr || "").toLowerCase();
  
  if (normalized.includes("자율") || normalized.includes("auto")) {
    return {
      coreTopics: [
        "학급 자치회 및 1인 1역 실천",
        "학교 공동체 내 갈등 예반 및 평화 해결",
        "민주적 학생 자치 토론 및 의사결정 참여",
        "생태 전환 및 교실 탄소중립 실천 활동",
        "학교 안전 규칙 준수 및 재난 대피 훈련",
        "디지털 시민성 및 학급 온-오프라인 예절",
        "상호 존중 및 관계 회복 서약 실천",
        "학교 행사 기획 및 학급 협력 예술 데이"
      ],
      observationElements: [
        "경청하는 태도로 상대방 의견의 타당성을 객관적으로 존중함",
        "모둠원의 이견을 자율적으로 조율하여 타협안을 지혜롭게 제안함",
        "학급 청소 및 1인 1역 환경위생 관리를 성실하게 완수함",
        "공동체 규범 제정 과정에서 솔선수범하여 주도적 발언을 이끌어냄",
        "자발적으로 협동 제안서를 다듬어 학급 전체 생활문화 개선에 이바지함",
        "어려움을 겪는 친구에게 진심 어린 공감과 정서 지지를 끊임없이 보냄",
        "교내 안전 실태를 자율 점검하고 적극 실천 활동에 일원화하여 봉사함",
        "생태 보호 탄소 저감 생활 습관을 앞장서서 친구들에게 전파함"
      ]
    };
  }
  
  if (normalized.includes("동아리") || normalized.includes("club") || normalized.includes("봉사") || normalized.includes("volunt")) {
    return {
      coreTopics: [
        "AI·소프트웨어 및 융합 코딩 프로젝트",
        "창체 동아리 연계 지역사회 나눔 및 교육 봉사",
        "교내 환경 미화 및 친환경 봉사 프로젝트 동아리",
        "문화예술 공연(밴드, 오케스트라, 연극) 협동 기획",
        "창업 및 메이커스 기계 탐구 발명 활동",
        "인문 가치 성찰 및 시 묘사 독서 포럼 동아리",
        "생명 존중 및 또래 상담 조력 나눔 동아리",
        "체험형 어깨동무 스포츠 리그전 및 스포츠 매너 실천",
        "지역 독거 노인/친구를 위한 따뜻한 위문 선물 및 기부제",
        "교내 도서실 정돈 및 도서 분류 자율 나눔 봉사",
        "또래 배움터 학습 멘토링 봉사 프로젝트"
      ],
      observationElements: [
        "팀 프로젝트에서 창의적인 기능 및 색다른 설계 아이디어를 제시함",
        "2022 개정 취지에 부합하여 동아리 내 봉사 활동을 조율하고 이끎",
        "도움이 필요한 친구에게 자발적 멘토를 자처하여 성취를 성실히 도움",
        "협력 과정에서 한마음으로 헌신하며 희생을 즐겁게 기용함",
        "규칙 준수 및 안전사고 방지에 극도로 신경 쓰며 부원들을 통솔함",
        "문제 상황 발생 시 원활하게 다각도 소통을 시도하여 마찰을 종식함",
        "나눔의 가치를 이해하고 배려 기반 봉사 실행 계획을 적극 구상해냄",
        "인내심 있게 팀의 어려운 기기 제어나 환경 청소를 도맡아 처리함",
        "지속적인 또래 조력 및 봉사 정신으로 온화하고 밝은 분위기를 전파함"
      ]
    };
  }
  
  if (normalized.includes("진로") || normalized.includes("career")) {
    return {
      coreTopics: [
        "자기 이해 및 표준형 성격·적성 분석",
        "미래 유망 직종 탐구 및 직업 세계 조사",
        "멘토/롤모델 생애 탐색 보고서 및 강연",
        "인공지능(AI)과 일자리 변화 포럼 연계 진로 계획",
        "현장 직업 체험 활동 및 사후 깊이 있는 질문 설계",
        "내 꿈의 창의 기업 설계 및 가상 스타트업 데모데이",
        "글로벌 이슈(환경, 빈곤 등) 해결을 위한 주체적 진로 설계",
        "진로 장벽 극복 및 회복 탄력성 강화를 위한 포부 가이드"
      ],
      observationElements: [
        "객관적인 수치 자료에 흥미를 느끼며 자판식 성찰서를 빈틈없이 기록함",
        "자신의 관심사와 가치관을 조리 있고 근거 충실하게 당당히 발표함",
        "롤모델 탐구에서 독창적인 질문과 연계 조사로 시각적 패널을 제작함",
        "미래 사회 일자리 변화를 자율 탐색하고 설득력 있는 창업안을 설계함",
        "체험 학습 현장에서 높은 몰입력으로 핵심을 꿰뚫어 상세 기록을 제출함",
        "진로 경로의 난관을 예상하여 성실한 대응 포부를 자기주도적으로 다듬음",
        "흥미 전도사 역할을 주도하여 타 학생들의 직업 흥미도 조사를 조력함",
        "세계를 이롭게 빌드하겠다는 구체적인 글로벌 진로 포부를 당차게 제시함"
      ]
    };
  }

  return {
    coreTopics: [
      "창의 융합 지적 탐구 활동",
      "학교 일상 속 협동 및 정직 나눔",
      "정서를 다지기 위한 자연 관찰 및 일지 기록",
      "학급 평화 규범 내면화 행동 주의력",
      "체육·예술 표현 모둠 기획 연출"
    ],
    observationElements: [
      "모든 과정에서 묵묵하게 다른 학생들을 격려하고 이타성을 발휘함",
      "난제를 만났을 때 대안을 척척 생각해 내는 지적 탐구심이 우수함",
      "자신에게 배정된 의무를 책임감 있게 수행하는 성실한 의지가 강함",
      "동료들의 이견에 상처받지 않고 협치를 이루려는 조율력이 뛰어남",
      "꾸준한 자기 피드백을 통해 매시간마다 소폭 발전하는 노력을 입증함"
    ]
  };
};

const getCreativeChoicesForDomain = (domainStr: string) => {
  const normalized = (domainStr || "").toLowerCase();
  
  if (normalized.includes("자율") || normalized.includes("auto")) {
    return [
      "주제: 학급 자치회 및 1인 1역 실천 / 행동: 경청하는 태도로 상대방 의견의 타당성을 객관적으로 존중함",
      "주제: 학교 공동체 내 갈등 예방 및 평화 해결 / 행동: 모둠원의 이견을 자율적으로 조율하여 타협안을 지혜롭게 제안함",
      "주제: 학급 자치회 및 1인 1역 실천 / 행동: 학급 청소 및 1인 1역 환경위생 관리를 성실하게 완수함",
      "주제: 민주적 학생 자치 토론 및 의사결정 참여 / 행동: 공동체 규범 제정 과정에서 솔선수범하여 주도적 발언을 이끌어냄",
      "주제: 생태 전환 및 교실 탄소중립 실천 활동 / 행동: 생태 보호 탄소 저감 생활 습관을 앞장서서 친구들에게 전파함",
      "주제: 디지털 시민성 및 학급 온-오프라인 예절 / 행동: 상호 온-오프라인 예절을 충실히 지키며 친구들의 안전 소통을 도움",
      "주제: 민주적 학생 자치 토론 및 의사결정 참여 / 행동: 자발적으로 협동 제안서를 다듬어 학급 전체 생활문화 개선에 이바지함"
    ];
  }
  
  if (normalized.includes("동아리") || normalized.includes("club") || normalized.includes("봉사") || normalized.includes("volunt")) {
    return [
      "주제: 창체 동아리 연계 지역사회 나눔 및 교육 봉사 / 행동: 2022 개정 취지에 부합하여 동아리 내 봉사 활동을 조율하고 이끎",
      "주제: AI·소프트웨어 및 융합 코딩 프로젝트 / 행동: 팀 프로젝트에서 창의적인 기능 및 색다른 설계 아이디어를 제시함",
      "주제: 또래 배움터 학습 멘토링 봉사 프로젝트 / 행동: 도움이 필요한 친구에게 자발적 멘토를 자처하여 성취를 성실히 도움",
      "주제: 교내 환경 미화 및 친환경 봉사 프로젝트 동아리 / 행동: 규칙 준수 및 안전사고 방지에 극도로 신경 쓰며 부원들을 통솔함",
      "주제: 문화예술 공연(밴드, 오케스트라, 연극) 협동 기획 / 행동: 문제 상황 발생 시 원활하게 다각도 소통을 시도하여 마찰을 종식함",
      "주제: 생명 존중 및 또래 상담 조력 나눔 동아리 / 행동: 지속적인 또래 조력 및 봉사 정신으로 온화하고 밝은 분위기를 전파함",
      "주제: 지역 독거 노인/친구를 위한 따뜻한 위문 선물 및 기부제 / 행동: 나눔의 가치를 이해하고 배려 기반 봉사 실행 계획을 적극 구상해냄"
    ];
  }
  
  if (normalized.includes("진로") || normalized.includes("career")) {
    return [
      "주제: 자기 이해 및 표준형 성격·적성 분석 / 행동: 자신의 관심사와 가치관을 조리 있고 근거 충실하게 당당히 발표함",
      "주제: 멘토/롤모델 생애 탐색 보고서 및 강연 / 행동: 롤모델 탐구에서 독창적인 질문과 연계 조사로 시각적 패널을 제작함",
      "주제: 인공지능(AI)과 일자리 변화 포럼 연계 진로 계획 / 행동: 미래 사회 일자리 변화를 자율 탐색하고 설득력 있는 창업안을 설계함",
      "주제: 현장 직업 체험 활동 및 사후 깊이 있는 질문 설계 / 행동: 체험 학습 현장에서 높은 몰입력으로 핵심을 꿰뚫어 상세 기록을 제출함",
      "주제: 교내 환경 미화 및 친환경 봉사 프로젝트 동아리 / 행동: 세계를 이롭게 빌드하겠다는 구체적인 글로벌 진로 포부를 당차게 제시함",
      "주제: 내 꿈의 창의 기업 설계 및 가상 스타트업 데모데이 / 행동: 진로 경로의 난관을 예상하여 성실한 대응 포부를 자기주도적으로 다듬음"
    ];
  }

  return [
    "주제: 창의 융합 지적 탐구 활동 / 행동: 난제를 만났을 때 대안을 척척 생각해 내는 지적 탐구심이 우수함",
    "주제: 학교 일상 속 협동 및 정직 나눔 / 행동: 모든 과정에서 묵묵하게 다른 학생들을 격려하고 이타성을 발휘함",
    "주제: 학교 일상 속 협동 및 정직 나눔 / 행동: 자신에게 배정된 의무를 책임감 있게 수행하는 성실한 의지가 강함",
    "주제: 체육·예술 표현 모둠 기획 연출 / 행동: 동료들의 이견에 상처받지 않고 협치를 이루려는 조율력이 뛰어남"
  ];
};

type InputTab = "direct" | "paste" | "image";

export default function StudentTableInput({ 
  evaluationMode,
  criteria, 
  students, 
  setStudents, 
  setCriteria,
  onImportExcelSuccess,
  maskingStyle,
  setMaskingStyle
}: Props) {
  const [activeTab, setActiveTab] = useState<InputTab>("direct");
  const [pasteText, setPasteText] = useState("");
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState("");
  const [focusedInputId, setFocusedInputId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste excel handler
  const handleParsePaste = () => {
    const result = parsePastedTable(pasteText);
    if (!result.success || !result.data) {
      alert(result.message);
      return;
    }
    
    // Auto populate
    const { rowHeaders, students: parsedStudents } = result.data;
    onImportExcelSuccess(rowHeaders, parsedStudents);
    setPasteText("");
    setActiveTab("direct"); // switch to grid
    alert(result.message);
  };

  // Image Upload base64 converters
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const processImageFile = async (file: File) => {
    // Check if it's indeed an image
    if (!file.type.startsWith("image/")) {
      setImageError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    setIsParsingImage(true);
    setImageError("");
    setUploadSuccessMsg("");

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const resultSrc = event.target?.result as string;
        if (!resultSrc) throw new Error("이미지 파일을 읽을 수 없습니다.");
        
        // Extract base64 token
        const base64Content = resultSrc.split(",")[1];
        
        const userApiKey = localStorage.getItem("USER_GEMINI_API_KEY") || "";
        const selectedProvider = (localStorage.getItem("USER_SELECTED_PROVIDER") || "gemini") as "gemini" | "openai";
        const selectedModel = localStorage.getItem("USER_SELECTED_MODEL") || "gemini-3.1-flash-lite";
        const userOpenAiKey = localStorage.getItem("USER_OPENAI_API_KEY") || "";

        const parsedData = await clientParseTableImage({
          base64Image: base64Content,
          mimeType: file.type || "image/png",
          provider: selectedProvider,
          model: selectedModel,
          geminiKey: userApiKey,
          openaiKey: userOpenAiKey
        });
        
        // Validate parsed structures
        if (parsedData.students && Array.isArray(parsedData.students)) {
          // If criteria are present in image, map them
          if (parsedData.criteria && parsedData.criteria.length > 0) {
            const tempCriteria: EvaluationCriterion[] = parsedData.criteria.map((c: any, index: number) => ({
              id: `crit_${Date.now()}_${index}`,
              domain: c.domain || `영역 ${index + 1}`,
              achievementStandard: c.achievementStandard || "",
              evaluationElement: c.evaluationElement || "",
            }));
            setCriteria(tempCriteria);

            // Set students mapped with newly parsed criteria ids
            const tempStudents: Student[] = parsedData.students.map((st: any, sIdx: number) => {
              const studentGrades: Record<string, string> = {};
              tempCriteria.forEach((crit, critIdx) => {
                const parsedGrade = st.grades?.[critIdx]?.gradeValue || "";
                studentGrades[crit.id] = parsedGrade;
              });

              return {
                id: `stud_${Date.now()}_${sIdx}`,
                number: st.number || `${sIdx + 1}`,
                name: st.name || `학생 ${sIdx + 1}`,
                grades: studentGrades,
              };
            });
            setStudents(tempStudents);
          } else {
            // Map with existing criteria
            const tempStudents: Student[] = parsedData.students.map((st: any, sIdx: number) => {
              const studentGrades: Record<string, string> = {};
              criteria.forEach((crit, critIdx) => {
                const parsedGrade = st.grades?.[critIdx]?.gradeValue || "";
                studentGrades[crit.id] = parsedGrade;
              });

              return {
                id: `stud_${Date.now()}_${sIdx}`,
                number: st.number || `${sIdx + 1}`,
                name: st.name || `학생 ${sIdx + 1}`,
                grades: studentGrades,
              };
            });
            setStudents(tempStudents);
          }
          
          setUploadSuccessMsg(`🎉 AI 이미지 일람표가 성공적으로 파싱되었습니다! (${parsedData.students.length}명 로드됨)`);
          setActiveTab("direct");
        } else {
          throw new Error("이미지에서 올바른 학생 구성을 식별하지 못했습니다.");
        }
      };
      
      reader.onerror = () => {
        throw new Error("파일 변환에 실패했습니다.");
      };
      
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setImageError(err.message || "이미지 파싱 과정 중 오류가 발생했습니다. 수동 입력을 권장합니다.");
    } finally {
      setIsParsingImage(false);
    }
  };

  // Add a single student
  const handleAddStudent = () => {
    const nextNum = students.length > 0 ? (Math.max(...students.map(s => parseInt(s.number) || 0)) + 1).toString() : "1";
    const initialGrades: Record<string, string> = {};
    criteria.forEach(c => {
      initialGrades[c.id] = "";
    });

    setStudents([
      ...students,
      {
        id: `stud_${Date.now()}`,
        number: nextNum,
        name: "",
        grades: initialGrades,
      },
    ]);
  };

  // Update single cell info
  const handleUpdateStudent = (id: string, field: "name" | "number", value: string) => {
    setStudents(
      students.map(s => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  // Update specific criterion score
  const handleUpdateGrade = (studentId: string, criterionId: string, value: string) => {
    setStudents(
      students.map(s => {
        if (s.id === studentId) {
          return {
            ...s,
            grades: {
              ...s.grades,
              [criterionId]: value,
            },
          };
        }
        return s;
      })
    );
  };

  // Remove single student
  const handleRemoveStudent = (id: string) => {
    setStudents(students.filter(s => s.id !== id));
  };

  // Clear all students
  const handleClearAll = () => {
    if (confirm("정말로 학생 명단을 전부 지우시겠습니까?")) {
      setStudents([]);
    }
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div id="student-table-section" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 id="section-title-2" className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>
              {evaluationMode === EvaluationMode.SUBJECT 
                ? "3단계: 학생 명단 및 성취수준 평어 입력" 
                : "3단계: 학생별 영역 특성 및 창체 활동 설정"}
            </span>
          </h2>
          <p id="section-desc-2" className="text-sm text-slate-500 mt-1">
            {evaluationMode === EvaluationMode.SUBJECT 
              ? "수행평가 결과표 및 일지 내역을 수동 격자 편집, 엑셀 붙여넣기 혹은 사진 촬영/스캔 업로드로 가져옵니다."
              : "창의적 체험활동의 영역별 활약상, 행동 특색을 템플릿 선택 혹은 직접 간단한 활약 메모로 등록합니다."}
          </p>
        </div>

        {/* Input Method Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl self-start md:self-center">
          <button
            id="tab-btn-direct"
            type="button"
            onClick={() => { setActiveTab("direct"); setImageError(""); setUploadSuccessMsg(""); }}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "direct" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>명단 표 직접수집</span>
          </button>
          
          <button
            id="tab-btn-paste"
            type="button"
            onClick={() => { setActiveTab("paste"); setImageError(""); setUploadSuccessMsg(""); }}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "paste" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>엑셀 붙여넣기</span>
          </button>

          <button
            id="tab-btn-image"
            type="button"
            onClick={() => { setActiveTab("image"); setImageError(""); setUploadSuccessMsg(""); }}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "image" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>AI 성적표 이미지 분석</span>
          </button>
        </div>
      </div>

      {/* Tab Panel: EXCEL PASTE */}
      {activeTab === "paste" && (
        <div id="paste-panel" className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4 animate-fadeIn">
          <div className="text-xs text-indigo-700 space-y-1 bg-white p-3 border border-indigo-100 rounded-xl leading-relaxed">
            <p className="font-semibold">💡 엑셀 또는 한컴오피스(한글) 간편 사용법:</p>
            <p>1. 사용하시는 성적표 엑셀 창에서 <strong>[번호, 성명, 각 영역별 등급]</strong> 열을 포함하여 영역을 선택해 드래그(드래그 복사, Ctrl+C) 합니다.</p>
            <p>2. 아래 입력칸에 마우스 클릭 후 붙여넣기(Ctrl+V) 한 뒤, <strong>'데이터 추출 및 수집'</strong> 버튼을 클릭하면 즉시 연동됩니다.</p>
          </div>
          <textarea
            id="paste-textarea"
            className="w-full h-48 px-4 py-3 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
            placeholder="번호&#9;성명&#9;2. 바르게 고쳐 써요&#13;&#10;1&#9;강지운&#9;잘함&#13;&#10;2&#9;곽이솔&#9;잘함"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button
              id="btn-confirm-paste"
              type="button"
              onClick={handleParsePaste}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              데이터 자동 추출 및 수집
            </button>
          </div>
        </div>
      )}

      {/* Tab Panel: AI IMAGE PARSE */}
      {activeTab === "image" && (
        <div 
          id="image-panel" 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`p-8 border-2 border-dashed rounded-2xl text-center space-y-4 transition-all duration-150 ${
            dragActive ? "border-indigo-500 bg-indigo-50/40" : "border-slate-300 bg-slate-50/40 hover:bg-slate-50"
          }`}
        >
          <input
            id="file-input-ocr"
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {!isParsingImage ? (
            <div className="flex flex-col items-center py-4 space-y-3 cursor-pointer" onClick={handleTriggerUpload}>
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">여기에 성적 일람표 사진을 드래그하여 놓거나 클릭하여 업로드</p>
                <p className="text-xs text-slate-400 mt-1">지원 이미지 포맷: PNG, JPG, WebP (최대 10MB)</p>
              </div>
              <button
                id="btn-upload-file"
                type="button"
                className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-sm"
              >
                이미지 파일 탐색
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Gemini가 일람표 이미지를 분석하고 있습니다...</p>
                <p className="text-xs text-slate-400 mt-1">학생 정보와 수행평가 결과 표를 꼼꼼하게 추출하고 있으니 잠시만 기다려주세요.</p>
              </div>
            </div>
          )}

          {imageError && (
            <div id="image-error-alert" className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs text-left max-w-sm mx-auto">
              ⚠️ {imageError}
            </div>
          )}
        </div>
      )}

      {/* Tab Panel: DIRECT GRID EDIT */}
      {activeTab === "direct" && (
        <div id="direct-panel" className="space-y-4">
          
          {uploadSuccessMsg && (
            <div id="ocr-success-badge" className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{uploadSuccessMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="text-xs font-semibold text-slate-500">대기 중인 명수: <strong className="text-slate-800">{students.length}명</strong></span>
              
              {/* Live masking control on student list */}
              <div className="flex items-center gap-1 bg-white p-1 border border-slate-200 rounded-xl shadow-sm text-[10px] md:text-xs">
                <span className="font-semibold text-slate-500 px-2 shrink-0">개인정보 암호화:</span>
                <button
                  type="button"
                  onClick={() => setMaskingStyle(MaskingStyle.NONE)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    maskingStyle === MaskingStyle.NONE
                      ? "bg-slate-800 text-white"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                  }`}
                >
                  기본 (실명 그대로)
                </button>
                <button
                  type="button"
                  onClick={() => setMaskingStyle(MaskingStyle.MIDDLE_ASTERISK)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    maskingStyle === MaskingStyle.MIDDLE_ASTERISK
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50"
                  }`}
                >
                  이름 마스킹 (강*운)
                </button>
                <button
                  type="button"
                  onClick={() => setMaskingStyle(MaskingStyle.ANONYMOUS)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    maskingStyle === MaskingStyle.ANONYMOUS
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50"
                  }`}
                >
                  가명 보호 (학생 1)
                </button>
              </div>

              {maskingStyle !== MaskingStyle.NONE && (
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100 flex items-center gap-1 animate-pulse shrink-0">
                  <span>🔒 안심 모드 작동 중 (클릭 시 원본 편집 가능)</span>
                </span>
              )}
            </div>
            {students.length > 0 && (
              <button
                id="btn-clear-roster"
                type="button"
                onClick={handleClearAll}
                className="text-xs font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors self-end sm:self-auto cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>학생 전체 삭제</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                  <th className="p-3.5 w-16 text-center">번호</th>
                  <th className="p-3.5 w-40">이름</th>
                  {criteria.map((c, idx) => (
                    <th key={c.id} className="p-3.5 min-w-[150px] font-sans">
                      <div className="font-semibold block truncate max-w-[200px]" title={c.domain || `영역 ${idx + 1}`}>
                        {c.domain || `영역 ${idx + 1}`}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium font-sans truncate max-w-[200px]" title={c.evaluationElement}>
                        {c.evaluationElement || "평가요소 없음"}
                      </div>
                    </th>
                  ))}
                  <th className="p-3.5 w-12 text-center">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {students.map((st, sIdx) => (
                  <tr key={st.id} className="hover:bg-slate-50/40">
                    <td className="p-2 w-16 text-center">
                      <input
                        id={`student-num-input-${sIdx}`}
                        type="text"
                        value={st.number}
                        onChange={(e) => handleUpdateStudent(st.id, "number", e.target.value)}
                        className="w-12 text-center border-0 focus:ring-1 focus:ring-indigo-500 rounded p-1 text-xs"
                      />
                    </td>
                    <td className="p-2 w-40">
                      <input
                        id={`student-name-input-${sIdx}`}
                        type="text"
                        value={
                          focusedInputId === st.id || maskingStyle === MaskingStyle.NONE
                            ? st.name
                            : maskName(st.name, maskingStyle, sIdx)
                        }
                        onFocus={() => setFocusedInputId(st.id)}
                        onBlur={() => setFocusedInputId(null)}
                        onChange={(e) => handleUpdateStudent(st.id, "name", e.target.value)}
                        placeholder="이름 입력"
                        className={`w-full border-0 focus:ring-1 focus:ring-indigo-500 rounded p-1 font-medium text-slate-800 transition-colors ${
                          focusedInputId !== st.id && maskingStyle !== MaskingStyle.NONE
                            ? "bg-indigo-50/70 text-indigo-950 placeholder:text-indigo-300"
                            : ""
                        }`}
                        title={
                          maskingStyle !== MaskingStyle.NONE && focusedInputId !== st.id
                            ? "클릭하여 실명 보기 및 수정 (현재는 안심 마스킹 상태)"
                            : ""
                        }
                      />
                    </td>
                    {criteria.map((c) => (
                      <td key={c.id} className="p-2 align-middle">
                        {evaluationMode === EvaluationMode.SUBJECT ? (
                          <select
                            id={`student-${sIdx}-grade-select-${c.id}`}
                            value={st.grades[c.id] || ""}
                            onChange={(e) => handleUpdateGrade(st.id, c.id, e.target.value)}
                            className="w-full border border-slate-200 focus:ring-1 focus:ring-indigo-500 rounded p-1 text-xs bg-slate-50/50 hover:bg-white cursor-pointer"
                          >
                            <option value="">(평가 공백)</option>
                            <option value={EvaluationGrade.VERY_GOOD}>매우 잘함 (Excellent)</option>
                            <option value={EvaluationGrade.GOOD}>잘함 (Good)</option>
                            <option value={EvaluationGrade.NORMAL}>보통 (Normal)</option>
                            <option value={EvaluationGrade.NEEDS_IMPROVEMENT}>노력요함 (Needs Improvement)</option>
                          </select>
                        ) : (
                          <div className="space-y-1.5 md:min-w-[240px] p-0.5">
                            <input
                              type="text"
                              value={st.grades[c.id] || ""}
                              onChange={(e) => handleUpdateGrade(st.id, c.id, e.target.value)}
                              placeholder="직접 특성 메모 기입 또는 선택"
                              className="w-full border border-slate-200 focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 text-xs bg-slate-50/50 hover:bg-white font-semibold text-slate-700"
                            />
                            
                            {(() => {
                              const { topic, behavior } = parseGradeString(st.grades[c.id] || "");
                              const { coreTopics, observationElements } = getCreativeDropdownsForDomain(c.domain);
                              
                              return (
                                <div className="space-y-1">
                                  {/* Core Topic Select */}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-indigo-500 shrink-0 bg-indigo-50 px-1 rounded">🎯 주제</span>
                                    <select
                                      value={topic}
                                      onChange={(e) => {
                                        const newTopic = e.target.value;
                                        let targetVal = "";
                                        if (newTopic && behavior) {
                                          targetVal = `주제: ${newTopic} / 행동: ${behavior}`;
                                        } else if (newTopic) {
                                          targetVal = `주제: ${newTopic}`;
                                        } else if (behavior) {
                                          targetVal = `행동: ${behavior}`;
                                        }
                                        handleUpdateGrade(st.id, c.id, targetVal);
                                      }}
                                      className="w-full border-0 focus:ring-1 focus:ring-indigo-500 p-0 text-[10px] text-slate-500 bg-transparent cursor-pointer font-medium"
                                    >
                                      <option value="">(핵심 실천 주제 예시 선택)</option>
                                      {coreTopics.map((item, idx) => (
                                        <option key={idx} value={item}>{item}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Concrete Observation Select */}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-amber-500 shrink-0 bg-amber-50 px-1 rounded">📝 관찰</span>
                                    <select
                                      value={behavior}
                                      onChange={(e) => {
                                        const newBehavior = e.target.value;
                                        let targetVal = "";
                                        if (topic && newBehavior) {
                                          targetVal = `주제: ${topic} / 행동: ${newBehavior}`;
                                        } else if (newBehavior) {
                                          targetVal = `행동: ${newBehavior}`;
                                        } else if (topic) {
                                          targetVal = `주제: ${topic}`;
                                        }
                                        handleUpdateGrade(st.id, c.id, targetVal);
                                      }}
                                      className="w-full border-0 focus:ring-1 focus:ring-indigo-500 p-0 text-[10px] text-slate-500 bg-transparent cursor-pointer font-medium"
                                    >
                                      <option value="">(구체적 관찰 요소 예시 선택)</option>
                                      {observationElements.map((item, idx) => (
                                        <option key={idx} value={item}>{item}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="p-2 text-center">
                      <button
                        id={`btn-delete-student-${sIdx}`}
                        type="button"
                        onClick={() => handleRemoveStudent(st.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                        title="행 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}

                {students.length === 0 && (
                  <tr>
                    <td colSpan={criteria.length + 3} className="p-8 text-center text-slate-400 text-xs">
                      학생 목록이 비어 있습니다. 상단의 '샘플 불러오기' 또는 '엑셀 붙여넣기', '이미지 분석'을 활용하거나 아래 버튼으로 직접 추가해 주세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button
            id="btn-add-student-row"
            type="button"
            onClick={handleAddStudent}
            className="flex items-center gap-1.5 px-4 py-2 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-600 bg-white shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>학생 1명 추가</span>
          </button>
        </div>
      )}
    </div>
  );
}
