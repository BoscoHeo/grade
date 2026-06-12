import React from "react";
import { EvaluationCriterion, EvaluationMode } from "../types";
import { Plus, Trash2, RotateCcw, BookOpen } from "lucide-react";
import { SAMPLE_CRITERIA } from "../sampleData";

interface Props {
  evaluationMode: EvaluationMode;
  criteria: EvaluationCriterion[];
  setCriteria: React.Dispatch<React.SetStateAction<EvaluationCriterion[]>>;
  onLoadSample: () => void;
}

export default function EvaluationHeaderInput({ evaluationMode, criteria, setCriteria, onLoadSample }: Props) {
  
  const handleAddCriterion = () => {
    const newId = `crit_${Date.now()}`;
    setCriteria([
      ...criteria,
      {
        id: newId,
        domain: "",
        achievementStandard: "",
        evaluationElement: "",
      },
    ]);
  };

  const handleUpdateCriterion = (id: string, field: keyof EvaluationCriterion, value: string) => {
    setCriteria(
      criteria.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleRemoveCriterion = (id: string) => {
    // Keep at least one
    if (criteria.length <= 1) {
      alert("적어도 하나의 평가 영역은 등록되어 있어야 합니다.");
      return;
    }
    setCriteria(criteria.filter((c) => c.id !== id));
  };

  const handleReset = () => {
    if (confirm("모든 평가 영역 입력을 초기화하시겠습니까?")) {
      setCriteria([
        {
          id: `crit_${Date.now()}`,
          domain: evaluationMode === EvaluationMode.SUBJECT ? "" : "자율활동 (Autonomous)",
          achievementStandard: "",
          evaluationElement: "",
        },
      ]);
    }
  };

  return (
    <div id="evaluation-header-section" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 id="section-title-1" className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <span>
              {evaluationMode === EvaluationMode.SUBJECT 
                ? "2단계: 교과 평가 성취기준 설정" 
                : "2단계: 창체 활동 분과 영역 설정"}
            </span>
          </h2>
          <p id="section-desc-1" className="text-sm text-slate-500 mt-1">
            {evaluationMode === EvaluationMode.SUBJECT 
              ? "학교생활기록부 생활지도 지침에 기록될 성취기준과 평가 요소를 등록합니다. (최대 3~4개 권장)"
              : "학생 특성에 반영될 창의적 체험활동 분야 및 핵심 활약 영역을 설정합니다. (자율, 동아리, 봉사, 진로 등)"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-load-sample"
            type="button"
            onClick={onLoadSample}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-all duration-200 border border-indigo-200 shadow-sm"
          >
            {evaluationMode === EvaluationMode.SUBJECT 
              ? "📚 국어과 성적 샘플 불러오기" 
              : "🌟 창체 우수 샘플 불러오기"}
          </button>
          <button
            id="btn-reset-criteria"
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all duration-200 border border-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>초기화</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {criteria.map((c, index) => (
          <div
            id={`criterion-card-${index}`}
            key={c.id}
            className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 relative group hover:border-slate-300 transition-all duration-150"
          >
            <div className="flex items-center justify-between">
              <span id={`criterion-badge-${index}`} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg">
                평가 영역 #{index + 1}
              </span>
              <button
                id={`btn-remove-criterion-${index}`}
                type="button"
                onClick={() => handleRemoveCriterion(c.id)}
                className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                title="이 영역 삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div id={`domain-box-${index}`} className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  {evaluationMode === EvaluationMode.SUBJECT ? "평가 영역명 (대단원)" : "창체 활동 영역 대분류"}
                </label>
                <input
                  id={`input-domain-${index}`}
                  type="text"
                  value={c.domain}
                  onChange={(e) => handleUpdateCriterion(c.id, "domain", e.target.value)}
                  placeholder={evaluationMode === EvaluationMode.SUBJECT ? "예: 2. 바르게 고쳐 써요. (문법)" : "예: 자율활동 (Autonomous)"}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 hover:bg-white"
                />
              </div>

              <div id={`standard-box-${index}`} className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 font-sans">
                  {evaluationMode === EvaluationMode.SUBJECT ? "국가 성취기준 코드 및 내용" : "핵심 실천 주제 / 활동명"}
                </label>
                <input
                  id={`input-standard-${index}`}
                  type="text"
                  value={c.achievementStandard}
                  onChange={(e) => handleUpdateCriterion(c.id, "achievementStandard", e.target.value)}
                  placeholder={evaluationMode === EvaluationMode.SUBJECT ? "예: [6국04-04] 문장 성분을 이해하고..." : "예: 학급 1인 1역 실천 및 자치 모임 참여"}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 hover:bg-white"
                />
              </div>

              <div id={`element-box-${index}`} className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  {evaluationMode === EvaluationMode.SUBJECT ? "평가 요소 (핵심 과제)" : "구체적인 관찰 요소 및 기준 행동"}
                </label>
                <input
                  id={`input-element-${index}`}
                  type="text"
                  value={c.evaluationElement}
                  onChange={(e) => handleUpdateCriterion(c.id, "evaluationElement", e.target.value)}
                  placeholder={evaluationMode === EvaluationMode.SUBJECT ? "예: 글을 바르게 고쳐 쓰기" : "예: 책임감 있는 학급 1인 1역 실천 및 경청 중심의 상호 협력"}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 hover:bg-white"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        id="btn-add-criterion"
        type="button"
        onClick={handleAddCriterion}
        className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-2xl flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/30 font-medium transition-all duration-150 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>평가 영역 추가 생성</span>
      </button>
    </div>
  );
}
