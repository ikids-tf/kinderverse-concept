/**
 * 문서 편집 — 왼쪽 놀이계획 구조 편집창(놀이계획 문서 전용).
 *
 * WeeklyPlanGrid payload(제목·대상·교육과정·요일별 표·유의점)를 필드로 편집한다. 필드를 고치면
 * payload 를 단일 진실원으로 planDocMarkdown 으로 본문(node.text)을 재생성해 가운데에 반영한다
 * (마크다운→payload 역파싱 회피). 본문 커밋은 editTextCmd(되돌리기), payload 메타는 updateNodeRaw.
 */
import { useState } from 'react';
import { useBoardStore } from '@/store/boardStore';
import { editTextCmd } from '@/board/commands';
import { planDocMarkdown, projectDocMarkdown } from '@/board/workflow';
import type { WeeklyPlanGridProps, PlanDay } from '@/ui-registry/contracts';

interface Props {
  nodeId: string;
  payload: WeeklyPlanGridProps;
  isProject: boolean;
}

const inputCls =
  'w-full rounded-md border border-border bg-surface px-t2 py-t1 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none';
const labelCls = 'mb-t1 block text-overline uppercase tracking-wide text-fg-muted';

export function PlanFieldsEditor({ nodeId, payload, isProject }: Props) {
  const [draft, setDraft] = useState<WeeklyPlanGridProps>(payload);

  /** payload 를 진실원으로 본문 재생성 + 저장(되돌리기 가능). */
  function commit(next: WeeklyPlanGridProps) {
    setDraft(next);
    const wrapped = { type: 'WeeklyPlanGrid' as const, props: next };
    const md = isProject ? projectDocMarkdown(wrapped) : planDocMarkdown(wrapped);
    const board = useBoardStore.getState();
    const cur = board.nodes[nodeId];
    if (!cur) return;
    editTextCmd(nodeId, cur.text ?? '', md);
    board.updateNodeRaw(nodeId, { data: { ...(cur.data ?? {}), payload: wrapped } });
  }

  const setField = <K extends keyof WeeklyPlanGridProps>(k: K, v: WeeklyPlanGridProps[K]) => commit({ ...draft, [k]: v });
  const setDay = (i: number, patch: Partial<PlanDay>) => {
    const days = draft.days.map((d, j) => (j === i ? { ...d, ...patch } : d));
    commit({ ...draft, days });
  };
  const addDay = () => commit({ ...draft, days: [...draft.days, { day: '', area: '', activity: '', materials: '', goal: '' }] });
  const removeDay = (i: number) => commit({ ...draft, days: draft.days.filter((_, j) => j !== i) });

  return (
    <div className="flex flex-col gap-t4">
      {/* 헤더 필드 */}
      <div>
        <label className={labelCls}>제목</label>
        <input
          className={inputCls}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={(e) => setField('title', e.target.value)}
        />
      </div>
      <div className="flex gap-t3">
        <div className="flex-1">
          <label className={labelCls}>대상</label>
          <select className={inputCls} value={draft.age_band} onChange={(e) => setField('age_band', e.target.value as WeeklyPlanGridProps['age_band'])}>
            <option value="3-5">유아(3–5세)</option>
            <option value="0-2">영아(0–2세)</option>
          </select>
        </div>
        <div className="flex-1">
          <label className={labelCls}>교육과정</label>
          <select className={inputCls} value={draft.curriculum} onChange={(e) => setField('curriculum', e.target.value as WeeklyPlanGridProps['curriculum'])}>
            <option value="nuri">누리과정</option>
            <option value="standard">표준보육과정</option>
          </select>
        </div>
      </div>

      {/* 요일별(또는 단계별) 표 — 좁은 패널이라 행을 카드로 세로 배치 */}
      <div>
        <div className="mb-t2 flex items-center justify-between">
          <span className="text-overline uppercase tracking-wide text-fg-muted">{isProject ? '단계별 운영' : '요일별 운영'}</span>
          <button type="button" onClick={addDay} className="rounded-pill border border-border bg-surface px-t2 py-[2px] text-xs font-semibold text-fg-2 hover:border-accent hover:bg-accent hover:text-on-accent">
            + 행 추가
          </button>
        </div>
        <div className="flex flex-col gap-t3">
          {draft.days.map((d, i) => (
            <div key={i} className="rounded-md border border-border bg-surface-2 p-t3">
              <div className="mb-t2 flex items-center gap-t2">
                <input
                  className={`${inputCls} w-20`}
                  placeholder={isProject ? '단계' : '요일'}
                  value={d.day}
                  onChange={(e) => setDraft({ ...draft, days: draft.days.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)) })}
                  onBlur={(e) => setDay(i, { day: e.target.value })}
                />
                <input
                  className={`${inputCls} flex-1`}
                  placeholder="누리/표준 영역"
                  value={d.area}
                  onChange={(e) => setDraft({ ...draft, days: draft.days.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)) })}
                  onBlur={(e) => setDay(i, { area: e.target.value })}
                />
                <button type="button" onClick={() => removeDay(i)} title="행 삭제" aria-label="행 삭제" className="shrink-0 rounded-md border border-border bg-surface px-t2 py-t1 text-xs text-fg-muted hover:border-accent hover:text-accent">
                  ✕
                </button>
              </div>
              <textarea
                className={`${inputCls} mb-t2 resize-none`}
                rows={2}
                placeholder="놀이 활동"
                value={d.activity}
                onChange={(e) => setDraft({ ...draft, days: draft.days.map((x, j) => (j === i ? { ...x, activity: e.target.value } : x)) })}
                onBlur={(e) => setDay(i, { activity: e.target.value })}
              />
              <input
                className={`${inputCls} mb-t2`}
                placeholder="준비물"
                value={d.materials ?? ''}
                onChange={(e) => setDraft({ ...draft, days: draft.days.map((x, j) => (j === i ? { ...x, materials: e.target.value } : x)) })}
                onBlur={(e) => setDay(i, { materials: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="놀이 목표"
                value={d.goal ?? ''}
                onChange={(e) => setDraft({ ...draft, days: draft.days.map((x, j) => (j === i ? { ...x, goal: e.target.value } : x)) })}
                onBlur={(e) => setDay(i, { goal: e.target.value })}
              />
            </div>
          ))}
          {draft.days.length === 0 && <p className="text-xs text-fg-muted">행이 없어요. ‘+ 행 추가’로 만들어 보세요.</p>}
        </div>
      </div>

      {/* 운영 유의점 */}
      <div>
        <label className={labelCls}>운영 시 유의점</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={4}
          placeholder="안전·개별 배려 등 유의점(줄바꿈으로 여러 항목)"
          value={draft.notes ?? ''}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={(e) => setField('notes', e.target.value)}
        />
      </div>
    </div>
  );
}
