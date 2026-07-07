/**
 * 문서 편집 — 좌패널 '템플릿·도구'(놀이계획서 꾸미기·수정).
 *
 * 템플릿(문서 스킨): 패밀리 4종 카드 — 클릭하면 패널 오른쪽에 그 계열 변형 10종
 * 플라이아웃이 열린다(VariantFlyout — 적용은 변형 클릭 시). 콘텐츠 스킨 색은 Milray
 * 면제(doc-themes.css·docSkins.ts), 패널 크롬은 Milray 유지.
 *
 * 도구: 원클릭 AI 액션 — 프리셋 프롬프트를 기존 'kv:doc-edit-prompt' CustomEvent 로
 * 그대로 발사(DocEditPage 리스너가 수신 → applyDocPrompt). 선택 영역이 있으면 그 영역만,
 * 없으면 문서 전체. editTextCmd 라 Ctrl+Z 되돌리기 가능(L1 자동 게이트).
 */
import { useBoardStore } from '@/store/boardStore';
import { commitPlanPatch } from './planCommit';
import { DOC_SKIN_FAMILIES, FAMILY_META, findVariant, type DocSkinFamily } from './docSkins';
import type { PlanDay } from '@/ui-registry/contracts';

interface Props {
  nodeId: string;
  /** 놀이계획(payload 보유)일 때만 구조 도구(행 추가) 노출. */
  hasPlan: boolean;
  isProject: boolean;
  /** 패밀리 카드 클릭 → 변형 플라이아웃 열기(DocEditPage 가 aside 형제로 렌더). */
  onOpenVariants: (family: DocSkinFamily) => void;
  /** 현재 플라이아웃이 열린 패밀리(카드 하이라이트용). */
  openFamily: DocSkinFamily | null;
}

/** 원클릭 AI 도구 — 프리셋 프롬프트(문구가 곧 기능 품질 — 여기서만 튜닝). */
const AI_TOOLS: Array<{ icon: string; name: string; prompt: string }> = [
  { icon: '✨', name: '쉬운 말로', prompt: '유아·학부모가 읽기 쉬운 말로 문장을 풀어 줘' },
  { icon: '✍️', name: '문장 다듬기', prompt: '맞춤법과 어색한 표현을 자연스럽게 다듬어 줘' },
  { icon: '🔍', name: '더 구체적으로', prompt: '활동 서술을 문서에 있는 내용을 근거로만 준비물과 교사 발문까지 더 구체적으로 보강해 줘' },
  { icon: '🛡️', name: '안전 문구 보강', prompt: '활동에 필요한 안전·개별 배려 문구를 운영 시 유의점에 보강해 줘' },
  { icon: '🌈', name: '연계 점검', prompt: '활동과 교육과정 영역의 매칭이 맞는지 점검해서 자연스럽게 재정리해 줘' },
  { icon: '💌', name: '학부모 말투로', prompt: '학부모께 보내는 안내 말투로 부드럽게 바꿔 줘' },
];

export function DocToolsPanel({ nodeId, hasPlan, isProject, onOpenVariants, openFamily }: Props) {
  const theme = useBoardStore((s) => (s.nodes[nodeId]?.data?.docTheme as DocSkinFamily | undefined) ?? 'basic');
  const variantId = useBoardStore((s) => s.nodes[nodeId]?.data?.docVariant as string | undefined);
  const genBusy = useBoardStore((s) => !!s.generating);
  const activeVariant = findVariant(theme, variantId);

  const runTool = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('kv:doc-edit-prompt', { detail: { prompt } }));
  };
  const addRow = () => {
    const cur = useBoardStore.getState().nodes[nodeId];
    const payload = cur?.data?.payload as { props?: { days?: PlanDay[] } } | undefined;
    const days = payload?.props?.days ?? [];
    commitPlanPatch(nodeId, { days: [...days, { day: '', area: '', activity: '', materials: '', goal: '' }] }, isProject);
  };

  return (
    <section className="rounded-md border border-border bg-surface p-t3">
      <h3 className="mb-t2 font-display text-sm font-semibold text-fg">문서 옷 입히기</h3>
      <p className="mb-t2 text-[11px] leading-relaxed text-fg-muted">
        계열을 누르면 오른쪽에 그 느낌의 스타일 10가지가 열려요. 🖼️ 표시는 주제 그림이 함께 붙는 스타일이에요.
      </p>
      <div className="grid grid-cols-2 gap-t2">
        {FAMILY_META.map((t) => {
          const first = DOC_SKIN_FAMILIES[t.id][0].vars;
          const isCurrent = theme === t.id;
          const isOpen = openFamily === t.id;
          return (
            <button
              key={t.id}
              type="button"
              title={`${t.desc} — 눌러서 10가지 스타일 보기`}
              aria-pressed={isCurrent}
              aria-expanded={isOpen}
              data-kv-flyout-trigger
              onClick={() => onOpenVariants(t.id)}
              className={`rounded-sm border p-t2 text-left transition-colors duration-150 ease-soft ${
                isCurrent || isOpen ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-accent'
              }`}
            >
              {/* 미니 프리뷰 — 계열 대표색 3줄 목업(스킨 색 노출은 콘텐츠 면제 스와치에 한정) */}
              <span className="mb-t1 block overflow-hidden rounded-[3px]" aria-hidden>
                <span className="block h-2.5" style={{ background: first.h1bg, borderLeft: `3px solid ${first.accent}` }} />
                <span className="mt-[2px] block h-1.5 w-3/4" style={{ background: first.line }} />
                <span className="mt-[2px] block h-1.5" style={{ background: first.line, opacity: 0.55 }} />
              </span>
              <span className="block text-xs font-semibold text-fg">{t.name}</span>
              <span className="block truncate text-[11px] text-fg-muted">
                {isCurrent && activeVariant ? `✓ ${activeVariant.name}` : t.desc}
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="mb-t2 mt-t4 font-display text-sm font-semibold text-fg">빠르게 다듬어요</h3>
      <p className="mb-t2 text-[11px] leading-relaxed text-fg-muted">
        문서 영역을 골랐으면 그 부분만, 아니면 문서 전체를 고쳐요. 언제든 Ctrl+Z로 되돌릴 수 있어요.
      </p>
      <div className="grid grid-cols-2 gap-t1">
        {AI_TOOLS.map((t) => (
          <button
            key={t.name}
            type="button"
            disabled={genBusy}
            title={t.prompt}
            onClick={() => runTool(t.prompt)}
            className="rounded-sm border border-border bg-surface px-t2 py-t1 text-left text-xs font-semibold text-fg-2 transition-colors duration-150 ease-soft hover:border-accent hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.icon} {t.name}
          </button>
        ))}
      </div>
      {hasPlan && (
        <button
          type="button"
          onClick={addRow}
          className="mt-t2 w-full rounded-sm border border-border bg-surface-2 px-t2 py-t1 text-xs font-semibold text-fg-2 transition-colors duration-150 ease-soft hover:border-accent hover:text-accent"
        >
          📅 {isProject ? '주차(단계) 추가' : '요일 행 추가'}
        </button>
      )}
    </section>
  );
}
