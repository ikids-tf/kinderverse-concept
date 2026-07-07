/**
 * 문서 옷 입히기 — 변형 플라이아웃. 패밀리 카드를 클릭하면 좌패널 '오른쪽'에 세로로
 * 그 계열 변형 10종이 열리고, 변형을 클릭하면 즉시 문서에 적용된다.
 *
 * 배치: DocEditPage 본문 행(relative)의 aside '형제' absolute(left=ASIDE_W) —
 * aside 는 overflow-y-auto(양축 클리핑)라 내부 absolute 는 잘린다. fixed+left:400 도
 * 금지(AppShell LNB 가 왼쪽에 있어 뷰포트 좌표가 어긋남). z-30 = 프롬프트바(z-40) 아래.
 * 닫기: 캡처 단계 pointerdown(+data 마커 허용목록 — 트리거 이중발화 방지) + Esc.
 */
import { useEffect } from 'react';
import { DOC_SKIN_FAMILIES, FAMILY_META, type DocSkinFamily, type DocSkinVariant } from './docSkins';

interface Props {
  family: DocSkinFamily;
  /** 현재 적용된 변형 id(하이라이트). */
  activeVariantId?: string;
  left: number;
  onPick: (variant: DocSkinVariant) => void;
  onClose: () => void;
}

/** 변형 미니 프리뷰 — 종이 위 h1 트리트먼트 + 본문 줄 + 표 얼룩 목업(스킨 색 노출은 콘텐츠 면제). */
function VariantPreview({ v }: { v: DocSkinVariant }) {
  const { vars, h1 } = v;
  const h1Style: React.CSSProperties =
    h1 === 'underline' || h1 === 'center'
      ? { borderBottom: `2px solid ${vars.accent}`, background: 'transparent', margin: h1 === 'center' ? '0 14%' : '0 30% 0 0' }
      : { background: vars.h1bg, borderLeft: h1 === 'band' ? `3px solid ${vars.accent}` : undefined, borderRadius: 3 };
  return (
    <span className="block overflow-hidden rounded-[4px] border p-[6px]" style={{ background: vars.paper, borderColor: vars.line }} aria-hidden>
      <span className="block h-3" style={h1Style} />
      <span className="mt-[4px] block h-1.5 w-4/5 rounded-[1px]" style={{ background: vars.line }} />
      <span className="mt-[3px] grid grid-cols-3 gap-[2px]">
        <span className="col-span-3 block h-1.5" style={{ background: vars.thbg }} />
        <span className="col-span-3 block h-1.5" style={{ background: vars.rowTint === 'transparent' ? vars.paper : vars.rowTint }} />
        <span className="col-span-3 block h-1.5" style={{ background: vars.paper }} />
      </span>
      <span className="mt-[3px] block h-1.5 w-2/3 rounded-[1px]" style={{ background: vars.callout }} />
    </span>
  );
}

export function VariantFlyout({ family, activeVariantId, left, onPick, onClose }: Props) {
  const meta = FAMILY_META.find((f) => f.id === family);
  const variants = DOC_SKIN_FAMILIES[family] ?? [];

  // 외부 클릭 닫기 — 캡처 단계(보드류 stopPropagation 을 뚫는 PromptBar 관례) + 허용목록 마커.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-kv-flyout]') || t.closest('[data-kv-flyout-trigger]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-kv-flyout
      role="dialog"
      aria-label={`${meta?.name ?? ''} 스타일 고르기`}
      className="absolute top-t4 z-30 flex max-h-[calc(100%-7rem)] w-72 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-2xl"
      style={{ left }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-t3 py-t2">
        <span className="font-display text-sm font-semibold text-fg">{meta?.name} 스타일 10가지</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-7 w-7 items-center justify-center rounded-pill text-fg-2 hover:bg-surface-2 hover:text-fg"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-t2">
        <div className="flex flex-col gap-t2">
          {variants.map((v) => {
            const on = v.id === activeVariantId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onPick(v)}
                aria-pressed={on}
                className={`rounded-sm border p-t2 text-left transition-colors duration-150 ease-soft ${
                  on ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-accent'
                }`}
              >
                <VariantPreview v={v} />
                <span className="mt-t1 flex items-center gap-t1">
                  <span className="text-xs font-semibold text-fg">{v.name}</span>
                  {v.withImages && (
                    <span className="rounded-sm bg-surface-2 px-[5px] py-[1px] text-[10px] font-semibold text-fg-2" title="주제 그림이 문서에 함께 붙어요">
                      🖼️ 그림 꾸밈
                    </span>
                  )}
                </span>
                <span className="block text-[11px] leading-snug text-fg-muted">{v.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
