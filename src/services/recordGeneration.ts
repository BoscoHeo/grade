import type { GeneratedRecord, Student } from "../types";
import { hasValidStudentIds, normalizeRecordResults, mergeRecordResults, recordOutcome } from "./recordResults";

interface GenerationState {
  students: Student[];
  records: GeneratedRecord[];
  editVersions: ReadonlyMap<string, number>;
}
interface GenerationOptions {
  getState: () => GenerationState;
  confirm: (message: string) => boolean;
  request: (students: Student[]) => Promise<unknown>;
  apply: (update: (previous: GeneratedRecord[]) => GeneratedRecord[]) => void;
  pending: (value: boolean) => void;
  outcome: (message: string) => void;
}

// One coordinator per mounted App. Only the newest accepted request may apply results.
export function createRecordGenerationController() {
  let latestRequest = 0;
  return async (options: GenerationOptions) => {
    const start = options.getState();
    if (!hasValidStudentIds(start.students)) {
      options.outcome("학생 ID가 누락되었거나 중복되었습니다. 명단을 확인해 주세요.");
      return;
    }
    const ids = new Set(start.students.map(student => student.id));
    if (start.records.some(record => ids.has(record.studentId) && record.editedText)
      && !options.confirm("새 평어 생성에 성공하면 기존 교사 수정본은 새 결과로 대체됩니다. 실패한 학생의 수정본과 요청 중 저장한 수정본은 유지됩니다. 계속하시겠습니까?")) return;
    const version = ++latestRequest;
    const editsAtStart = new Map(start.editVersions);
    options.pending(true);
    options.outcome("");
    let data: unknown = [];
    try { data = await options.request(start.students); }
    catch { /* Safe failed rows preserve prior content. Never expose request errors. */ }
    try {
      if (version !== latestRequest) return;
      const requestedRoster = () => options.getState().students.filter(student => ids.has(student.id));
      options.apply(previous => {
        // React may run this updater after another request or an edit has started.
        if (version !== latestRequest) return previous;
        const state = options.getState();
        const incoming = normalizeRecordResults(requestedRoster(), data);
        const merged = mergeRecordResults(previous, incoming);
        const priorById = new Map(previous.map(record => [record.studentId, record]));
        return merged.map(record => {
          const prior = priorById.get(record.studentId);
          const savedSinceStart = (state.editVersions.get(record.studentId) ?? 0) !== (editsAtStart.get(record.studentId) ?? 0);
          return prior && savedSinceStart ? { ...record, recordText: prior.recordText, editedText: prior.editedText } : record;
        });
      });
      options.outcome(recordOutcome(normalizeRecordResults(requestedRoster(), data)));
    } finally { if (version === latestRequest) options.pending(false); }
  };
}
