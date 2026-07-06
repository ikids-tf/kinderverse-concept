/**
 * 문서 편집 — 가운데 문서 렌더(영역 선택 가능).
 *
 * 본문 마크다운을 섹션(heading 경계)으로 나눠 각 섹션을 '클릭 가능한 영역'으로 렌더한다.
 * 클릭하면 선택 토글(코랄 아웃라인), 선택한 영역만 하단 프롬프트바로 AI 수정한다.
 * 문서 콘텐츠는 kv-doc-md(기존 문서 스타일) 재사용 — Milray 크롬과 분리.
 */
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { splitSections } from './sections';

interface Props {
  md: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function DocSections({ md, selectedIds, onToggle }: Props) {
  const sections = splitSections(md);
  const sel = new Set(selectedIds);
  return (
    <div className="mx-auto w-full max-w-3xl">
      {sections.map((s) => {
        const on = sel.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            title={on ? '선택 해제' : '이 영역 선택 — 아래 프롬프트로 고쳐요'}
            className={`group/sec block w-full rounded-md px-t3 py-t1 text-left transition-shadow duration-150 ease-soft ${
              on ? 'ring-2 ring-accent' : 'ring-1 ring-transparent hover:ring-border'
            }`}
          >
            <div className="kv-doc-md text-sm leading-relaxed text-fg">
              <Markdown remarkPlugins={[remarkGfm]}>{s.text || ' '}</Markdown>
            </div>
          </button>
        );
      })}
    </div>
  );
}
