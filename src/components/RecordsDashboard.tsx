import React, { useState } from "react";
import { GeneratedRecord, MaskingStyle, GenerationConfig } from "../types";
import { maskName, applyNameMaskingToText, getByteLength } from "../utils";
import { 
  FileText, Clipboard, Check, Edit3, Save, Search, Download, RefreshCw, AlertTriangle, Filter, Eye, EyeOff 
} from "lucide-react";

interface Props {
  records: GeneratedRecord[];
  setRecords: React.Dispatch<React.SetStateAction<GeneratedRecord[]>>;
  config: GenerationConfig;
  maskingStyle: MaskingStyle;
  isGenerating: boolean;
  onRegenerateAll: () => void;
}

export default function RecordsDashboard({ 
  records, 
  setRecords, 
  config, 
  maskingStyle,
  isGenerating,
  onRegenerateAll 
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [showOriginalNames, setShowOriginalNames] = useState(false);

  const handleEditStart = (record: GeneratedRecord) => {
    setEditingId(record.studentId);
    setEditingText(record.editedText || record.recordText);
  };

  const handleEditSave = (studentId: string) => {
    setRecords(prev =>
      prev.map(r => r.studentId === studentId ? { ...r, editedText: editingText } : r)
    );
    setEditingId(null);
  };

  const handleCopySingle = (record: GeneratedRecord, index: number) => {
    const rawText = record.editedText || record.recordText;
    
    // Apply masking if required, and if not showing original names
    let finalPayloadText = rawText;
    if (!showOriginalNames && maskingStyle !== MaskingStyle.NONE) {
      const currentMaskedName = maskName(record.studentName, maskingStyle, index);
      finalPayloadText = applyNameMaskingToText(rawText, record.studentName, currentMaskedName, maskingStyle);
    }

    navigator.clipboard.writeText(finalPayloadText).then(() => {
      setCopiedId(record.studentId);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const handleCopyAllCombined = () => {
    if (records.length === 0) return;
    
    const blockText = records.map((r, index) => {
      const rawText = r.editedText || r.recordText;
      let nameToUse = r.studentName;
      let finalTxt = rawText;
      
      const stNumPrefix = `[${r.studentNumber}번] `;
      
      if (!showOriginalNames && maskingStyle !== MaskingStyle.NONE) {
        nameToUse = maskName(r.studentName, maskingStyle, index);
        finalTxt = applyNameMaskingToText(rawText, r.studentName, nameToUse, maskingStyle);
      }
      
      return `${stNumPrefix}${finalTxt}`;
    }).join("\n");

    navigator.clipboard.writeText(blockText).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  };

  // Export as CSV/Excel helper (학생 이름 제외 요구사항 반영됨)
  const handleExportCSV = () => {
    if (records.length === 0) return;
    
    // CSV Header with BOM for Korean Excel compatibility
    let csvContent = "\uFEFF";
    csvContent += "번호,요약평치,교과학습발달상황(생활기록부평어)\n";
    
    records.forEach((r, index) => {
      const rawText = r.editedText || r.recordText;
      let nameToUse = r.studentName;
      let finalTxt = rawText;
      
      if (!showOriginalNames && maskingStyle !== MaskingStyle.NONE) {
        nameToUse = maskName(r.studentName, maskingStyle, index);
        finalTxt = applyNameMaskingToText(rawText, r.studentName, nameToUse, maskingStyle);
      }
      
      // Escape commas and double quotes for clean CSV
      const escapedNotes = finalTxt.replace(/"/g, '""');
      csvContent += `${r.studentNumber},"${r.gradesSummary}","${escapedNotes}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${config.subject || "교과"}_생활기록부_발달상황_평어.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filters calculation
  const filteredRecords = records.filter((r, index) => {
    const term = searchTerm.toLowerCase();
    
    // Apply name masking if not showing original names
    const displayName = showOriginalNames || maskingStyle === MaskingStyle.NONE
      ? r.studentName 
      : maskName(r.studentName, maskingStyle, index);
      
    const nameMatch = displayName.toLowerCase().includes(term) || r.studentName.toLowerCase().includes(term);
    const textMatch = r.recordText.toLowerCase().includes(term) || (r.editedText && r.editedText.toLowerCase().includes(term));
    const numberMatch = r.studentNumber.includes(term);
    
    const matchesSearch = nameMatch || textMatch || numberMatch;

    if (gradeFilter === "all") return matchesSearch;
    
    // Filter by low achievements (e.g. effort required - '노력요함')
    if (gradeFilter === "needs_improvement") {
      return matchesSearch && r.gradesSummary.includes("노력요함");
    }
    // Filter by premium achievements ('매우 잘함')
    if (gradeFilter === "excellent") {
      return matchesSearch && r.gradesSummary.includes("매우 잘함");
    }
    
    return matchesSearch;
  });

  return (
    <div id="records-dashboard-container" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 id="dashboard-heading" className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <span>4단계: 생성된 교과학습 평어 실시간 대시보드</span>
          </h2>
          <p id="dashboard-desc" className="text-sm text-slate-500 mt-1">
            인공지능이 생활기록부 지침에 맞추어 맞춤 생성한 문구입니다. <strong>*(나이스(NEIS) 보안 준수 및 개인정보 비식별 조치에 따라 실제 결과 CSV 파일에는 학생의 실명이 완전히 배제된 채 번호 기준으로만 저장됩니다.)</strong>
          </p>
        </div>

        {records.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-export-csv"
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>엑셀(CSV) 다운로드</span>
            </button>

            <button
              id="btn-copy-all"
              type="button"
              onClick={handleCopyAllCombined}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                copiedAll 
                ? "bg-indigo-600 text-white border-indigo-600" 
                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
              }`}
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>{copiedAll ? "정렬된 전체 평어 클립보드 복사완료!" : "순번정렬 전체 복사"}</span>
            </button>
          </div>
        )}
      </div>

      {records.length === 0 ? (
        <div id="no-records-view" className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center space-y-4">
          <FileText className="w-12 h-12 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <p className="text-slate-600 font-semibold text-sm">생성 완료된 평어 기록이 없습니다.</p>
            <p className="text-slate-400 text-xs">상단의 단계를 거쳐 학생 성치기준을 준비한 뒤 대기열에서 '교과학습 평어 자동 생성'을 눌러주세요.</p>
          </div>
          {isGenerating ? (
            <div className="flex items-center justify-center gap-2 text-indigo-600 text-xs font-semibold py-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>AI가 연쇄 분석 중입니다. 대형 배치 처리일 경우 최대 1분이 걸립니다...</span>
            </div>
          ) : (
            <button
              id="dashboard-init-generate-btn"
              type="button"
              onClick={onRegenerateAll}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
            >
              생활기록부 평어 첫 생성 시작
            </button>
          )}
        </div>
      ) : (
        <div id="records-dashboard-panel" className="space-y-4">
          
          {/* Filters Bar */}
          <div id="filters-bar" className="flex flex-col sm:flex-row gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div id="search-box" className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="dashboard-search-input"
                type="text"
                placeholder="번호 또는 성취 등급 기재 내용 검색..."
                className="w-full text-xs pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div id="filter-box" className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                id="select-grade-filter"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="text-xs border border-slate-200 bg-white px-3 py-2 rounded-xl focus:outline-none"
              >
                <option value="all">전체 학생 성적평치 보기</option>
                <option value="excellent">💎 매우 잘함 포함 학생만</option>
                <option value="needs_improvement">⚠️ 노력요함 포함 학생만</option>
              </select>
            </div>
          </div>

          <div id="filtered-header" className="text-xs text-slate-400 px-1 font-medium flex items-center justify-between">
            <span>총 {filteredRecords.length}명의 대기 목록 필터링됨</span>
            <span className="text-indigo-600">
              🔒 보안 모드: 보안을 위해 최종 성적 평어 결과지에는 실제 이름이 기입되지 않습니다.
            </span>
          </div>

          {/* List of Student Card Records */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRecords.map((r, index) => {
              const currentText = r.editedText || r.recordText;
              
              // Name calculation
              const mappedIsMasked = !showOriginalNames && maskingStyle !== MaskingStyle.NONE;
              const displayedStudentName = mappedIsMasked
                ? maskName(r.studentName, maskingStyle, index) 
                : r.studentName;

              // Apply masking to comment body text
              const displayedCommentText = mappedIsMasked
                ? applyNameMaskingToText(currentText, r.studentName, displayedStudentName, maskingStyle)
                : currentText;

              const totalCharCount = displayedCommentText.length;
              const totalByteCount = getByteLength(displayedCommentText);

              const isLengthExceeded = config.characterLimitType === "char" 
                ? totalCharCount > config.maxLength
                : totalByteCount > config.maxLength;

              const isUserEditingCurrentRecord = editingId === r.studentId;

              return (
                <div
                  id={`dashboard-card-${r.studentId}`}
                  key={r.studentId}
                  className={`bg-white border rounded-2xl p-5 shadow-sm space-y-3.5 transition-all relative flex flex-col justify-between ${
                    isLengthExceeded 
                    ? "border-rose-200 hover:border-rose-300 bg-rose-50/5" 
                    : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span id={`card-num-${r.studentId}`} className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {r.studentNumber}번 학생
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full block truncate max-w-[220px]" title={r.gradesSummary}>
                        등급평치 요약: {r.gradesSummary}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isUserEditingCurrentRecord ? (
                        <button
                          id={`btn-save-record-edit-${r.studentId}`}
                          type="button"
                          onClick={() => handleEditSave(r.studentId)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all"
                        >
                          <Save className="w-3 h-3" />
                          <span>저장</span>
                        </button>
                      ) : (
                        <button
                          id={`btn-start-record-edit-${r.studentId}`}
                          type="button"
                          onClick={() => handleEditStart(r)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg transition-all"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>수정</span>
                        </button>
                      )}

                      <button
                        id={`btn-copy-record-${r.studentId}`}
                        type="button"
                        onClick={() => handleCopySingle(r, index)}
                        className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold border rounded-lg transition-all ${
                          copiedId === r.studentId 
                          ? "bg-slate-800 text-white border-slate-800 animate-pulse" 
                          : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                        }`}
                      >
                        {copiedId === r.studentId ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>복사됨</span>
                          </>
                        ) : (
                          <>
                            <Clipboard className="w-3 h-3" />
                            <span>단독 복사</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Comment Content block */}
                  <div className="flex-1">
                    {isUserEditingCurrentRecord ? (
                      <textarea
                        id={`edit-record-textarea-${r.studentId}`}
                        rows={4}
                        className="w-full text-xs p-3 border border-indigo-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-indigo-50/5"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                      />
                    ) : (
                      <p id={`record-text-paragraph-${r.studentId}`} className="text-xs text-slate-700 leading-relaxed text-left bg-slate-50/30 p-3 rounded-xl whitespace-pre-wrap font-sans">
                        {displayedCommentText}
                      </p>
                    )}
                  </div>

                  {/* Byte metrics block */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px]">
                    <div className="flex items-center gap-2 font-mono text-slate-400">
                      <span>{totalCharCount} 자</span>
                      <span>•</span>
                      <span>{totalByteCount} Byte (나이스기준)</span>
                    </div>

                    {isLengthExceeded && (
                      <div id={`limit-alert-${r.studentId}`} className="text-rose-600 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>한도 초과 ({config.characterLimitType === "char" ? `${config.maxLength}자` : `${config.maxLength}Byte`})</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
