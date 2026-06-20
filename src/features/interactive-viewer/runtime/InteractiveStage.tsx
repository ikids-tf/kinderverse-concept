/**
 * 인터렉티브 노드 런타임 — 논리 캔버스를 등비로 렌더하고, 편집(선택·이동·드롭)과
 * 재생(탭→반응/교체)을 한 컴포넌트가 담당. 보드 카드 미리보기·풀스크린·수업 모드
 * 어댑터가 모두 이 컴포넌트를 공유한다(단일 런타임).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRef, ElementNode, InteractiveNode } from '../schema/interactiveNode';
import { useStageFit } from './useStageFit';
import { cancelAnimations, runAnimate } from './behaviors';
import './inode.css';

const COLOR_TOKENS: Record<string, string> = {
  'pastel.cream': 'var(--ic-cream)',
  'pastel.coral': 'var(--ic-coral)',
  'pastel.mint': 'var(--ic-mint)',
  'pastel.sky': 'var(--ic-sky)',
  'pastel.peach': 'var(--ic-bg-peach)',
};

function isAssetRef(bg: InteractiveNode['canvas']['background']): bg is AssetRef {
  return typeof bg === 'object' && bg !== null && 'src' in bg;
}
function bgColor(c: string): string {
  return COLOR_TOKENS[c] ?? c;
}

interface Props {
  doc: InteractiveNode;
  mode: 'play' | 'edit';
  selectedElId?: string | null;
  onSelectEl?: (id: string | null) => void;
  onMoveElement?: (elId: string, x: number, y: number) => void;
  onDropFiles?: (files: File[], at: { x: number; y: number }) => void;
  /** play 리셋/모드 전환 시 애니메이션·교체 상태 원복. */
  resetNonce?: number;
  /** 미리보기 — 상호작용 차단(보드 카드 썸네일). */
  preview?: boolean;
}

