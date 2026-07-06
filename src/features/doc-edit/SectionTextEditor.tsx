/**
 * 문서 편집 — 왼쪽 범용 섹션 편집창(놀이계획이 아닌 문서·구조화 payload 없는 문서용).
 *
 * 본문 마크다운을 섹션(heading 경계)으로 나눠 각 섹션을 textarea 로 직접 편집한다. 고치면 그 섹션만
 * 교체해 재조립 → editTextCmd(되돌리기). 구조화(표) 편집은 놀이계획 전용(PlanFieldsEditor)이고,
 * 그 외 문서는 여기서 섹션 단위로 자유 편집한다.
 */
import { useBoardStore } from '@/store/boardStore';
import { editTextCmd } from '@/board/commands';
import { splitSections, joinSections } from './sections';

interface Props {
  nodeId: string;
  md: string;
}

const areaCls =
  'w-full resize-none rounded-md border border-border bg-surface px-t2 py-t1 font-mono text-xs leading-relaxed text-fg focus:border-accent focus:outline-none';

export function SectionTextEditor({ nodeId, md }: Props) {
  const sections = splitSections(md);

  function commitSection(id: string, text: string) {
    const board = useBoardStore.getState();
    const cur = board.nodes[nodeId];
    if (!cur) return;
    const secs = splitSections(cur.text ?? '');
    const next = joinSections(secs.map((s) => (s.id === id ? { text } : s)));
    editTextCmd(nodeId, cur.text ?? '', next);
  }

  return (
    <div className="flex flex-col gap-t4">
      <p className="text-xs text-fg-muted">각 영역을 직접 고치거나, 아래 프롬프트바로 선택 영역을 AI로 고칠 수 있어요.</p>
      {sections.map((s) => (
        <div key={s.id}>
          <label className="mb-t1 block truncate text-overline uppercase tracking-wide text-fg-muted">{s.heading}</label>
          <textarea
            className={areaCls}
            rows={Math.min(10, Math.max(3, s.text.split('\n').length))}
            defaultValue={s.text}
            onBlur={(e) => {
              if (e.target.value !== s.text) commitSection(s.id, e.target.value);
            }}
          />
        </div>
      ))}
    </div>
  );
}
