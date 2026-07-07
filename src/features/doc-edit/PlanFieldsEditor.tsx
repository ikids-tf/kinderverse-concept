/**
 * 문서 편집 — 좌패널 '표 직접 고치기'(놀이계획 전용, 접이식 세부 편집).
 *
 * 제목·대상·교육과정은 PlanBasicInfo(기본 정보)로 이관 — 여기는 요일/단계 행과
 * 운영 유의점만 남는다. 커밋은 commitPlanPatch(스토어 최신 payload 에 patch 머지) —
 * 형제 컴포넌트(기본정보·도구)와 로컬 draft 스테일로 서로 덮어쓰지 않는다.
 * payload = 단일 진실원: 고치면 본문(node.text)이 재생성돼 가운데에 반영(되돌리기 가능).
 */
import { useEffect, useState } from 'react';
import { useBoardStore } from '@/store/boardStore';
import { commitPlanPatch } from './planCommit';
import type { WeeklyPlanGridProps, PlanDay } from '@/ui-registry/contracts';

interface Props {
  nodeId: string;
  payload: WeeklyPlanGridProps;
  isProject: boolean;
}

const inputCls =
  'w-full rounded-sm border border-border bg-surface px-t2 py-t1 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none';

/** 스토어에서 '지금' days 를 읽는다 — blur 커밋 시 형제 변경을 덮어쓰지 않기 위한 최신값. */
function freshDays(nodeId: string): PlanDay[] {
  const payload = useBoardStore.getState().nodes[nodeId]?.data?.payload as
    | { type?: string; props?: WeeklyPlanGridProps }
    | undefined;
  return payload?.props?.days ?? [];
}

export function PlanFieldsEditor({ nodeId, payload, isProject }: Props) {
  const [draft, setDraft] = useState<WeeklyPlanGridProps>(payload);
  // 형제(기본정보·도구·AI)가 payload 를 바꾸면 draft 재동기화 — 타이핑 중 커밋 전 값만 유실 가능(드묾).
  useEffect(() => {
    setDraft(payload);
  }, [payload]);

  const commitDay = (i: number, patch: Partial<PlanDay>) => {
    const days = freshDays(nodeId).map((d, j) => (j === i ? { ...d, ...patch } : d));
    commitPlanPatch(nodeId, { days }, isProject);
  };
  const removeDay = (i: number) => {
    commitPlanPatch(nodeId, { days: freshDays(nodeId).filter((_, j) => j !== i) }, isProject);
  };
  const setDraftDay = (i: number, patch: Partial<PlanDay>) =>
    setDraft({ ...draft, days: draft.days.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div className="flex flex-col gap-t3">
      {draft.days.map((d, i) => (
        <div key={i} className="rounded-sm border border-border bg-surface-2 p-t3">
          <div className="mb-t2 flex items-center gap-t2">
            <input
              className={`${inputCls} w-24`}
              placeholder={isProject ? '주차·단계' : '요일'}
              value={d.day}
              onChange={(e) => setDraftDay(i, { day: e.target.value })}
              onBlur={(e) => commitDay(i, { day: e.target.value })}
            />
            <input
              className={`${inputCls} flex-1`}
              placeholder="누리/표준 영역"
              value={d.area}
              onChange={(e) => setDraftDay(i, { area: e.target.value })}
              onBlur={(e) => commitDay(i, { area: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeDay(i)}
              title="행 삭제"
              aria-label="행 삭제"
              className="shrink-0 rounded-sm border border-border bg-surface px-t2 py-t1 text-xs text-fg-muted hover:border-accent hover:text-accent"
            >
              ✕
            </button>
          </div>
          <textarea
            className={`${inputCls} mb-t2 resize-none`}
            rows={2}
            placeholder="놀이 활동"
            value={d.activity}
            onChange={(e) => setDraftDay(i, { activity: e.target.value })}
            onBlur={(e) => commitDay(i, { activity: e.target.value })}
          />
          <input
            className={`${inputCls} mb-t2`}
            placeholder="준비물"
            value={d.materials ?? ''}
            onChange={(e) => setDraftDay(i, { materials: e.target.value })}
            onBlur={(e) => commitDay(i, { materials: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="놀이 목표"
            value={d.goal ?? ''}
            onChange={(e) => setDraftDay(i, { goal: e.target.value })}
            onBlur={(e) => commitDay(i, { goal: e.target.value })}
          />
        </div>
      ))}
      {draft.days.length === 0 && <p className="text-xs text-fg-muted">행이 없어요. 도구의 ‘행 추가’로 만들어 보세요.</p>}

      <div>
        <label className="mb-t1 block text-overline uppercase tracking-wide text-fg-muted">운영 시 유의점</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={4}
          placeholder="안전·개별 배려 등 유의점(줄바꿈으로 여러 항목)"
          value={draft.notes ?? ''}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={(e) => commitPlanPatch(nodeId, { notes: e.target.value }, isProject)}
        />
      </div>
    </div>
  );
}
