/**
 * 문서 편집 — 좌패널 상단 '기본 정보'(놀이계획 전용).
 *
 * 제목 · 대상(연령) · 교육과정은 세그먼트 필 버튼(항상 노출, 원클릭 — select 는 현재값이
 * 접혀 있어 교사가 놓친다). 클릭 즉시 commitPlanPatch → payload 단일 진실원으로 본문
 * 재생성 → 중앙 문서 메타줄이 바로 바뀐다.
 *
 * 키워드: 입력(Enter/쉼표) → 칩 추가, 아래 추천 칩(suggestPlanKeywords — 문서 유래·계절·
 * 영역 갭) 탭 = 추가. node.data.docKeywords 저장(payload 계약 무접촉) — 하단 프롬프트로
 * AI 수정할 때 [수업 설정]으로 함께 반영된다(board/docEdit.ts).
 */
import { useMemo, useState } from 'react';
import { useBoardStore } from '@/store/boardStore';
import { commitPlanPatch, commitDocData } from './planCommit';
import { suggestPlanKeywords } from './keywords';
import { AGE_OPTIONS, bandForAge, type WeeklyPlanGridProps } from '@/ui-registry/contracts';

interface Props {
  nodeId: string;
  payload: WeeklyPlanGridProps;
  isProject: boolean;
}

const labelCls = 'mb-t1 block text-overline uppercase tracking-wide text-fg-muted';
const inputCls =
  'w-full rounded-sm border border-border bg-surface px-t2 py-t1 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none';

function segCls(on: boolean): string {
  return `flex-1 rounded-sm border px-t1 py-t1 text-xs font-semibold transition-colors duration-150 ease-soft ${
    on
      ? 'border-accent bg-accent text-on-accent'
      : 'border-border bg-surface text-fg-2 hover:border-accent hover:text-accent'
  }`;
}

export function PlanBasicInfo({ nodeId, payload, isProject }: Props) {
  const [title, setTitle] = useState(payload.title);
  const [kwDraft, setKwDraft] = useState('');
  // 키워드는 노드 구독으로 최신값 유지(도구/AI 경로가 바꿔도 즉시 반영).
  const keywords = useBoardStore((s) => {
    const arr = s.nodes[nodeId]?.data?.docKeywords;
    return Array.isArray(arr) ? (arr as string[]) : [];
  });
  const suggestions = useMemo(() => suggestPlanKeywords(payload, keywords), [payload, keywords]);

  const addKeywords = (raw: string) => {
    const parts = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...keywords];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    commitDocData(nodeId, { docKeywords: next.slice(0, 12) });
    setKwDraft('');
  };
  const removeKeyword = (w: string) => commitDocData(nodeId, { docKeywords: keywords.filter((k) => k !== w) });

  return (
    <section className="rounded-md border border-border bg-surface p-t3">
      <h3 className="mb-t3 font-display text-sm font-semibold text-fg">기본 정보</h3>
      <div className="flex flex-col gap-t3">
        <div>
          <label className={labelCls}>제목</label>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== payload.title) {
                commitPlanPatch(nodeId, { title: e.target.value.trim() }, isProject);
              }
            }}
          />
        </div>
        <div>
          <label className={labelCls}>대상(만 나이)</label>
          <div className="flex gap-t1" role="radiogroup" aria-label="대상 연령">
            {AGE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={payload.age_years === o.value}
                className={segCls(payload.age_years === o.value)}
                // 세분 연령 + 파생 광역 밴드를 함께 커밋(밴드는 기존 소비자 호환용).
                onClick={() => commitPlanPatch(nodeId, { age_years: o.value, age_band: bandForAge(o.value) }, isProject)}
              >
                {o.short}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>교육과정</label>
          <div className="flex gap-t1" role="radiogroup" aria-label="교육과정">
            <button type="button" role="radio" aria-checked={payload.curriculum === 'nuri'} className={segCls(payload.curriculum === 'nuri')} onClick={() => commitPlanPatch(nodeId, { curriculum: 'nuri' }, isProject)}>
              누리과정
            </button>
            <button type="button" role="radio" aria-checked={payload.curriculum === 'standard'} className={segCls(payload.curriculum === 'standard')} onClick={() => commitPlanPatch(nodeId, { curriculum: 'standard' }, isProject)}>
              표준보육과정
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>키워드</label>
          <input
            className={inputCls}
            placeholder="예) 여름, 물놀이 — 쉼표나 Enter로 추가해요"
            value={kwDraft}
            onChange={(e) => setKwDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addKeywords(kwDraft);
              }
            }}
            onBlur={() => kwDraft.trim() && addKeywords(kwDraft)}
          />
          {keywords.length > 0 && (
            <div className="mt-t2 flex flex-wrap gap-t1">
              {keywords.map((w) => (
                <span key={w} className="inline-flex items-center gap-[3px] rounded-sm bg-accent px-t2 py-[2px] text-xs font-semibold text-on-accent">
                  {w}
                  <button type="button" aria-label={`${w} 키워드 삭제`} className="opacity-80 hover:opacity-100" onClick={() => removeKeyword(w)}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="mt-t2">
              <p className="mb-t1 text-[11px] text-fg-muted">이런 키워드는 어때요?</p>
              <div className="flex flex-wrap gap-t1">
                {suggestions.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className="rounded-sm border border-border bg-surface-2 px-t2 py-[2px] text-xs text-fg-2 transition-colors duration-150 ease-soft hover:border-accent hover:text-accent"
                    onClick={() => addKeywords(w)}
                  >
                    + {w}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-t2 text-[11px] leading-relaxed text-fg-muted">
            키워드는 아래 프롬프트로 고칠 때 방향으로 함께 반영돼요(문서에 그대로 인쇄되진 않아요).
          </p>
        </div>
      </div>
    </section>
  );
}
