import React, { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Sparkles, CheckCircle2, AlertCircle, FileText, Play, ArrowRight, Table, HelpCircle, RefreshCw } from "lucide-react";
import { parsePastedTable } from "../utils";
import { clientParseTableImage } from "../services/aiService";
import { EvaluationCriterion, Student, EvaluationMode } from "../types";

interface Props {
  evaluationMode: EvaluationMode;
  onImportExcelSuccess: (rowHeaders: string[], parsedStudents: any[]) => void;
  setCriteria: React.Dispatch<React.SetStateAction<EvaluationCriterion[]>>;
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  onAdvanceToStep: (step: "criteria" | "students") => void;
  onLoadSample: () => void;
  onShowKeyPanel?: () => void;
}

export default function SmartImportCenter({
  evaluationMode,
  onImportExcelSuccess,
  setCriteria,
  setStudents,
  onAdvanceToStep,
  onLoadSample,
  onShowKeyPanel,
}: Props) {
  const [activeImportTab, setActiveImportTab] = useState<"ocr" | "excel" | "scratch">("ocr");
  const [pasteText, setPasteText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste handler
  const handleParsePasteWithNavigation = () => {
    if (!pasteText.trim()) {
      alert("붙여넣을 엑셀 텍스트 데이터를 입력해주세요.");
      return;
    }
    const result = parsePastedTable(pasteText);
    if (!result.success || !result.data) {
      alert(result.message);
      return;
    }

    const { rowHeaders, students: parsedStudents } = result.data;
    onImportExcelSuccess(rowHeaders, parsedStudents);
    setPasteText("");
    alert("🟢 엑셀 성적 데이터가 즉시 정합되어 등록되었습니다!");
    onAdvanceToStep("students"); // Advance to active list review
  };

  // Drag and Drop files
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
      processDocumentFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processDocumentFile(e.target.files[0]);
    }
  };

  const triggerFileBrowser = () => {
    fileInputRef.current?.click();
  };

  const readAsDataURLAsync = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as string);
        } else {
          reject(new Error("업로드된 파일을 기입하는 과정에 장애가 발생했습니다."));
        }
      };
      reader.onerror = () => reject(new Error("파일 변동 로드에 지장이 생겼습니다."));
      reader.readAsDataURL(file);
    });
  };

  // Send request for AI scans with image or PDF
  const processDocumentFile = async (file: File) => {
    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || file.name.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/);

    if (!isPDF && !isImage) {
      setErrorMsg("성적 결과로 인정되는 PDF 파일이나 이미지 파일(PNG, JPG, WebP)만 업로드할 수 있습니다.");
      return;
    }

    setIsParsing(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const resultSrc = await readAsDataURLAsync(file);
      const base64Content = resultSrc.split(",")[1];
      if (!base64Content) {
        throw new Error("파일 콘텐츠가 유효하지 않습니다. 다시 시도해 주십시오.");
      }

      const userApiKey = localStorage.getItem("USER_GEMINI_API_KEY") || "";
      const selectedProvider = (localStorage.getItem("USER_SELECTED_PROVIDER") || "gemini") as "gemini" | "openai";
      const selectedModel = localStorage.getItem("USER_SELECTED_MODEL") || "gemini-3.1-flash-lite";
      const userOpenAiKey = localStorage.getItem("USER_OPENAI_API_KEY") || "";

      // Determine correct mimeType
      let mimeType = file.type;
      if (!mimeType) {
        if (isPDF) {
          mimeType = "application/pdf";
        } else if (file.name.toLowerCase().endsWith(".png")) {
          mimeType = "image/png";
        } else if (file.name.toLowerCase().endsWith(".webp")) {
          mimeType = "image/webp";
        } else {
          mimeType = "image/jpeg";
        }
      }

      const parsedData = await clientParseTableImage({
        base64Image: base64Content,
        mimeType: mimeType || "image/png",
        provider: selectedProvider,
        model: selectedModel,
        geminiKey: userApiKey,
        openaiKey: userOpenAiKey
      });

      if (parsedData.students && Array.isArray(parsedData.students)) {
        // 1. Setup Criteria from PDF if present
        let tempCriteria: EvaluationCriterion[] = [];
        if (parsedData.criteria && parsedData.criteria.length > 0) {
          tempCriteria = parsedData.criteria.map((c: any, index: number) => ({
            id: `crit_${Date.now()}_${index}`,
            domain: c.domain || `평가 영역 ${index + 1}`,
            achievementStandard: c.achievementStandard || "",
            evaluationElement: c.evaluationElement || "세부 성취수준",
          }));
          setCriteria(tempCriteria);
        } else {
          // fallback criterion
          tempCriteria = [
            {
              id: `crit_${Date.now()}_0`,
              domain: "교과 성취기준 및 발달도",
              achievementStandard: "",
              evaluationElement: "세부 성취 수준",
            }
          ];
          setCriteria(tempCriteria);
        }

        // 2. Setup Students matched to parsed criteria
        const tempStudents: Student[] = parsedData.students.map((st: any, sIdx: number) => {
          const studentGrades: Record<string, string> = {};
          tempCriteria.forEach((crit, critIdx) => {
            const parsedGradeVal = st.grades?.[critIdx]?.gradeValue || "";
            studentGrades[crit.id] = parsedGradeVal;
          });

          return {
            id: `stud_${Date.now()}_${sIdx}`,
            number: st.number || `${sIdx + 1}`,
            name: st.name || `학생 ${sIdx + 1}`,
            grades: studentGrades,
          };
        });

        setStudents(tempStudents);
        setSuccessMsg(`🎉 AI 기기 인식이 성공했습니다! [${file.name}] 문서 분석을 통해 학생 ${tempStudents.length}명의 과목 성적표가 완벽 정량 입력되었습니다.`);
        
        alert(`📚 AI 문서 스캔 성공!\n${tempStudents.length}명의 성적 등급 자료가 연계되었습니다. "학생 명단 편집" 단계로 진입합니다.`);
        onAdvanceToStep("students"); // Immediately shift to check grid
      } else {
        throw new Error("안내: 문서 안에서 명목 등급 및 학생 묶음을 인식하지 못했습니다. 형식을 검토하거나 엑셀 붙여넣기를 활용해 주세요.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "파일 데이터 전환에 지체를 빚었습니다. 다시 시도해 주십시오.");
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Intro Greetings Banner */}
      <div id="smart-import-welcome-header" className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 md:p-8 shadow-md">
        <div className="absolute top-0 right-0 transform translate-x-20 -translate-y-20 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-60 h-60 rounded-full bg-purple-500/10 blur-2xl" />
        
        <div className="relative max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold border border-indigo-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {evaluationMode === EvaluationMode.SUBJECT 
                ? "나이스(NEIS) 지침 부합형 최신 생기부 평어 메이커" 
                : "초등학교 창의적 체험활동 특기사항 빌더"}
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight leading-snug">
            {evaluationMode === EvaluationMode.SUBJECT ? (
              <>
                수행평가 결과표 및 성적대장을 <span className="text-indigo-400">PDF, 이미지, 복사본</span>으로 올리면<br />
                AI가 학생별 명세 기록을 단숨에 완성해냅니다.
              </>
            ) : (
              <>
                초등 창체 활동 내역과 학생 개별 성향을 <span className="text-indigo-400">선택 혹은 수기 입력</span>하면<br />
                기재요령에 맞는 명수필 특기사항을 조립 생성합니다.
              </>
            )}
          </h2>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            {evaluationMode === EvaluationMode.SUBJECT 
              ? "매 학기마다 복잡한 학생들의 성취 등급(매우잘함/보통/노력요함) 표를 개별 관찰 소감과 영리하게 대조·가공해 교육부 평가 지침에 맞는 완벽한 교과 평어로 설계합니다."
              : "학급에서 시행한 자율·동아리·봉사·진로활동 등의 영역을 정의하고, 학생 정보 옆에서 손쉽게 특성 키워드를 클릭하거나 짧은 행동 메모를 남겨 완성도 높은 대단원 융합형 특기사항 문장을 얻습니다."}
          </p>
        </div>
      </div>

      {/* Switch import method */}
      <div id="import-option-selector" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setActiveImportTab("ocr")}
          className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
            activeImportTab === "ocr"
              ? "bg-indigo-50 border-indigo-200 text-indigo-950 shadow-xs"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <div className={`p-2.5 rounded-xl ${activeImportTab === "ocr" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold font-sans">PDF / 이미지 성적 일람표 분석</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">스캔한 성적 대장이나 평정 결과 일람표(PDF, JPG, PNG) 파일 자동 탐지</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveImportTab("excel")}
          className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
            activeImportTab === "excel"
              ? "bg-indigo-50 border-indigo-200 text-indigo-950 shadow-xs"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <div className={`p-2.5 rounded-xl ${activeImportTab === "excel" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold font-sans">엑셀(Excel) 복사하여 붙여넣기</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">엑셀에 있는 이름 및 영역 등급 목록 열을 클립보드로 마우스 드래그 연동</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveImportTab("scratch")}
          className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
            activeImportTab === "scratch"
              ? "bg-indigo-50 border-indigo-200 text-indigo-950 shadow-xs"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <div className={`p-2.5 rounded-xl ${activeImportTab === "scratch" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold font-sans">샘플 이용 및 빈 서식 기입</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">미리 준비된 국어 교과 성적표 템플릿을 불러오거나 백지 상태 수동 기입</p>
          </div>
        </button>
      </div>

      {/* Main Import Interface Box */}
      <div id="primary-import-console" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs min-h-[250px]">
        {activeImportTab === "ocr" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span>PDF 성적서 및 이미지 전광 스캔 (최첨단 Gemini 모형 탑재)</span>
              </span>
              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-semibold">동시 수락: PDF, PNG, JPG, WebP</span>
            </div>

            <div 
              id="pdf-dropzone-component"
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileBrowser}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                dragActive 
                  ? "border-indigo-600 bg-indigo-50/50" 
                  : "border-slate-300 bg-slate-50/30 hover:bg-slate-50/80 hover:border-slate-400"
              }`}
            >
              <input
                id="file-element"
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,application/pdf"
                className="hidden"
              />

              {!isParsing ? (
                <div className="space-y-3.5">
                  <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">생활기록부 교과수행평가 일람표 PDF 혹은 사진 파일을 올려주세요</p>
                    <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                      컴퓨터에 수록된 파일이나 스캔한 종이를 드래그하여 놓거나 클릭하여 가져옵니다.<br />
                      과목명, 학과 학년, 대단원 영역, 평가 등급이 완벽하게 필터링되어 자동 격자로 환산됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerFileBrowser();
                    }}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    내 파일 찾아보기
                  </button>
                </div>
              ) : (
                <div className="py-6 space-y-4">
                  <div className="relative w-12 h-12 mx-auto flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin absolute" />
                    <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-indigo-950">Gemini LLM이 업로드된 PDF/이미지의 표 양식을 분광 분석하고 있습니다...</p>
                    <p className="text-[10px] text-indigo-600 mt-1 animate-pulse">
                      대소 영역 정보, 성취 성적 단어 및 학생 이름을 대조 배치하는 과정으로 10초~25초가 소요됩니다.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="p-4 bg-rose-50 border border-rose-100/60 text-rose-700 text-xs rounded-xl flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
                {(errorMsg.includes("QUOTA") || errorMsg.includes("429") || errorMsg.toLowerCase().includes("exhausted") || errorMsg.toLowerCase().includes("limit") || errorMsg.toLowerCase().includes("demand") || errorMsg.toLowerCase().includes("unavailable")) && (
                  (() => {
                    const hasKey = !!(typeof window !== "undefined" && window.localStorage.getItem("USER_GEMINI_API_KEY")?.trim());
                    return (
                      <div className="mt-1 p-3 bg-white border border-rose-200 text-rose-950 rounded-lg space-y-1.5">
                        <p className="font-bold text-[11px] flex items-center gap-1.5 text-rose-600">
                          <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                          <span>
                            {hasKey 
                              ? "💡 해결 방법: 개인 API 키 일시 요율 한도(Rate Limit) 도달 또는 서버 지연" 
                              : "💡 해결 방법: 개인 API 키(Secret Key)가 지정되지 않음"
                            }
                          </span>
                        </p>
                        <p className="text-[10px] leading-relaxed text-slate-500">
                          {hasKey ? (
                            <>
                              현재 등록하신 <strong>개인 전용 API 키</strong>가 발급 무료 티어의 <strong>분당 요청(RPM) 한도</strong>를 일시적으로 초과했거나, 구글/OpenAI 서버 트래픽이 심하게 정체되었습니다. 
                              수초 혹은 1~2분 정도 뒤에 [즉시 재시도] 버튼을 클릭해 주십시오. 
                            </>
                          ) : (
                            <>
                              원격 인공지능 분석 가동을 위해서는 개인 API 키를 등록하셔야 합니다. 
                              우측 상단의 <strong>[⚙️ AI 설정 및 API 키]</strong> 메뉴에 선생님 전용 API 키를 비밀리에 입력/등록해 주시면 즉시 안전하고 쾌적하게 정상 작동합니다.
                            </>
                          )}
                        </p>
                        {!hasKey && onShowKeyPanel && (
                          <button
                            type="button"
                            onClick={() => {
                              onShowKeyPanel();
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center"
                          >
                            🔑 개인 API 키 등록 패널 열기
                          </button>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        )}

        {activeImportTab === "excel" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>엑셀 / 한글 문서 클립보드 간편 드래그 연계</span>
              </span>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] text-emerald-800 bg-emerald-50 rounded-xl p-3 border border-emerald-100/60 leading-relaxed">
                <strong>📝 3초 복사 연동 방법:</strong><br />
                1. 엑셀 성적표 창에서 <strong>[번호, 학생이름, 영역평가등급들]</strong> 영역을 한꺼번에 마우스로 긁어 선택한 뒤 <strong>Ctrl + C(복사)</strong> 합니다.<br />
                2. 아래 회색 칸에 <strong>Ctrl + V(붙여넣기)</strong> 하시면 행렬 표 형식의 데이터 탭 구분을 스스로 인식하여 즉시 변환표로 기입됩니다.
              </div>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="w-full h-40 border border-slate-200 rounded-xl p-3 font-mono text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                placeholder="여기에 복사한 표 셀 내용을 붙여넣기하세요... (예: 번호     이름     과목성취도)"
              />

              <div className="flex justify-end p-1">
                <button
                  type="button"
                  onClick={handleParsePasteWithNavigation}
                  className="px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1 transition-all"
                >
                  <span>데이터 자동 수집 및 격자 변형</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeImportTab === "scratch" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Table className="w-4 h-4 text-purple-600" />
                <span>정상 샘플 자료 호출 및 수기 시작</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Load educational sample */}
              <div className="p-4 border border-slate-100 hover:border-slate-200 transition-all bg-slate-50/50 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>
                    {evaluationMode === EvaluationMode.SUBJECT 
                      ? "[강력 추천] 교육부 초등 교과 샘플로 즉석 시연하기" 
                      : "[강력 추천] 초등 창의적 체험활동 샘플로 즉석 시연하기"}
                  </span>
                </h4>
                <p className="text-[10.5px] text-slate-500 leading-relaxed">
                  {evaluationMode === EvaluationMode.SUBJECT 
                    ? "2026학년도 수행평가 데이터 파일 규격을 준수한 샘플 양식을 즉각 로드합니다. (6학년 1학기 국어 교과 데이터 5명 수록)"
                    : "초등 자율활동 및 동아리활동 영역과 각 영역별 현실적인 학생 특성 및 활약 수준 데이터 5명을 즉시 연계 로드합니다."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onLoadSample();
                  }}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs block text-center"
                >
                  {evaluationMode === EvaluationMode.SUBJECT 
                    ? "시베리아/국어 교육 샘플 바로연계" 
                    : "창체 자율·동아리 활동 샘플 바로연계"}
                </button>
              </div>

              {/* Box 2: Manual entry setup */}
              <div className="p-4 border border-slate-100 hover:border-slate-200 transition-all bg-slate-50/50 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  <span>
                    {evaluationMode === EvaluationMode.SUBJECT 
                      ? "처음부터 하나씩 수동으로 직접 등록" 
                      : "창의적 체험활동 새 템플릿 빈 격자 열기"}
                  </span>
                </h4>
                <p className="text-[10.5px] text-slate-500 leading-relaxed">
                  {evaluationMode === EvaluationMode.SUBJECT 
                    ? "인공지능 도움 없이 직접 평가 행과 열, 학생들의 점수 체계를 수작업으로 기재하여 완전히 가공할 때 선택합니다."
                    : "인공지능이 자율/동아리 등의 영역을 가득 채우도록 처음부터 깨끗한 기본 판으로 신규 시작합니다."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (evaluationMode === EvaluationMode.SUBJECT) {
                      // Initialize empty state
                      setCriteria([
                        {
                          id: `crit_${Date.now()}`,
                          domain: "국어_말하기와 듣기",
                          achievementStandard: "",
                          evaluationElement: "의견 제시 태도",
                        }
                      ]);
                      setStudents([
                        {
                          id: `stud_${Date.now()}_0`,
                          number: "1",
                          name: "홍길동",
                          grades: { [`crit_${Date.now()}`]: "매우 잘함" }
                        }
                      ]);
                    } else {
                      setCriteria([
                        {
                          id: `crit_${Date.now()}`,
                          domain: "자율활동 (Autonomous)",
                          achievementStandard: "",
                          evaluationElement: "책임감 있는 학급 1인 1역 실천 및 협동상태",
                        }
                      ]);
                      setStudents([
                        {
                          id: `stud_${Date.now()}_0`,
                          number: "1",
                          name: "김하람",
                          grades: { [`crit_${Date.now()}`]: "리더쉽형 (주도적인 규범 수립 및 이견 조율성)" }
                        }
                      ]);
                    }
                    onAdvanceToStep("criteria");
                  }}
                  className="w-full py-2 bg-slate-850 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-xs block text-center"
                >
                  {evaluationMode === EvaluationMode.SUBJECT 
                    ? "빈 템플릿 격자로 직접 기재 개시" 
                    : "빈 창체 템플릿 격자로 직접 기재 개시"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
