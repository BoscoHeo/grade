import React from "react";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";

export default function GuidelineBox() {
  return (
    <div id="guideline-box-container" className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle id="guideline-icon" className="w-5 h-5 text-indigo-600" />
        <h3 id="guideline-title" className="text-lg font-semibold text-slate-800">생활기록부 교과평어 작성 가이드라인 (나이스 입력 기준)</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        <div id="guideline-do-column" className="space-y-3">
          <div className="flex items-center gap-1.5 text-emerald-700 font-medium pb-1 border-b border-emerald-100">
            <CheckCircle2 className="w-4 h-4" />
            <span>기재 권장 사항 (Do)</span>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 leading-relaxed">
            <li>각 성취기준의 핵심 성취 수준 및 내용을 바탕으로 구체적인 성장을 기록합니다.</li>
            <li>정의적 특성(수업 태도, 주도성, 인성 요인 및 협력 가치)을 종합적으로 아울러 서술합니다.</li>
            <li>개별 학생의 차별화된 수행과 강점을 다양한 표현과 동사형 어휘로 부각합니다.</li>
            <li>'개조식(~함)' 혹은 '서술식(~함)' 종결어미를 학년반 전체에 일관성 있게 일람 적용합니다.</li>
          </ul>
        </div>
        
        <div id="guideline-dont-column" className="space-y-3">
          <div className="flex items-center gap-1.5 text-rose-700 font-medium pb-1 border-b border-rose-100">
            <XCircle className="w-4 h-4" />
            <span>기재 절대 금지 사항 (Don't)</span>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 leading-relaxed">
            <li><strong>사교육 유발 요인:</strong> 교외 대회 실적, 공인 어학시험, 사설 학원이나 자격증 언급 금지</li>
            <li><strong>차별적 표현:</strong> 부모의 사회경제적 지위, 가정 환경 유추 표현 기재 불가</li>
            <li><strong>모호한 서술:</strong> 구체적인 증거 없이 '매우 우수함', '완벽함'만으로 가득 찬 주관적 상투어 자제</li>
            <li><strong>지침 위반 단어:</strong> '성적 향상', '일등', '모의고사 점수' 등의 성적이 중심이 되는 수치 표기 자제</li>
          </ul>
        </div>
      </div>
      
      <div id="guideline-tip" className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
        💡 <strong>팁:</strong> 본 앱은 생성 시작 전 어조(개조식/서술식)를 설정하면 AI가 완벽한 문법 종결을 보장하며, 나이스(NEIS) 글자 수 제한 규칙에 걸리지 않도록 실시간 바이트(Byte) 및 글자 카운트를 시각적으로 제공합니다.
      </div>
    </div>
  );
}
