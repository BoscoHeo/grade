/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum EvaluationGrade {
  VERY_GOOD = "매우 잘함",
  GOOD = "잘함",
  NORMAL = "보통",
  NEEDS_IMPROVEMENT = "노력요함",
  NONE = "", // 빈칸
}

export enum EvaluationMode {
  SUBJECT = "subject",     // 교과학습 발달상황 (기존)
  CREATIVE = "creative",   // 창의적 체험활동 특기사항 (신규)
}

export interface EvaluationCriterion {
  id: string; // e.g. "crit_1"
  domain: string; // 영역, e.g. "바르게 고쳐 써요. (문법)"
  achievementStandard: string; // 성취기준, e.g. "[6국04-04] 문장 성분을 이해하고..."
  evaluationElement: string; // 평가요소, e.g. "글을 바르게 고쳐 쓰기"
}

export interface Student {
  id: string;
  number: string; // 학년-반/번호 or 번호, e.g. "1" or "01"
  name: string; // 이름, e.g. "강지운"
  grades: Record<string, EvaluationGrade | string>; // key is criterion ID, value is the grade
}

export enum RecordTone {
  NOUN_ENDING = "noun", // ~함. ~임. (개조식)
  RESPECT_ENDING = "respect", // ~합니다. ~있습니다. (평어체/존댓말)
  SPECIAL_ENDING = "special", // ~함이 돋보임. (돋보임형)
}

export enum CreativityLevel {
  LOW = "low",       // 낮음 (평가 요소 엄수, 근거 사실로만 담백 서술)
  MEDIUM = "medium", // 보통 (적정선 칭찬과 격려의 문맥 조화)
  HIGH = "high",     // 높음 (자유로운 어휘 구사 및 다채로운 문장 변주)
}

export interface GenerationConfig {
  subject: string; // 과목, e.g. "국어", "수학"
  grade: string; // 학년, e.g. "6학년 1학기"
  tone: RecordTone;
  creativityLevel?: CreativityLevel; // 문장의 자유도설정
  maxLength: number; // 최대 글자 수 (자수), e.g. 150자
  characterLimitType: "char" | "byte"; // 자수 기준 혹은 바이트 기준
  focusAreas: {
    growthOriented: boolean; // 성장 지향적 표현
    activeParticipation: boolean; // 주도성/참여성 강조
    concreteExamples: boolean; // 구체적 어휘 사용
    preventDuplication: boolean; // 학생 간 문장 유사도 방지 (다양한 문형 생산)
  };
  additionalInstructions: string; // 특이 사항 및 추가 지침
}

export interface GeneratedRecord {
  studentId: string;
  studentName: string;
  studentNumber: string;
  gradesSummary: string; // 영역별 평치 요약
  recordText: string; // 생성된 발달상황 문구
  editedText?: string; // 선생님이 직접 수정한 문구
  isGenerating: boolean;
  error?: string;
}

export enum MaskingStyle {
  NONE = "none", // 마스킹 없음
  MIDDLE_ASTERISK = "middle_asterisk", // 김*동
  LAST_ASTERISK = "last_asterisk", // 김길*
  OO = "oo", // 김OO
  ANONYMOUS = "anonymous", // 학생1
}
