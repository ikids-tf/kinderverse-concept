/**
 * 문서 편집 — 가운데 문서 렌더(영역 + 표 행 선택 가능).
 *
 * 본문 마크다운을 섹션(heading 경계)으로 나눠 각 섹션을 '클릭 가능한 영역'으로 렌더한다.
 * 표가 있는 섹션(요일별 운영·단계별 프로젝트 전개)은 **데이터 행(주차/요일)도 개별 클릭
 * 타겟**이다 — 저장 마크다운은 표 그대로(인쇄·결재 양식 보존), 렌더 시점에만 행을 하위
 * 선택 단위(`s{i}#r{j}`)로 취급한다(sections.ts tableRowUnits).
 *
 * 행↔섹션 대응은 remark 의 position(섹션 텍스트 기준 줄 번호)으로 잡고, position 이
 * 없으면 렌더 순서 카운터로 폴백한다(react-markdown 버전 방어).
 * 문서 콘텐츠는 kv-doc-md + data-doc-theme(문서 테마, doc-themes.css) — Milray 크롬과 분리.
 */
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentProps } from 'react';
import { splitSections, tableRowUnits, type TableRowUnit } from './sections';
import { DocDecoLayer } from './DocDecoLayer';
import type { ResolvedDocSkin } from './docSkins';

interface Props {
  md: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** 문서 스킨(resolveDocSkin 결과). null = 기본 룩. */
  skin?: ResolvedDocSkin | null;
  /** withImages 변형일 때 얹을 주제 스티커 이미지들(node.data.docDecoImages). */
  decoImages?: string[];
}

/** react-markdown tr 프롭 — node(위치 정보)만 쓴다. */
type TrProps = ComponentProps<'tr'> & { node?: { position?: { start?: { line?: number } } } };

export function DocSections({ md, selectedIds, onToggle, skin, decoImages }: Props) {
  const sections = splitSections(md);
  const sel = new Set(selectedIds);
  // 스킨 CSS 변수(--d-*)는 종이에 한 번만 세팅 — 커스텀 프로퍼티는 상속되므로
  // 자식 kv-doc-md 의 var() 가 전부 여기서 해석된다(속성은 셀렉터 매칭용으로 각자 부착).
  const skinAttr = skin?.id;
  const h1Attr = skin?.h1;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        className="kv-doc-paper relative rounded-lg border border-border bg-surface px-t6 py-t5 shadow-sm"
        data-doc-skin={skinAttr}
        style={skin?.style}
      >
        {skin?.variant.withImages && decoImages && <DocDecoLayer images={decoImages} />}
        {sections.map((s) => {
          const on = sel.has(s.id);
          const rows = tableRowUnits(s);
          const ringCls = on ? 'ring-2 ring-accent' : 'ring-1 ring-transparent hover:ring-border';

          if (rows.length === 0) {
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onToggle(s.id)}
                title={on ? '선택 해제' : '이 영역 선택 — 아래 프롬프트로 고쳐요'}
                className={`group/sec block w-full rounded-md px-t3 py-t1 text-left transition-shadow duration-150 ease-soft ${ringCls}`}
              >
                <div className="kv-doc-md text-sm leading-relaxed text-fg" data-doc-skin={skinAttr} data-doc-h1={h1Attr}>
                  <Markdown remarkPlugins={[remarkGfm]}>{s.text || ' '}</Markdown>
                </div>
              </button>
            );
          }

          // 표 섹션 — 행이 개별 버튼이므로 래퍼는 div(버튼 중첩 회피). 행 밖(헤딩 등) 클릭 = 섹션 전체.
          const unitByLine = new Map<number, TableRowUnit>(rows.map((u) => [u.lineIdx, u]));
          const counter = { tr: 0 }; // position 폴백용 — 렌더마다 새 클로저
          const Tr = ({ node, children, ...rest }: TrProps) => {
            const line = node?.position?.start?.line;
            let unit: TableRowUnit | undefined;
            if (typeof line === 'number') {
              unit = unitByLine.get(line - 1); // position 은 1-기반, lineIdx 는 0-기반
            } else {
              const idx = counter.tr++;
              if (idx > 0) unit = rows[idx - 1]; // 첫 tr = 헤더
            }
            if (!unit) return <tr {...rest}>{children}</tr>;
            const rowOn = sel.has(unit.id);
            return (
              <tr
                {...rest}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(unit.id);
                }}
                title={rowOn ? '선택 해제' : `'${unit.label}' 행만 선택 — 아래 프롬프트로 고쳐요`}
                className={rowOn ? 'kv-docrow kv-docrow-on' : 'kv-docrow'}
              >
                {children}
              </tr>
            );
          };
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => onToggle(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(s.id);
                }
              }}
              title={on ? '선택 해제' : '이 영역 전체 선택(행을 누르면 그 주차만) — 아래 프롬프트로 고쳐요'}
              className={`group/sec block w-full cursor-pointer rounded-md px-t3 py-t1 text-left transition-shadow duration-150 ease-soft ${ringCls}`}
            >
              <div className="kv-doc-md text-sm leading-relaxed text-fg" data-doc-skin={skinAttr} data-doc-h1={h1Attr}>
                <Markdown remarkPlugins={[remarkGfm]} components={{ tr: Tr }}>
                  {s.text || ' '}
                </Markdown>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