export function InteractiveStage({
  doc,
  mode,
  selectedElId = null,
  onSelectEl,
  onMoveElement,
  onDropFiles,
  resetNonce = 0,
  preview = false,
}: Props) {
  const cw = doc.canvas.size.w;
  const ch = doc.canvas.size.h;
  const { ref: stageBoxRef, scale, box } = useStageFit(cw, ch, preview ? 6 : 24);
  // 캔버스는 좌상단 고정(justify/align-self start, origin top-left) → 스케일이 무대 밖으로
  // 수축되지 않게. 무대 안에서 가운데로 오도록 translate를 직접 계산해 적용(거대 박스를
  // grid가 중앙정렬 못 하는 문제 회피).
  const tx = Math.max(0, (box.w - cw * scale) / 2);
  const ty = Math.max(0, (box.h - ch * scale) / 2);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragInfo = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; sc: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});
  const [dropping, setDropping] = useState(false);

  const sorted = useMemo(() => [...doc.elements].sort((a, b) => a.transform.z - b.transform.z), [doc.elements]);

  useEffect(() => {
    if (rootRef.current) cancelAnimations(rootRef.current);
    setSwapped({});
  }, [resetNonce, mode]);

  const tapBehavior = useCallback(
    (elId: string) => doc.behaviors.find((b) => b.target === elId && b.trigger === 'tap'),
    [doc.behaviors],
  );

  // ── 편집: 요소 드래그(스크린 델타 ÷ scale = 논리 델타) ──
  const onWinMove = useCallback((e: PointerEvent) => {
    const d = dragInfo.current;
    if (!d) return;
    setDrag({ id: d.id, x: Math.round(d.ox + (e.clientX - d.sx) / d.sc), y: Math.round(d.oy + (e.clientY - d.sy) / d.sc) });
  }, []);
  const onWinUp = useCallback(() => {
    const d = dragInfo.current;
    window.removeEventListener('pointermove', onWinMove);
    window.removeEventListener('pointerup', onWinUp);
    dragInfo.current = null;
    setDrag((cur) => {
      if (cur && d && (cur.x !== d.ox || cur.y !== d.oy)) onMoveElement?.(cur.id, cur.x, cur.y);
      return null;
    });
  }, [onMoveElement, onWinMove]);
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
    },
    [onWinMove, onWinUp],
  );

  const onElPointerDown = (e: React.PointerEvent, el: ElementNode) => {
    if (preview || mode !== 'edit') return;
    e.stopPropagation();
    onSelectEl?.(el.id);
    dragInfo.current = { id: el.id, sx: e.clientX, sy: e.clientY, ox: el.transform.x, oy: el.transform.y, sc: scale };
    setDrag({ id: el.id, x: el.transform.x, y: el.transform.y });
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
  };

  const onElClick = (e: React.MouseEvent, el: ElementNode) => {
    if (preview || mode !== 'play') return;
    const beh = tapBehavior(el.id);
    if (!beh) return;
    e.stopPropagation();
    if (beh.action === 'animate') {
      const inner = innerRefs.current[el.id];
      if (inner) runAnimate(inner, beh.params.preset, beh.params.repeat);
    } else if (beh.action === 'swap') {
      setSwapped((s) => ({ ...s, [el.id]: !s[el.id] }));
    }
  };

  const onCanvasPointerDown = () => {
    if (!preview && mode === 'edit') onSelectEl?.(null);
  };

  // ── 외부 파일 드롭 ──
  const onDragOver = (e: React.DragEvent) => {
    if (preview || mode !== 'edit' || !onDropFiles) return;
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    setDropping(false);
    if (preview || mode !== 'edit' || !onDropFiles) return;
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const at = rect
      ? { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
      : { x: cw / 2, y: ch / 2 };
    onDropFiles(files, at);
  };

  const displaySrc = (el: ElementNode): string | undefined => {
    if (swapped[el.id]) {
      const beh = doc.behaviors.find((b) => b.target === el.id && b.action === 'swap');
      if (beh && beh.action === 'swap') return beh.params.to.src;
    }
    return el.src?.src;
  };

  const renderContent = (el: ElementNode) => {
    if (el.kind === 'text') {
      const fontPx = Math.max(14, Math.min(el.transform.h * 0.5, el.transform.w * 0.22));
      return (
        <div className="ic-text" style={{ fontSize: fontPx }}>
          {el.text}
        </div>
      );
    }
    if (el.kind === 'shape') return <div className="ic-shape" />;
    const src = displaySrc(el);
    if (!src) return null;
    const swapBeh = doc.behaviors.find((b) => b.target === el.id && b.action === 'swap');
    const asVideo = el.kind === 'video' || (!!swapped[el.id] && swapBeh?.action === 'swap' && swapBeh.params.mode === 'video');
    if (asVideo) {
      return <video src={src} playsInline controls={mode === 'play' && !preview} autoPlay={mode === 'play' && !preview} muted />;
    }
    return <img src={src} alt={el.text ?? ''} draggable={false} />;
  };

  return (
    <div
      ref={rootRef}
      className={`kv-inode${dropping ? ' is-dropping' : ''}`}
      data-mode={mode}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <div ref={stageBoxRef} className="ic-stage">
        <div
          ref={canvasRef}
          className="ic-canvas"
          onPointerDown={onCanvasPointerDown}
          style={{
            width: cw,
            height: ch,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            background: isAssetRef(doc.canvas.background) ? undefined : bgColor(doc.canvas.background),
          }}
        >
          {isAssetRef(doc.canvas.background) && <img className="ic-canvas-bg" src={doc.canvas.background.src} alt="" />}
          {sorted.length === 0 && mode === 'edit' && !preview && (
            <div className="ic-empty">자료를 끌어다 놓거나 위 도구로 추가하세요</div>
          )}
          {sorted.map((el) => {
            const pos = drag && drag.id === el.id ? drag : el.transform;
            const playable = mode === 'play' && !preview && !!tapBehavior(el.id);
            const cls = ['ic-el'];
            if (!preview && mode === 'edit' && selectedElId === el.id) cls.push('is-selected');
            if (playable) cls.push('is-playable');
            return (
              <div
                key={el.id}
                className={cls.join(' ')}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: el.transform.w,
                  height: el.transform.h,
                  transform: el.transform.rotation ? `rotate(${el.transform.rotation}deg)` : undefined,
                  zIndex: el.transform.z,
                }}
                onPointerDown={(e) => onElPointerDown(e, el)}
                onClick={(e) => onElClick(e, el)}
              >
                <div
                  className="ic-el-inner"
                  ref={(n) => {
                    innerRefs.current[el.id] = n;
                  }}
                  style={{ width: '100%', height: '100%' }}
                >
                  {renderContent(el)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
