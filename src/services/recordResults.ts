import type { GeneratedRecord, Student } from "../types";
export const RECORD_FAILURE = "AI 결과를 확인하지 못했습니다. 다시 시도해 주세요.";
export function hasValidStudentIds(students: unknown): students is Student[] {
  if (!Array.isArray(students) || !students.length) return false;
  const ids = students.map(student => student?.id);
  return ids.every(id => typeof id === "string" && id.trim().length > 0) && new Set(ids).size === ids.length;
}
// Match by unique ID, never by position or a model-supplied name.
export function normalizeRecordResults(students: Pick<Student, "id" | "name" | "number">[], data: unknown,
  sanitize: (text: string) => string = text => text.trim()): GeneratedRecord[] {
  if (students.length === 0) return [];
  if (!hasValidStudentIds(students)) throw new Error("학생 ID가 누락되었거나 중복되었습니다.");
  const items: any[] = Array.isArray(data) ? data : [];
  return students.map(student => {
    const matches = items.filter(item => item && item.studentId === student.id);
    const item = matches.length === 1 ? matches[0] : null;
    const text = item && !item.error && typeof item.recordText === "string" ? sanitize(item.recordText).trim() : "";
    return { studentId: student.id, studentName: student.name, studentNumber: student.number || "",
      gradesSummary: text && typeof item.gradesSummary === "string" ? item.gradesSummary : "",
      recordText: text, isGenerating: false, ...(!text ? { error: RECORD_FAILURE } : {}) };
  });
}
// Preserve previous results and teacher edits when regeneration fails.
export function mergeRecordResults(previous: GeneratedRecord[], incoming: GeneratedRecord[]): GeneratedRecord[] {
  const priorById = new Map(previous.map(record => [record.studentId, record]));
  return incoming.map(record => {
    const prior = priorById.get(record.studentId);
    return record.error && prior
      ? { ...prior, studentName: record.studentName, studentNumber: record.studentNumber, isGenerating: false, error: RECORD_FAILURE }
      : record;
  });
}
export function recordOutcome(records: GeneratedRecord[]): string {
  const failed = records.filter(record => record.error).length;
  if (!failed) return "";
  return failed === records.length ? "모든 학생의 AI 처리가 실패했습니다. 기존 결과는 유지됩니다. 다시 시도해 주세요."
    : `${records.length - failed}명 성공, ${failed}명 실패했습니다. 실패한 학생의 기존 결과는 유지됩니다.`;
}
