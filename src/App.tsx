/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  SAMPLE_CRITERIA, 
  SAMPLE_STUDENTS,
  SAMPLE_CREATIVE_CRITERIA,
  SAMPLE_CREATIVE_STUDENTS
} from "./sampleData";
import { 
  EvaluationCriterion, 
  Student, 
  GenerationConfig, 
  GeneratedRecord, 
  RecordTone, 
  MaskingStyle,
  CreativityLevel,
  EvaluationMode
} from "./types";
import EvaluationHeaderInput from "./components/EvaluationHeaderInput";
import StudentTableInput from "./components/StudentTableInput";
import GeneratorConfig from "./components/GeneratorConfig";
import RecordsDashboard from "./components/RecordsDashboard";
import GuidelineBox from "./components/GuidelineBox";
import SmartImportCenter from "./components/SmartImportCenter";
import CreativePlayground from "./components/CreativePlayground";
import { clientGenerateRecords } from "./services/aiService";
import { 
  Sparkles, GraduationCap, CheckSquare, Settings2, Play, RefreshCw, AlertCircle, HelpCircle, ArrowRight, ArrowLeft, Upload, Key, KeyRound, Check, Compass
} from "lucide-react";

type SetupStep = "import" | "criteria" | "students" | "config" | "results";

export default function App() {
  // Wizard state - default is now "import" to greet teachers with a friendly file dropzone immediately!
  const [currentStep, setCurrentStep] = useState<SetupStep>("import");
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>(EvaluationMode.SUBJECT);

  // User-override personal Gemini API Key
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return localStorage.getItem("USER_GEMINI_API_KEY") || "";
  });
  const [showKeyPanel, setShowKeyPanel] = useState<boolean>(false);
  const [keySaveFeedback, setKeySaveFeedback] = useState<boolean>(false);

  // OpenAI, Groq, xAI API Keys & model selection settings
  const [selectedProvider, setSelectedProvider] = useState<"gemini" | "openai" | "groq" | "xai">(() => {
    return (localStorage.getItem("USER_SELECTED_PROVIDER") as "gemini" | "openai" | "groq" | "xai") || "gemini";
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("USER_SELECTED_MODEL") || "gemini-3.1-flash-lite";
  });
  const [userOpenAiKey, setUserOpenAiKey] = useState<string>(() => {
    return localStorage.getItem("USER_OPENAI_API_KEY") || "";
  });
  const [userGroqKey, setUserGroqKey] = useState<string>(() => {
    return localStorage.getItem("USER_GROQ_API_KEY") || "";
  });
  const [userXaiKey, setUserXaiKey] = useState<string>(() => {
    return localStorage.getItem("USER_XAI_API_KEY") || "";
  });
  const [userAccessCode, setUserAccessCode] = useState<string>(() => {
    return localStorage.getItem("USER_ACCESS_CODE") || "";
  });
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);

  const handleSaveProvider = (provider: "gemini" | "openai" | "groq" | "xai") => {
    setSelectedProvider(provider);
    localStorage.setItem("USER_SELECTED_PROVIDER", provider);
    
    // Choose sensible default model for that provider
    const defaults = {
      gemini: "gemini-3.1-flash-lite",
      openai: "gpt-4o-mini",
      groq: "llama-3.3-70b-versatile",
      xai: "grok-2-1212"
    };
    const defaultModel = defaults[provider];
    setSelectedModel(defaultModel);
    localStorage.setItem("USER_SELECTED_MODEL", defaultModel);
    setIsCustomModel(false);
  };

  const handleSaveModel = (model: string, custom = false) => {
    setSelectedModel(model);
    localStorage.setItem("USER_SELECTED_MODEL", model);
    setIsCustomModel(custom);
  };

  // Core structured database
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([
    {
      id: "crit_init",
      domain: "",
      achievementStandard: "",
      evaluationElement: "",
    },
  ]);

  const [students, setStudents] = useState<Student[]>([]);
  
  const [config, setConfig] = useState<GenerationConfig>({
    subject: "국어",
    grade: "6학년 1학기",
    tone: RecordTone.NOUN_ENDING,
    creativityLevel: CreativityLevel.MEDIUM,
    maxLength: 150,
    characterLimitType: "char",
    focusAreas: {
      growthOriented: true,
      activeParticipation: true,
      concreteExamples: true,
      preventDuplication: true,
    },
    additionalInstructions: "",
  });

  const [maskingStyle, setMaskingStyle] = useState<MaskingStyle>(MaskingStyle.NONE);

  // Output generated lists
  const [records, setRecords] = useState<GeneratedRecord[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [networkError, setNetworkError] = useState("");

  const handleSwitchMode = (mode: EvaluationMode) => {
    setEvaluationMode(mode);
    setRecords([]);
    
    if (mode === EvaluationMode.SUBJECT) {
      setCriteria([
        {
          id: "crit_init",
          domain: "",
          achievementStandard: "",
          evaluationElement: "",
        },
      ]);
      setStudents([]);
      setConfig(prev => ({
        ...prev,
        subject: "국어",
        maxLength: 150,
      }));
    } else {
      setCriteria([
        {
          id: "crit_init",
          domain: "자율활동 (Autonomous)",
          achievementStandard: "",
          evaluationElement: "책임감 있는 학급 1인 1역 실천 및 경청 중심의 상호 협력",
        },
      ]);
      setStudents([]);
      setConfig(prev => ({
        ...prev,
        subject: "창의적 체험활동",
        maxLength: 300, // Creative special notes can be a bit longer
      }));
    }
  };

  // Handler: Prefill Sample from PDF
  const handleLoadSample = () => {
    if (evaluationMode === EvaluationMode.SUBJECT) {
      setCriteria(SAMPLE_CRITERIA);
      setStudents(SAMPLE_STUDENTS);
      setConfig(prev => ({
        ...prev,
        subject: "국어",
        maxLength: 150,
      }));
    } else {
      setCriteria(SAMPLE_CREATIVE_CRITERIA);
      setStudents(SAMPLE_CREATIVE_STUDENTS);
      setConfig(prev => ({
        ...prev,
        subject: "창의적 체험활동",
        maxLength: 300,
      }));
    }
    // Auto shift to students setup
    setCurrentStep("students");
  };

  // Handler: Clipboard / Excel importer callback
  const handleImportExcelSuccess = (rowHeaders: string[], parsedStudents: any[]) => {
    // 1. Map Row criteria
    const tempCriteria: EvaluationCriterion[] = rowHeaders.map((header, index) => ({
      id: `crit_${Date.now()}_${index}`,
      domain: header,
      achievementStandard: "",
      evaluationElement: "세부 성취기준 평가 요소",
    }));
    setCriteria(tempCriteria);

    // 2. Map Students
    const tempStudents: Student[] = parsedStudents.map((st, index) => {
      const studentGrades: Record<string, string> = {};
      tempCriteria.forEach((crit, critIdx) => {
        studentGrades[crit.id] = st.grades[critIdx] || "";
      });

      return {
        id: `stud_${Date.now()}_${index}`,
        number: st.number || `${index + 1}`,
        name: st.name,
        grades: studentGrades,
      };
    });

    setStudents(tempStudents);
  };

  // Handler: Save custom keys for all providers
  const handleSaveApiKey = () => {
    localStorage.setItem("USER_GEMINI_API_KEY", userApiKey.trim());
    localStorage.setItem("USER_OPENAI_API_KEY", userOpenAiKey.trim());
    localStorage.setItem("USER_GROQ_API_KEY", userGroqKey.trim());
    localStorage.setItem("USER_XAI_API_KEY", userXaiKey.trim());
    localStorage.setItem("USER_ACCESS_CODE", userAccessCode.trim());
    setKeySaveFeedback(true);
    setTimeout(() => setKeySaveFeedback(false), 2000);
  };

  // Handler: Reset custom key
  const handleResetApiKey = (pType: "gemini" | "openai" | "groq" | "xai" | "accessCode") => {
    if (pType === "gemini") {
      setUserApiKey("");
      localStorage.removeItem("USER_GEMINI_API_KEY");
    } else if (pType === "openai") {
      setUserOpenAiKey("");
      localStorage.removeItem("USER_OPENAI_API_KEY");
    } else if (pType === "groq") {
      setUserGroqKey("");
      localStorage.removeItem("USER_GROQ_API_KEY");
    } else if (pType === "xai") {
      setUserXaiKey("");
      localStorage.removeItem("USER_XAI_API_KEY");
    } else {
      setUserAccessCode("");
      localStorage.removeItem("USER_ACCESS_CODE");
    }
    alert("정보가 안전하게 지워졌습니다.");
  };

  // Handler: Main multi-engine generation controller
  const handleGenerateRecords = async () => {
    if (students.length === 0) {
      alert("평어를 생성할 학생 학적 데이터가 등록되어 있지 않습니다. 1단계에서 이미지 스캔, 엑셀 붙여넣기 또는 수동 등록을 마쳐주세요.");
      setCurrentStep("import");
      return;
    }

    setIsGenerating(true);
    setNetworkError("");
    setCurrentStep("results"); // transition view to results dashboard to show progress

    try {
      const results = await clientGenerateRecords({
        evaluationMode,
        criteria,
        students,
        config,
        provider: selectedProvider,
        model: selectedModel,
        geminiKey: userApiKey.trim(),
        openaiKey: userOpenAiKey.trim(),
        groqKey: userGroqKey.trim(),
        xaiKey: userXaiKey.trim()
      });

      if (results && Array.isArray(results)) {
        const mappedRecords: GeneratedRecord[] = results.map((r: any) => ({
          studentId: r.studentId,
          studentName: r.studentName,
          studentNumber: r.studentNumber,
          gradesSummary: r.gradesSummary || "영역 세부 등급 요약",
          recordText: r.recordText,
          isGenerating: false,
        }));
        setRecords(mappedRecords);
      } else {
        throw new Error("올바른 완성 성향 레코드를 받지 못했습니다. 목록 구성을 점검해 주세요.");
      }
    } catch (err: any) {
      console.error(err);
      setNetworkError(err.message || "오류가 발생해 평어를 생성할 수 없습니다. API 연결과 키가 유효한지 상단 설정 패널을 확인해보세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  const stepsList = [
    { id: "import", name: "1. 자료 스마트 등록", icon: Upload },
    { id: "criteria", name: evaluationMode === EvaluationMode.SUBJECT ? "2. 성취기준 세부설정" : "2. 창체 영역 세부설정", icon: GraduationCap },
    { id: "students", name: evaluationMode === EvaluationMode.SUBJECT ? "3. 학생 등급 편집" : "3. 학생 특성 편집", icon: CheckSquare },
    { id: "config", name: "4. 종합 어조 및 효과", icon: Settings2 },
    { id: "results", name: evaluationMode === EvaluationMode.SUBJECT ? "5. 맞춤 평어 확인" : "5. 창체 특기사항 확인", icon: Sparkles },
  ];

  return (
    <div id="school-records-app" className="min-h-screen bg-slate-50/50 flex flex-col justify-between font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Decorative top header line */}
      <div id="top-decor-bar" className="h-[5px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 w-full" />

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6 flex-1">
        
        {/* Header App Brand */}
        <header id="main-header" className="space-y-4 py-2">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2.5">
                <span className="p-2 bg-indigo-600 text-white rounded-2xl shadow-md block">
                  {evaluationMode === EvaluationMode.SUBJECT ? (
                    <GraduationCap className="w-6 h-6" />
                  ) : (
                    <Compass className="w-6 h-6" />
                  )}
                </span>
                <span>
                  {evaluationMode === EvaluationMode.SUBJECT 
                    ? "생활기록부 교과평어 자동 생성기" 
                    : "창의적 체험활동 특기사항 생성기"}
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500">
                {evaluationMode === EvaluationMode.SUBJECT ? (
                  <>인공지능을 활용해 생활기록부 <strong className="text-slate-700 font-semibold">'교과학습 발달상황 피드백'</strong>을 나이스 지침에 완벽 부합하게 실시간 일괄 제작합니다.</>
                ) : (
                  <>인공지능을 활용해 초등학생 <strong className="text-indigo-600 font-bold">'창의적 체험활동(자율·동아리·봉사·진로) 특기사항'</strong>을 교육부 기재요령에 맞추어 맞춤 작성합니다.</>
                )}
              </p>
            </div>
            
            {/* Header Right Menu Actions: API Key Settings Dashboard */}
            <div className="flex items-center gap-2.5">
              <button
                id="btn-toggle-key-panel"
                type="button"
                onClick={() => setShowKeyPanel(!showKeyPanel)}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                  showKeyPanel 
                    ? "bg-slate-800 text-white border-slate-800" 
                    : (selectedProvider === "gemini" && userApiKey) || (selectedProvider === "openai" && userOpenAiKey)
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/50"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"
                }`}
                title="AI 엔진 및 개인 API Key 입력/변경 설정 패널 열기"
              >
                <KeyRound className={`w-3.5 h-3.5 ${((selectedProvider === "gemini" && userApiKey) || (selectedProvider === "openai" && userOpenAiKey)) ? "text-emerald-600" : "text-slate-400"}`} />
                <span>
                  {selectedProvider === "gemini" 
                    ? (userApiKey ? "🔑 Gemini 개인키 연동중" : "⚙️ AI 설정 및 API 키")
                    : (userOpenAiKey ? "🔑 OpenAI 개인키 연동중" : "⚙️ AI 설정 및 API 키")}
                </span>
              </button>

              <div className="text-xs text-slate-400 font-mono bg-white px-3 py-2 border border-slate-200 rounded-xl shadow-sm">
                School Records AI Builder v1.6
              </div>
            </div>
          </div>

          {/* Mode Selector Tab Group */}
          <div id="evaluation-mode-tab-group" className="bg-slate-100 p-1.5 rounded-2xl flex max-w-xl border border-slate-200/50">
            <button
              id="mode-tab-subject"
              type="button"
              onClick={() => handleSwitchMode(EvaluationMode.SUBJECT)}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                evaluationMode === EvaluationMode.SUBJECT
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>교과학습 발달상황 (과목별 평어)</span>
            </button>
            <button
              id="mode-tab-creative"
              type="button"
              onClick={() => handleSwitchMode(EvaluationMode.CREATIVE)}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                evaluationMode === EvaluationMode.CREATIVE
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/40"
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>창의적 체험활동 (자율·동아리·봉사·진로)</span>
            </button>
          </div>

          {/* Expandable Provider & Model Selection Settings Box */}
          {showKeyPanel && (
            <div id="api-key-config-panel" className="bg-white border-2 border-indigo-200 p-6 rounded-2xl shadow-lg animate-fadeIn space-y-4 max-w-3xl">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">인공지능 엔진 및 개별 API Key 세부 설정</h4>
                  <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                    구글 Gemini뿐만 아니라 OpenAI 서비스 모델을 자유롭게 연동하여 초고품질의 학교 생활기록부 평어문을 생성할 수 있습니다. 
                    선택하신 AI 엔진과 입력하신 키는 오직 선생님의 브라우저(LocalStorage) 내부에만 매우 안전하게 즉시 임시 보존됩니다.
                  </p>
                </div>
              </div>

              {/* 1. Provider Tabs */}
              <div className="border-b border-slate-100 pb-2">
                <label className="block text-xs font-bold text-slate-500 mb-2">1. 연동 인공지능 엔진(Provider) 선택</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["gemini", "openai", "groq", "xai"] as const).map((prov) => {
                    const isSel = selectedProvider === prov;
                    const labels = {
                      gemini: "Google Gemini",
                      openai: "OpenAI",
                      groq: "Groq Cloud",
                      xai: "xAI (Grok)"
                    };
                    return (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => handleSaveProvider(prov)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isSel 
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                            : "bg-slate-50/50 hover:bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-800"
                        }`}
                      >
                        <span>{labels[prov]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Key Input for active provider */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500">
                  2. {selectedProvider.toUpperCase()} 개인 API 키(Secret Key) 입력
                </label>
                
                {selectedProvider === "gemini" && (
                  <div className="flex items-center gap-2">
                    <input
                      id="gemini-key-input"
                      type="password"
                      value={userApiKey}
                      onChange={(e) => setUserApiKey(e.target.value)}
                      placeholder="구글 AI Studio 발급 API 키 (AIzaSy...)를 입력하세요 (필수)"
                      className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      {keySaveFeedback ? "완료" : "등록"}
                    </button>
                    {userApiKey && (
                      <button
                        type="button"
                        onClick={() => handleResetApiKey("gemini")}
                        className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium rounded-xl cursor-pointer"
                      >
                        지우기
                      </button>
                    )}
                  </div>
                )}

                {selectedProvider === "openai" && (
                  <div className="flex items-center gap-2">
                    <input
                      id="openai-key-input"
                      type="password"
                      value={userOpenAiKey}
                      onChange={(e) => {
                        setUserOpenAiKey(e.target.value);
                        localStorage.setItem("USER_OPENAI_API_KEY", e.target.value.trim());
                      }}
                      placeholder="OpenAI API 키 (sk-proj-...)를 입력하세요"
                      className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      {keySaveFeedback ? "완료" : "등록"}
                    </button>
                    {userOpenAiKey && (
                      <button
                        type="button"
                        onClick={() => handleResetApiKey("openai")}
                        className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium rounded-xl cursor-pointer"
                      >
                        지우기
                      </button>
                    )}
                  </div>
                )}

                {selectedProvider === "groq" && (
                  <div className="flex items-center gap-2">
                    <input
                      id="groq-key-input"
                      type="password"
                      value={userGroqKey}
                      onChange={(e) => {
                        setUserGroqKey(e.target.value);
                        localStorage.setItem("USER_GROQ_API_KEY", e.target.value.trim());
                      }}
                      placeholder="Groq API 키 (gsk_...)를 입력하세요"
                      className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      {keySaveFeedback ? "완료" : "등록"}
                    </button>
                    {userGroqKey && (
                      <button
                        type="button"
                        onClick={() => handleResetApiKey("groq")}
                        className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium rounded-xl cursor-pointer"
                      >
                        지우기
                      </button>
                    )}
                  </div>
                )}

                {selectedProvider === "xai" && (
                  <div className="flex items-center gap-2">
                    <input
                      id="xai-key-input"
                      type="password"
                      value={userXaiKey}
                      onChange={(e) => {
                        setUserXaiKey(e.target.value);
                        localStorage.setItem("USER_XAI_API_KEY", e.target.value.trim());
                      }}
                      placeholder="xAI API 키 (xai-...)를 입력하세요"
                      className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      {keySaveFeedback ? "완료" : "등록"}
                    </button>
                    {userXaiKey && (
                      <button
                        type="button"
                        onClick={() => handleResetApiKey("xai")}
                        className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium rounded-xl cursor-pointer"
                      >
                        지우기
                      </button>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-slate-400">
                  * 본 시스템은 보안 및 안정성을 위해 별도의 서버 공용 무료 키를 탑재하고 있지 않습니다. 원활한 평어 작성을 위해 위의 {selectedProvider.toUpperCase()} 개인 API 키를 비밀리에 연동등록하여 활용해 주시기 바랍니다. (입력하신 키는 오직 브라우저 로컬 저장소에만 전적으로 안전 보관됩니다.)
                </p>
              </div>

              {/* Extra: Server access code option */}
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <label className="block text-xs font-bold text-slate-500 flex items-center gap-1">
                  <span>🔒 서버 보안 접속코드 (Access Code) 입력 (선택)</span>
                  <span className="text-[10px] text-indigo-500 font-normal">(자체 서버 보안이 설정된 경우에만 입력하십시오)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="access-code-input"
                    type="password"
                    value={userAccessCode}
                    onChange={(e) => {
                      setUserAccessCode(e.target.value);
                      localStorage.setItem("USER_ACCESS_CODE", e.target.value.trim());
                    }}
                    placeholder="지정한 보안 접속코드를 입력하세요 (생략 가능)"
                    className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    {keySaveFeedback ? "완료" : "등록"}
                  </button>
                  {userAccessCode && (
                    <button
                      type="button"
                      onClick={() => handleResetApiKey("accessCode" as any)}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium rounded-xl cursor-pointer"
                    >
                      지우기
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Model select presets */}
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <label className="block text-xs font-bold text-slate-500">3. 동작 엔진 세부 모델(Model) 선택</label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <select
                    id="model-presets-dropdown"
                    value={isCustomModel ? "custom" : selectedModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setIsCustomModel(true);
                      } else {
                        handleSaveModel(val, false);
                      }
                    }}
                    className="px-3 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 select-none cursor-pointer"
                  >
                    {selectedProvider === "gemini" && (
                      <>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (기본, 초고속 경량 추천)</option>
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (최고사양 서술 모델)</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (정교한 고품질 서술)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (고성능 모델)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (정교 서술)</option>
                      </>
                    )}
                    {selectedProvider === "openai" && (
                      <>
                        <option value="gpt-4o-mini">GPT-4o Mini (속도·비용·규격 준수 최우수, 강력추천)</option>
                        <option value="gpt-4o">GPT-4o (정교한 고품질 서술 추천)</option>
                        <option value="o1-mini">o1-mini (추론 전문 경량)</option>
                        <option value="o3-mini">o3-mini (최신형 고성능 추론)</option>
                      </>
                    )}
                    {selectedProvider === "groq" && (
                      <>
                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B (속도와 고성능 추론 추천)</option>
                        <option value="mixtral-8x7b-32768">Mixtral 8x7B (강력한 다중 언어/개념 통합)</option>
                        <option value="gemma2-9b-it">Gemma 2 9B (구글 초경량 오픈 소스)</option>
                      </>
                    )}
                    {selectedProvider === "xai" && (
                      <>
                        <option value="grok-2-1212">Grok 2 1212 (최신 고성능 Grok 모델)</option>
                        <option value="grok-beta">Grok Beta (강력하고 창의적인 Grok)</option>
                      </>
                    )}
                    <option value="custom">직접 수동 기입...</option>
                  </select>

                  {/* Custom model text input if selected */}
                  {(isCustomModel || !["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro", "gpt-4o-mini", "gpt-4o", "o1-mini", "o3-mini", "llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it", "grok-2-1212", "grok-beta"].includes(selectedModel)) && (
                    <div className="flex-1 flex gap-1.5 items-center">
                      <input
                        id="custom-model-text-input"
                        type="text"
                        value={selectedModel}
                        onChange={(e) => handleSaveModel(e.target.value, true)}
                        placeholder="동작시킬 정확한 모델 식별명을 직접 임의 기입하세요"
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomModel(false);
                          const defaults = {
                            gemini: "gemini-3.1-flash-lite",
                            openai: "gpt-4o-mini",
                            groq: "llama-3.3-70b-versatile",
                            xai: "grok-2-1212"
                          };
                          handleSaveModel(defaults[selectedProvider], false);
                        }}
                        className="px-2 py-2 text-slate-400 hover:text-slate-600 text-xs"
                        title="기본값으로 되돌리기"
                      >
                        되돌리기
                      </button>
                    </div>
                  )}

                  <div className="text-xs font-medium text-indigo-600 bg-indigo-50/50 px-3 py-1.5 rounded-lg border border-indigo-100/30 flex items-center gap-1">
                    <span>현재 지정:</span>
                    <strong className="font-mono text-[11px] text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-200/50">
                      {selectedModel}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        {evaluationMode === EvaluationMode.CREATIVE ? (
          <div className="bg-[#fcfdff] border border-slate-200/90 p-4 md:p-8 rounded-3xl shadow-xs min-h-[400px]">
            <CreativePlayground 
              provider={selectedProvider}
              model={selectedModel}
              geminiKey={userApiKey}
              openaiKey={userOpenAiKey}
              groqKey={userGroqKey}
              xaiKey={userXaiKey}
              onShowKeyPanel={() => setShowKeyPanel(true)}
            />
          </div>
        ) : (
          <>
            {/* Wizard Progression Steps Bar */}
            <nav id="wizard-navigation-bar" className="bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm overflow-x-auto">
          <ul className="flex md:grid md:grid-cols-5 min-w-[640px] md:min-w-0 gap-1.5">
            {stepsList.map((step) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.id;
              return (
                <li key={step.id} className="flex-1">
                  <button
                    id={`step-nav-btn-${step.id}`}
                    type="button"
                    onClick={() => setCurrentStep(step.id as SetupStep)}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                      isActive 
                        ? "bg-indigo-600 text-white shadow-xs" 
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <StepIcon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
                    <span className="whitespace-nowrap">{step.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Core Wizard Body */}
        <main id="wizard-main-body" className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-sm min-h-[400px]">
          
          {/* STEP 1: SMART IMPORT (PDF / Image / Excel paste landing page) */}
          {currentStep === "import" && (
            <div className="space-y-6 animate-fadeIn">
              <SmartImportCenter 
                evaluationMode={evaluationMode}
                onImportExcelSuccess={handleImportExcelSuccess}
                setCriteria={setCriteria}
                setStudents={setStudents}
                onAdvanceToStep={(targetStep) => setCurrentStep(targetStep as SetupStep)}
                onLoadSample={handleLoadSample}
                onShowKeyPanel={() => setShowKeyPanel(true)}
              />
              
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  id="nav-btn-next-from-import-to-criteria"
                  type="button"
                  onClick={() => setCurrentStep("criteria")}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                >
                  <span>
                    {evaluationMode === EvaluationMode.SUBJECT 
                      ? "2단계: 성취기준 설정하기" 
                      : "2단계: 창체 영역 설정하기"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CRITERIA EDIT */}
          {currentStep === "criteria" && (
            <div className="space-y-6 animate-fadeIn">
              <EvaluationHeaderInput 
                evaluationMode={evaluationMode}
                criteria={criteria} 
                setCriteria={setCriteria} 
                onLoadSample={handleLoadSample}
              />
              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  id="nav-btn-prev-from-criteria-to-import"
                  type="button"
                  onClick={() => setCurrentStep("import")}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border border-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>이전: 자료 스마트 등록</span>
                </button>
                
                <button
                  id="nav-btn-next-to-students"
                  type="button"
                  onClick={() => setCurrentStep("students")}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                >
                  <span>
                    {evaluationMode === EvaluationMode.SUBJECT 
                      ? "3단계: 학생 등급 확인" 
                      : "3단계: 학생 특성 편집"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: STUDENTS GRID EDIT */}
          {currentStep === "students" && (
            <div className="space-y-6 animate-fadeIn">
              <StudentTableInput 
                evaluationMode={evaluationMode}
                criteria={criteria}
                students={students}
                setStudents={setStudents}
                setCriteria={setCriteria}
                onImportExcelSuccess={handleImportExcelSuccess}
                maskingStyle={maskingStyle}
                setMaskingStyle={setMaskingStyle}
              />
              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <button
                  id="nav-btn-prev-to-criteria"
                  type="button"
                  onClick={() => setCurrentStep("criteria")}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border border-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>
                    {evaluationMode === EvaluationMode.SUBJECT 
                      ? "이전: 성취기준 설정" 
                      : "이전: 창체 영역 설정"}
                  </span>
                </button>

                <button
                  id="nav-btn-next-to-config"
                  type="button"
                  onClick={() => setCurrentStep("config")}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                >
                  <span>4단계: 종합 어조 및 효과</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: CONFIG TONES */}
          {currentStep === "config" && (
            <div className="space-y-6 animate-fadeIn">
              <GeneratorConfig 
                config={config}
                setConfig={setConfig}
                maskingStyle={maskingStyle}
                setMaskingStyle={setMaskingStyle}
              />
              
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-2 max-w-lg">
                  <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">모든 정보 기입이 완료되었습니다!</p>
                    <p className="text-[11px] text-slate-500">
                      {evaluationMode === EvaluationMode.SUBJECT ? (
                        <>'교과학습 평어 자동 발급'을 실행하면 Gemini LLM이 {students.length}명의 학생 평가를 순차 분석하여 최상위 미학의 평어를 창생합니다.</>
                      ) : (
                        <>'창의적 체험활동 특기사항 생성'을 실행하면 Gemini LLM이 {students.length}명의 각 활동 주제와 활약 특색을 깊이 있게 융합해 실생활 기록부 등재 문구로 변형합니다.</>
                      )}
                    </p>
                  </div>
                </div>

                <button
                  id="btn-run-generate"
                  type="button"
                  onClick={handleGenerateRecords}
                  disabled={isGenerating}
                  className="flex items-center justify-center gap-1.5 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-2xl text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {evaluationMode === EvaluationMode.SUBJECT 
                          ? "교과 발달 평어 일괄 정밀 추출 중..." 
                          : "창체 특기사항 일괄 정밀 생성 중..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>
                        {evaluationMode === EvaluationMode.SUBJECT 
                          ? "교과학습 평어 자동 생성 시작" 
                          : "창체 특기사항 자동 생성 시작"}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <button
                  id="nav-btn-prev-to-students"
                  type="button"
                  onClick={() => setCurrentStep("students")}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border border-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>
                    {evaluationMode === EvaluationMode.SUBJECT 
                      ? "이전: 학생 등급 확인" 
                      : "이전: 학생 특성 편집"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: RESULTS SCREEN */}
          {currentStep === "results" && (
            <div className="space-y-6 animate-fadeIn">
              
              {isGenerating && (
                <div id="generation-spinner-badge" className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3 animate-pulse">
                  <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-indigo-800">
                      {evaluationMode === EvaluationMode.SUBJECT 
                        ? "생활기록부 교과학습 평어 일괄 생성 및 차별화 조립 중..." 
                        : "생활기록부 창체 특기사항 일괄 조립 및 어문가공 중..."}
                    </h4>
                    <p className="text-[10px] text-indigo-600 mt-0.5">
                      {evaluationMode === EvaluationMode.SUBJECT 
                        ? "각 성취 기준의 고유 단어를 조합하여 자연스러운 문맥으로 교체 중입니다. (학생 수에 따라 대략 15초~40초 가량 소요됩니다.)"
                        : "학생의 고유 활동 참여 태도와 템플릿 특징을 반영하고 미려한 교육용 문투를 가다듬는 과정입니다."}
                    </p>
                  </div>
                </div>
              )}

              {networkError && (
                <div id="generation-error-badge" className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs flex flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">⚠️ 자동 생성 중 문제가 발생하였습니다:</p>
                      <p className="mt-1 leading-relaxed">{networkError}</p>
                    </div>
                  </div>
                  
                  {(networkError.includes("429") || networkError.toLowerCase().includes("quota") || networkError.toLowerCase().includes("exhausted") || networkError.toLowerCase().includes("rate") || networkError.toLowerCase().includes("demand") || networkError.toLowerCase().includes("unavailable")) && (
                    <div className="p-3.5 bg-white border border-rose-200 text-rose-950 rounded-xl space-y-2">
                      <p className="font-bold text-[11px] flex items-center gap-1.5 text-rose-600">
                        <span className="animate-pulse inline-block w-2 h-2 rounded-full bg-rose-600"></span>
                        <span>
                          {((selectedProvider === "gemini" && userApiKey.trim()) || (selectedProvider === "openai" && userOpenAiKey.trim()))
                            ? "💡 해결 방법: 개인 API 키 일시 요율 한도(Rate Limit) 도달 또는 서버 지연" 
                            : "💡 해결 방법: 개인 API 키 입력 누락"
                          }
                        </span>
                      </p>
                      <p className="text-[10.5px] leading-relaxed text-slate-600">
                        {((selectedProvider === "gemini" && userApiKey.trim()) || (selectedProvider === "openai" && userOpenAiKey.trim())) ? (
                          <>
                            현재 등록하신 <strong>개인 전용 API 키</strong>가 무료/유료 티어의 <strong>요청 한도</strong>를 일시적으로 초과했거나 해당 인공지능 플랫폼의 서버가 평소보다 정체되었습니다. 
                            수초 혹은 1~2분 정도 뒤에 하단의 <strong>[즉시 재시도]</strong> 버튼을 누르시면 정상 동작합니다!
                          </>
                        ) : (
                          <>
                            현재 인공지능 엔진과 연동할 <strong>선생님의 개인 API 키</strong>가 설정되지 않았습니다. 
                            본 시스템은 서버를 거쳐 안전하게 키를 임시 터널링할 뿐 별도 보존하지 않으며 브라우저에 비밀 보관되므로, 상단 메뉴에서 개인 API 키를 비밀번호처럼 한 번만 등록해 주세요!
                          </>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {!userApiKey.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowKeyPanel(true);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 shadow-xs"
                          >
                            🔑 개인 API 키 입력패널 열기
                          </button>
                        )}
                        <a
                          href="https://aistudio.google.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-semibold rounded-lg transition-all inline-flex items-center"
                        >
                          무료 API 키 발급받으러 가기 (새 창)
                        </a>
                      </div>
                    </div>
                  )}

                  <div>
                    <button
                      id="btn-retry-generate-instantly"
                      type="button"
                      onClick={handleGenerateRecords}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold cursor-pointer"
                    >
                      다시 시도하기
                    </button>
                  </div>
                </div>
              )}

              <RecordsDashboard 
                records={records}
                setRecords={setRecords}
                config={config}
                maskingStyle={maskingStyle}
                isGenerating={isGenerating}
                onRegenerateAll={handleGenerateRecords}
              />

              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <button
                  id="nav-btn-prev-to-config"
                  type="button"
                  onClick={() => setCurrentStep("config")}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border border-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>옵션 및 어조 변경</span>
                </button>
              </div>
            </div>
          )}
            </main>
          </>
        )}

        {/* Informative Guidance Section at Bottom */}
        <section id="additional-guideline-section" className="pt-2">
          <GuidelineBox />
        </section>

      </div>

      {/* Footer Branding content */}
      <footer id="global-footer" className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 text-xs text-left">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <p className="font-semibold text-slate-200">생기부 교과발달상황(세특) 및 초등학교 통지표 인공지능 빌더</p>
            <p className="text-slate-500">본 도구는 오프라인 보조 교사 시스템으로, 생성된 개인정보성 가공물은 외부 서버로 영구 누출되거나 상업 활용되지 않음을 공식 보장합니다.</p>
            <p className="text-indigo-400 text-[11px] mt-1">👨‍🏫 <strong>기획 개념 출처:</strong> 본 시스템은 교육 현장 전문가이신 <strong>'라이프오브파이' 선생님</strong>께서 개발하신 정교한 '나이스 생활기록부 평가 기재 가이드라인 및 어조 규칙'을 기반으로 작동합니다.</p>
          </div>
          <div className="font-mono text-slate-500 text-center md:text-right">
            Based on <strong>'LifeofPi'</strong> Framework • 2026
          </div>
        </div>
      </footer>

    </div>
  );
}
