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
import { AI_SUSPENDED_MESSAGE, removeLegacyCredentials } from "./services/aiSuspension";
import { 
  Sparkles, GraduationCap, CheckSquare, Settings2, Play, RefreshCw, AlertCircle, HelpCircle, ArrowRight, ArrowLeft, Upload, Key, KeyRound, Check, Compass
} from "lucide-react";

type SetupStep = "import" | "criteria" | "students" | "config" | "results";

export default function App() {
  // Wizard state - default is now "import" to greet teachers with a friendly file dropzone immediately!
  const [currentStep, setCurrentStep] = useState<SetupStep>("import");
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>(EvaluationMode.SUBJECT);

  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [credentialCleanup, setCredentialCleanup] = useState<boolean | null>(null);
  useEffect(() => {
    try { setCredentialCleanup(removeLegacyCredentials(window.localStorage)); }
    catch { setCredentialCleanup(false); }
  }, []);

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

  // Preserve results, edits, roster, and current step while suspended.
  const handleGenerateRecords = () => { alert(AI_SUSPENDED_MESSAGE); };

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
            
            <button id="btn-toggle-key-panel" type="button"
              onClick={() => setShowKeyPanel(!showKeyPanel)}
              className="px-4 py-2 rounded-xl border text-sm">AI 일시 중지 안내</button>
          </div>
          <div id="ai-suspension-notice" role="status" className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            {AI_SUSPENDED_MESSAGE}
            {credentialCleanup === false && <p role="alert">브라우저 저장소 접근이 제한되어 기존 키 삭제를 완료하지 못했습니다. 브라우저 설정에서 이 사이트의 저장된 자격 증명을 확인해 주세요. 학생 자료는 먼저 보관하세요.</p>}
          </div>

          {/* Mode Selector Tab Group          {/* Mode Selector Tab Group */}
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

          {showKeyPanel && <div id="api-key-config-panel" className="p-4 border rounded-xl">
            <p>개인 API 키 입력과 저장이 중지되었습니다.</p>
            <p>{credentialCleanup === true ? '기존 API 키와 접속 코드 항목을 정리했습니다. 학생 데이터와 창체 보관함은 삭제하지 않습니다.' : '기존 자격 증명 정리 상태를 확인 중이거나 정리가 제한되었습니다.'}</p>
          </div>}
        </header>

        {evaluationMode === EvaluationMode.CREATIVE ? (
          <div className="bg-[#fcfdff] border border-slate-200/90 p-4 md:p-8 rounded-3xl shadow-xs min-h-[400px]">
            <CreativePlayground />
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

              {networkError && <div role="alert">{AI_SUSPENDED_MESSAGE}</div>}

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
