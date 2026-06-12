import { EvaluationCriterion, Student, EvaluationGrade } from "./types";

export const SAMPLE_CRITERIA: EvaluationCriterion[] = [
  {
    id: "crit_1",
    domain: "2. 바르게 고쳐 써요. (문법)",
    achievementStandard: "[6국04-04] 문장 성분을 이해하고 호응 관계가 올바른 문장을 구성한다.",
    evaluationElement: "글을 바르게 고쳐 쓰기",
  },
  {
    id: "crit_2",
    domain: "매체 단원. 매체 자료를 만들어요. (매체)",
    achievementStandard: "[6국06-03] 적합한 양식과 수용자의 반응을 고려하여 복합 양식 매체 자료를 제작하고 공유한다.",
    evaluationElement: "복합양식 매체 자료 만들고 공유하기",
  },
];

export const SAMPLE_STUDENTS: Student[] = [
  {
    id: "stud_1",
    number: "1",
    name: "학생 1",
    grades: {
      crit_1: EvaluationGrade.GOOD,
      crit_2: EvaluationGrade.VERY_GOOD,
    },
  },
  {
    id: "stud_2",
    number: "2",
    name: "학생 2",
    grades: {
      crit_1: EvaluationGrade.GOOD,
      crit_2: EvaluationGrade.NORMAL,
    },
  },
  {
    id: "stud_3",
    number: "3",
    name: "학생 3",
    grades: {
      crit_1: EvaluationGrade.VERY_GOOD,
      crit_2: EvaluationGrade.GOOD,
    },
  },
  {
    id: "stud_4",
    number: "4",
    name: "학생 4",
    grades: {
      crit_1: EvaluationGrade.NORMAL,
      crit_2: EvaluationGrade.NEEDS_IMPROVEMENT,
    },
  },
  {
    id: "stud_5",
    number: "5",
    name: "학생 5",
    grades: {
      crit_1: EvaluationGrade.VERY_GOOD,
      crit_2: EvaluationGrade.VERY_GOOD,
    },
  },
];

export const SAMPLE_CREATIVE_CRITERIA: EvaluationCriterion[] = [
  {
    id: "crit_c1",
    domain: "자율활동 (Autonomous)",
    achievementStandard: "학급 1인 1역 역할 실천 및 자치 모임 참여",
    evaluationElement: "책임감 있는 학급 1인 1역 실천 및 경청 중심의 상호 협력",
  },
  {
    id: "crit_c2",
    domain: "동아리활동 (Club)",
    achievementStandard: "교내 AI 및 소프트웨어 융합 코딩반",
    evaluationElement: "엔트리 소프트웨어 블록 코딩 동작 구현 및 팀 프로젝트 협력",
  },
];

export const SAMPLE_CREATIVE_STUDENTS: Student[] = [
  {
    id: "stud_c1",
    number: "1",
    name: "김강민",
    grades: {
      crit_c1: "리더쉽형 (주도적인 규범 수립 및 이견 조율성)",
      crit_c2: "창의 주도형 (과제 수행 중 기발한 창작안을 내어 주도함)",
    },
  },
  {
    id: "stud_c2",
    number: "2",
    name: "박서연",
    grades: {
      crit_c1: "1인 1역 실천형 (교내 청결 및 화단 가꾸기를 조용히 꾸준히 기여)",
      crit_c2: "협동 조력자형 (모둠 부원들과 배려하고 성실하게 제작을 지원)",
    },
  },
  {
    id: "stud_c3",
    number: "3",
    name: "이도윤",
    grades: {
      crit_c1: "공동체성 (학급 모임을 경청하며 책임있게 보조함)",
      crit_c2: "자기 주도적 탐구형 (기술 도구 활용 능력이 뛰어나 스스로 성취)",
    },
  },
  {
    id: "stud_c4",
    number: "4",
    name: "최지우",
    grades: {
      crit_c1: "안전 준수형 (교내 모의 대피 훈련 및 규정을 솔선수범 준수)",
      crit_c2: "적극 소통형 (다양한 난관을 부원들과 즐거운 의사소통으로 극복)",
    },
  },
  {
    id: "stud_c5",
    number: "5",
    name: "정민우",
    grades: {
      crit_c1: "소극적 참여형 (활동 참여 빈도가 낮아 관심과 실천 보완 지도 필요)",
      crit_c2: "적극성 보완형 (과정 수행 단계의 끝맺음 집중력이 요구되어 조언 필요)",
    },
  },
];


