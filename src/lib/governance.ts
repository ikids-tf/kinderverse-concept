/* Governance policy registry (PRD §12, CLAUDE §2.5/§4). Single source for the
   enforced data-governance rules + where each is enforced — surfaced on the
   eval/QA page as a readiness checklist. */

export type PolicyStatus = 'enforced' | 'partial' | 'planned';

export interface Policy {
  id: string;
  label: string;
  rule: string;
  enforcedAt: string;
  status: PolicyStatus;
}

export const GOVERNANCE_POLICIES: Policy[] = [
  {
    id: 'tenant',
    label: '테넌트(원) 격리',
    rule: '아동 데이터는 원 단위로 격리, 경계 침범 금지.',
    enforcedAt: 'classStore (반/아동 scope), 프롬프트 L3 컨텍스트',
    status: 'enforced',
  },
  {
    id: 'consent',
    label: '동의 기반(consent_flag)',
    rule: '미동의 사진은 분류·생성 파이프라인에서 제외.',
    enforcedAt: 'classStore consent + 우리반 토글',
    status: 'enforced',
  },
  {
    id: 'masking',
    label: '아동 식별정보 마스킹',
    rule: '에이전트/외부로 나갈 때 아동명 마스킹(성+O).',
    enforcedAt: 'maskName() · buildTenantContext()',
    status: 'enforced',
  },
  {
    id: 'grounding',
    label: '무근거 생성 금지',
    rule: '관찰·평가는 grounding 없이 생성 금지, 근거 출처 표시.',
    enforcedAt: 'contracts 검증(observation.source), 기록/평가 적합성 검증',
    status: 'enforced',
  },
  {
    id: 'highrisk',
    label: '고위험 적합성 검증',
    rule: '발달평가서는 자동 체크리스트 패스 1회.',
    enforcedAt: 'agent.writing suitabilityCheck()',
    status: 'enforced',
  },
  {
    id: 'send',
    label: '발송 자율성 게이트',
    rule: '생성=L1 / 통신문·공지 발송=L2 / 외부 채널·평가서=L3.',
    enforcedAt: 'LetterPreview · PlayStoryCard · AssessmentReport',
    status: 'enforced',
  },
  {
    id: 'delete',
    label: '영구 삭제 = L3 휴먼게이트',
    rule: '아동·번들 영구 삭제는 확인 후 사용자가 직접.',
    enforcedAt: '우리반 · 폴더 삭제 확인 게이트',
    status: 'enforced',
  },
  {
    id: 'video',
    label: 'AI 동영상 생성(Veo)',
    rule: '생성=L1·과금 확인 게이트 / 공유=L2 / 아동 미생성(무인물 프롬프트+negativePrompt).',
    enforcedAt: 'video.ts 확인 팝오버 · studio.ts KV_VIDEO_STYLE·KV_VIDEO_NEGATIVE',
    status: 'enforced',
  },
  {
    id: 'no-shared-training',
    label: '공용 모델 학습 금지',
    rule: '학습 신호는 테넌트 로컬에만 누적, 공용 모델 학습 미사용.',
    enforcedAt: 'learningStore (localStorage, 로컬 영속)',
    status: 'enforced',
  },
  {
    id: 'retention',
    label: '보존·파기 정책',
    rule: '보존 기간·파기 절차. (백엔드 연동 시 정식화)',
    enforcedAt: 'learningStore.reset() / 데이터 파기 액션',
    status: 'partial',
  },
  {
    id: 'legal',
    label: '법무 검토(개인정보보호법·영유아보육법)',
    rule: '베타 전 법무 검토 완료 필요.',
    enforcedAt: '프로세스(코드 외)',
    status: 'planned',
  },
];
