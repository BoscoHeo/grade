import React from "react";
import { GenerationConfig, RecordTone, MaskingStyle, CreativityLevel } from "../types";
import { Settings, Sparkles, Sliders, Shield, Award } from "lucide-react";

interface Props {
  config: GenerationConfig;
  setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
  maskingStyle: MaskingStyle;
  setMaskingStyle: (style: MaskingStyle) => void;
}

export default function GeneratorConfig({ config, setConfig, maskingStyle, setMaskingStyle }: Props) {
  
  const handleUpdateConfig = (field: keyof GenerationConfig, value: any) => {
    setConfig({
      ...config,
      [field]: value,
    });
  };

  const handleUpdateFocus = (field: keyof GenerationConfig["focusAreas"], value: boolean) => {
    setConfig({
      ...config,
      focusAreas: {
        ...config.focusAreas,
        [field]: value,
      },
    });
  };

  return (
    <div id="generator-config-section" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 id="section-title-3" className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <span>3단계: AI 생성 어조 및 마스킹 옵션 설정</span>
          </h2>
          <p id="section-desc-3" className="text-sm text-slate-500 mt-1">
            성공적인 생기부 작성을 위해 AI 어조, 획기적 이름 마스킹, 최대 글자 수 및 추가 조건을 상세하게 관리합니다.
          </p>
        </div>
      </div>

      {/* 라이프오브파이 선생님 기반 기여 크레딧 배너 */}
      <div className="p-4 bg-indigo-50/70 border border-indigo-100/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-indigo-950">
        <div className="flex items-start gap-2.5">
          <Award className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            👨‍🏫 <strong>기획 개념 출처:</strong> 본 세형식/어조 인공지능 생활기록부 평가 도구는 현장 교육전문가이신 <strong>'라이프오브파이' 선생님</strong>께서 개발하고 정교화하신 <strong>나이스 세부능력 기재 구조 가이드라인</strong>을 핵심 기반으로 설계 및 구현되었습니다.
          </p>
        </div>
        <span className="font-bold shrink-0 bg-indigo-100/80 text-indigo-700 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider self-start sm:self-center">
          Life of Pi Concept Powered
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Basic Settings & Tone */}
        <div id="config-col-left" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Settings className="w-4 h-4 text-indigo-500" />
            <span>기본 정보 및 문장 미학</span>
          </h3>

          <div id="box-subject" className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">과목명</label>
              <input
                id="input-config-subject"
                type="text"
                value={config.subject}
                onChange={(e) => handleUpdateConfig("subject", e.target.value)}
                placeholder="국어"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-500-medium"
              />
            </div>
            <div id="box-grade" className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">학년 단위</label>
              <input
                id="input-config-grade"
                type="text"
                value={config.grade}
                onChange={(e) => handleUpdateConfig("grade", e.target.value)}
                placeholder="6학년 1학기"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div id="box-tone" className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">문장 종결 어미 (어조)</label>
            <div className="grid grid-cols-1 gap-2">
              <label id="lbl-tone-noun" className={`p-3 border rounded-xl flex flex-col cursor-pointer transition-all ${
                config.tone === RecordTone.NOUN_ENDING ? "border-indigo-500 bg-indigo-50/40 font-medium" : "border-slate-200 hover:bg-slate-50"
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    id="radio-tone-noun"
                    type="radio"
                    name="tone"
                    value={RecordTone.NOUN_ENDING}
                    checked={config.tone === RecordTone.NOUN_ENDING}
                    onChange={() => handleUpdateConfig("tone", RecordTone.NOUN_ENDING)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-800">개조식 명사형 종결 (~함.)</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 pl-5">전문적이며 중고등학교 및 나이스 기록의 전형적인 서술법</span>
              </label>

              <label id="lbl-tone-respect" className={`p-3 border rounded-xl flex flex-col cursor-pointer transition-all ${
                config.tone === RecordTone.RESPECT_ENDING ? "border-indigo-500 bg-indigo-50/40 font-medium" : "border-slate-200 hover:bg-slate-50"
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    id="radio-tone-respect"
                    type="radio"
                    name="tone"
                    value={RecordTone.RESPECT_ENDING}
                    checked={config.tone === RecordTone.RESPECT_ENDING}
                    onChange={() => handleUpdateConfig("tone", RecordTone.RESPECT_ENDING)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-800">친화적 경어체 서술 (~합니다.)</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 pl-5">초등학교 통지표나 성장 기록 보고서용 다정한 어미 기입</span>
              </label>

              <label id="lbl-tone-special" className={`p-3 border rounded-xl flex flex-col cursor-pointer transition-all ${
                config.tone === RecordTone.SPECIAL_ENDING ? "border-indigo-500 bg-indigo-50/40 font-medium" : "border-slate-200 hover:bg-slate-50"
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    id="radio-tone-special"
                    type="radio"
                    name="tone"
                    value={RecordTone.SPECIAL_ENDING}
                    checked={config.tone === RecordTone.SPECIAL_ENDING}
                    onChange={() => handleUpdateConfig("tone", RecordTone.SPECIAL_ENDING)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-800">강점 부각형 종결 (~동이 돋보임.)</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 pl-5">학생의 성취 강점 상태를 특별하고 극적으로 찬양 강조</span>
              </label>
            </div>
          </div>

          {/* 문장 자유도 및 창의성 설정 세션 */}
          <div id="box-creativity" className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="text-xs font-semibold text-indigo-950 flex items-center gap-1 block">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>문장의 생성 자유도 및 창의성 설정</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleUpdateConfig("creativityLevel", CreativityLevel.LOW)}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all ${
                  config.creativityLevel === CreativityLevel.LOW
                    ? "bg-slate-900 text-white border-slate-950 font-bold"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                낮음 (사실 엄수)
              </button>
              <button
                type="button"
                onClick={() => handleUpdateConfig("creativityLevel", CreativityLevel.MEDIUM)}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all ${
                  config.creativityLevel === CreativityLevel.MEDIUM || !config.creativityLevel
                    ? "bg-indigo-600 text-white border-indigo-700 font-bold"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                보통 (적정선)
              </button>
              <button
                type="button"
                onClick={() => handleUpdateConfig("creativityLevel", CreativityLevel.HIGH)}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all ${
                  config.creativityLevel === CreativityLevel.HIGH
                    ? "bg-purple-600 text-white border-purple-700 font-bold"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                높음 (다채로운 수식)
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
              {config.creativityLevel === CreativityLevel.LOW && "💡 [낮음-사실엄수] 평가 요소에 없는 사실 기재를 원천 배제하고 명확한 성취 결과 기준 및 문장만 미려하게 다듬어 서술합니다."}
              {(config.creativityLevel === CreativityLevel.MEDIUM || !config.creativityLevel) && "💡 [보통] 평가 요소 기준에 입각하되 우수한 성취에는 적절한 선을 지켜 칭찬하고, 미흡한 성취에는 발전 가능성과 성장 격려를 조화롭게 융합합니다."}
              {config.creativityLevel === CreativityLevel.HIGH && "💡 [높음-다채로운 수식] 평가 수준에 맞는 정량/정성 어휘를 다양하게 선택하며, 문장 간 중복성 방지를 도모하도록 한글 연결 표현 어휘의 범위를 극대화합니다."}
            </p>
          </div>

        </div>

        {/* Center Column: Privacy Shield & Limits */}
        <div id="config-col-center" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Shield className="w-4 h-4 text-emerald-500" />
            <span>개인정보 안심 마스킹 & 기재 분량</span>
          </h3>

          <div id="box-masking-style" className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">개인정보 보호 실시간 마스킹</label>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              * 마스킹을 선택해도 AI에게 본명을 안전하게 입력하여 올바른 조사를 수립하고, 보여지는 화면과 최종 복사본에만 실시간 마스킹이 적용되어 매우 효율적입니다.
            </p>
            <select
              id="select-masking-style"
              value={maskingStyle}
              onChange={(e) => setMaskingStyle(e.target.value as MaskingStyle)}
              className="w-full px-3 py-2 border border-slate-200 bg-slate-50/30 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={MaskingStyle.NONE}>마스킹 미사용 (실제 본명 노출)</option>
              <option value={MaskingStyle.MIDDLE_ASTERISK}>가운데 글자 곱표 마스킹 (예: 강*운, 남**수)</option>
              <option value={MaskingStyle.LAST_ASTERISK}>끝 글자 곱표 마스킹 (예: 강지*, 남궁민*)</option>
              <option value={MaskingStyle.OO}>동그라미 마스킹 (예: 강OO, 남OOO)</option>
              <option value={MaskingStyle.ANONYMOUS}>익명화 순서 표시 (예: 학생 1, 학생 2)</option>
            </select>
          </div>

          <div id="box-limits" className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">학생당 기재 한도</label>
              <div className="flex border border-slate-200 rounded-lg p-0.5 bg-slate-100 scale-90">
                <button
                  id="btn-limit-char"
                  type="button"
                  onClick={() => handleUpdateConfig("characterLimitType", "char")}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                    config.characterLimitType === "char" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                  }`}
                >
                  글자수
                </button>
                <button
                  id="btn-limit-byte"
                  type="button"
                  onClick={() => handleUpdateConfig("characterLimitType", "byte")}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                    config.characterLimitType === "byte" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                  }`}
                >
                  바이트
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="input-config-max-length"
                type="number"
                value={config.maxLength}
                onChange={(e) => handleUpdateConfig("maxLength", parseInt(e.target.value) || 150)}
                className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm text-center focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-500">
                {config.characterLimitType === "char" ? "자 이내 권장" : "바이트 이내 권장 (나이스 보통 1500바이트 한도)"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              * 기재한도가 넘어가면 대시보드에 빨간 경고창이 점등되어 교사 가독성이 증폭됩니다.
            </p>
          </div>
        </div>

        {/* Right Column: AI Detailed Focus & Custom instructions */}
        <div id="config-col-right" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>AI 강조 주안점 & 맞춤 요청</span>
          </h3>

          <div id="box-focus-areas" className="space-y-2">
            <label id="lbl-focus-growth" className="flex items-start gap-2 cursor-pointer">
              <input
                id="chk-focus-growth"
                type="checkbox"
                checked={config.focusAreas.growthOriented}
                onChange={(e) => handleUpdateFocus("growthOriented", e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
              />
              <div className="text-xs text-slate-700">
                <span className="font-semibold block">성장 및 도전적 격려 (권장)</span>
                <span className="text-[10px] text-slate-400">부정적 단절어 대신, 보충을 통한 피드백과 조언을 제공함.</span>
              </div>
            </label>

            <label id="lbl-focus-active" className="flex items-start gap-2 cursor-pointer">
              <input
                id="chk-focus-active"
                type="checkbox"
                checked={config.focusAreas.activeParticipation}
                onChange={(e) => handleUpdateFocus("activeParticipation", e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
              />
              <div className="text-xs text-slate-700">
                <span className="font-semibold block">수업 주도성 및 참여 태도</span>
                <span className="text-[10px] text-slate-400">질문 빈도, 수업 태도, 집중 상태 등의 정의적 성향 혼합 서술.</span>
              </div>
            </label>

            <label id="lbl-focus-concrete" className="flex items-start gap-2 cursor-pointer">
              <input
                id="chk-focus-concrete"
                type="checkbox"
                checked={config.focusAreas.concreteExamples}
                onChange={(e) => handleUpdateFocus("concreteExamples", e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
              />
              <div className="text-xs text-slate-700">
                <span className="font-semibold block">구체적이고 실질적 동사 사용</span>
                <span className="text-[10px] text-slate-400">교사적 추상 평가 대신, 학생의 실천적 관찰 결과를 서술함.</span>
              </div>
            </label>

            <label id="lbl-focus-prevent-duplication" className="flex items-start gap-2 cursor-pointer">
              <input
                id="chk-focus-prevent-duplication"
                type="checkbox"
                checked={config.focusAreas.preventDuplication}
                onChange={(e) => handleUpdateFocus("preventDuplication", e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
              />
              <div className="text-xs text-slate-700">
                <span className="font-semibold block">학생 간 문장 도배 현상 방지 (다양화)</span>
                <span className="text-[10px] text-slate-400">동일한 점수를 받은 다른 영식 문장의 마디를 적극 교체함.</span>
              </div>
            </label>
          </div>

          <div id="box-additional" className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">추가 상세 전달 조치 (자유 기입)</label>
            <textarea
              id="txt-config-additional"
              rows={2}
              value={config.additionalInstructions}
              onChange={(e) => handleUpdateConfig("additionalInstructions", e.target.value)}
              placeholder="예: '문장의 연결 관계'에 성취를 보인 학생은 더욱 구체적 첨언할 것, '스텔라', '포커스' 등 사설 단어를 지양할 것 등..."
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 hover:bg-white resize-none"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
