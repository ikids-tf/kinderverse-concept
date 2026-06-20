/**
 * ImageHoverActions.tsx — 게임 이미지에 호버하면 뜨는 교사용 액션(편집·다운로드·풀스크린).
 * ------------------------------------------------------------------
 * 마이보드의 이미지 카드 호버 액션과 동일한 모양/기능 — 같은 컴포넌트를 그대로 재사용한다:
 *   · 편집  → @/components/board/ImageEditorModal (배경 제거·요소 지우기·다운로드, 같은 페이지)
 *   · 풀스크린 → @/components/board/ImageFullscreen (크게 보기, 같은 뷰어)
 *   · 다운로드 → PNG로 저장
 * 버튼 스타일은 마이보드와 동일한 Tailwind 유틸리티(교사 크롬 = Milray; chrome.css가 공급).
 * 편집 결과 적용: assetKey가 있으면 그 생성 자산을 스왑(생성 경로와 동일), 없으면 노드 콘텐츠 교체.
 * ※ 객체 분리(보드에 새 노드 추가)는 게임 자산에 해당 없음 → allowExtract:false로 숨긴다.
 */
import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/lib/icons";
import { ImageFullscreen } from "@/components/board/ImageFullscreen";
import { ImageEditorModal } from "@/components/board/ImageEditorModal";
import type { OriginRect } from "@/components/board/useZoomModal";
import { useAssetStore } from "./assetStore";
import { useGame } from "./useGame";

export function ImageHoverActions({ src, caption, assetKey, nodeId, roundIdx }: {
  src: string;
  caption: string;
  assetKey?: string;
  nodeId?: string;
  roundIdx?: number;
}) {
  const [edit, setEdit] = useState<OriginRect | null>(null);
  const [fs, setFs] = useState<OriginRect | null>(null);

  // 풀스크린/편집이 '그 카드 위치'에서 커지도록 노드의 화면 사각형을 origin으로 잡는다.
  const rectOf = (el: HTMLElement): OriginRect => {
    const node = (el.closest(".node") as HTMLElement | null) ?? el;
    const r = node.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  // 편집 적용 — 생성 자산(assetKey)이면 그 자산 url을 스왑(생성과 동일 경로, 모든 사용처 갱신).
  // 없으면 고유 키로 이 노드의 콘텐츠만 교체(페이지 간 충돌 방지 — nodeContent.ts 규칙).
  const onApplyEdited = (url: string) => {
    if (assetKey) {
      useAssetStore.setState((s) => ({ map: { ...s.map, [assetKey]: { status: "ready", url } } }));
    } else if (nodeId) {
      const key = `__kv_edit_${nodeId}_${url.length}__`;
      useAssetStore.setState((s) => ({ map: { ...s.map, [key]: { status: "ready", url } } }));
      useGame.getState().setNodeContent(
        nodeId,
        { type: "asset", asset: { assetId: key, kind: "generated", variant: "full", cutout: "none", styleLock: false } },
        roundIdx,
      );
    }
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = `${(caption || "kinderverse").replace(/[\\/:*?"<>|]/g, "_")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // 마이보드와 동일한 버튼 스타일(36px 흰 카드 + 호버 코랄).
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-fg-2 shadow-sm transition-colors duration-150 ease-soft hover:border-accent hover:text-accent";

  return (
    <>
      <div
        className="kv-img-actions"
        style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4, zIndex: 6 } as CSSProperties}
      >
        <button
          type="button"
          className={`${btn} hover:bg-accent hover:text-on-accent`}
          title="이미지 편집 (배경 제거·요소 지우기·다운로드)"
          aria-label="이미지 편집"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setEdit(rectOf(e.currentTarget)); }}
        >
          <Icon name="edit" size={15} />
        </button>
        <button
          type="button"
          className={btn}
          title="다운로드"
          aria-label="다운로드"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); download(); }}
        >
          <Icon name="download" size={14} />
        </button>
        <button
          type="button"
          className={btn}
          title="크게 보기 (풀스크린)"
          aria-label="크게 보기"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setFs(rectOf(e.currentTarget)); }}
        >
          <Icon name="present" size={14} />
        </button>
      </div>
      {edit && createPortal(
        <ImageEditorModal
          target={{ src, caption, allowExtract: false, onApply: onApplyEdited }}
          origin={edit}
          onClose={() => setEdit(null)}
        />,
        document.body,
      )}
      {fs && createPortal(
        <ImageFullscreen src={src} caption={caption} origin={fs} onClose={() => setFs(null)} />,
        document.body,
      )}
    </>
  );
}
