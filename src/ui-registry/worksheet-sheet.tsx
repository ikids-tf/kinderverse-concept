/* 활동지 A4 시트(화면) — 생성된 그림(활동 영역) 위에 제목·안내문을 또렷한 텍스트
   레이어로 덧입힌다. 글자는 이미지에 굽지 않으므로 언제나 정확하고 선명하다
   (이미지 모델 한글 깨짐 회피). 다운로드/인쇄용 A4 PNG 합성은 worksheet-a4.ts —
   같은 "시트 너비 비율" 상수를 공유해 화면과 인쇄물이 일치한다. */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { WorksheetCardProps, WorksheetLayer } from './contracts';
import { SHEET_TITLE_PCT, SHEET_INSTR_PCT } from './worksheet-a4';

/** 인라인 편집 가능한 텍스트(contentEditable) — 보드에서 교사가 제목·안내를 직접 고친다.
   글자는 이미지가 아니라 실제 텍스트라 언제든 수정·인쇄에 반영된다. */
function EditableText({
  value,
  editable,
  onCommit,
  className,
  placeholder,
  style,
}: {
  value: string;
  editable: boolean;
  onCommit?: (v: string) => void;
  className: string;
  placeholder?: string;
  style?: CSSProperties;
}) {
  if (!editable) return <span className={className} style={style}>{value || placeholder}</span>;
  return (
    <span
      role="textbox"
      tabIndex={0}
      style={style}
      contentEditable
      suppressContentEditableWarning
      data-kv-editable="true"
      spellCheck={false}
      title="클릭해 수정"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? '').trim();
        if (next !== value) onCommit?.(next);
      }}
      className={`${className} cursor-text rounded outline-none focus:bg-accent-soft/60 hover:bg-accent-soft/30`}
    >
      {value}
    </span>
  );
}

/** 분리된 한 요소 레이어 — 드래그로 이동, 우하단 핸들로 스케일, ×로 삭제.
   위치/크기는 시트 대비 %라 화면·다운로드가 동일 좌표계를 공유한다. */
function LayerPiece({
  layer,
  containerRef,
  onChange,
  onRemove,
}: {
  layer: WorksheetLayer;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onChange: (next: WorksheetLayer) => void;
  onRemove: () => void;
}) {
  // 드래그/스케일 중간 상태(포인터 단위 px) → 제스처 끝에서 onChange로 커밋.
  const drag = useRef<null | { mode: 'move' | 'scale'; px: number; py: number; lx: number; ly: number; ls: number }>(null);
  const [live, setLive] = useState(layer);
  useEffect(() => setLive(layer), [layer]);

  const begin = (mode: 'move' | 'scale') => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { mode, px: e.clientX, py: e.clientY, lx: live.x, ly: live.y, ls: live.scale };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* 비활성 포인터(테스트 등)에서 capture 실패해도 드래그는 진행 */
    }
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    e.stopPropagation();
    if (d.mode === 'move') {
      const nx = d.lx + ((e.clientX - d.px) / rect.width) * 100;
      const ny = d.ly + ((e.clientY - d.py) / rect.height) * 100;
      setLive((l) => ({ ...l, x: nx, y: ny }));
    } else {
      const basePx = (live.w / 100) * rect.width || 1;
      const ns = Math.max(0.3, Math.min(3, d.ls + (e.clientX - d.px) / basePx));
      setLive((l) => ({ ...l, scale: ns }));
    }
  };
  const end = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    onChange(live);
  };

  return (
    <div
      className="group/layer absolute cursor-move ring-1 ring-transparent transition-shadow hover:z-10 hover:ring-1 hover:ring-accent/60 hover:shadow-lg"
      style={{ left: `${live.x}%`, top: `${live.y}%`, width: `${live.w * live.scale}%`, height: `${live.h * live.scale}%` }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      title={`${live.label} — 드래그로 이동, 모서리로 크기 조절`}
    >
      <img src={live.src} alt={live.label} draggable={false} className="pointer-events-none h-full w-full select-none object-fill" />
      {/* 삭제 */}
      <button
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-fg text-[11px] leading-none text-on-dark shadow group-hover/layer:flex"
        title="레이어 삭제"
      >
        ×
      </button>
      {/* 스케일 핸들(우하단) */}
      <span
        onPointerDown={begin('scale')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute -bottom-1.5 -right-1.5 hidden h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-accent bg-surface shadow group-hover/layer:block"
      />
    </div>
  );
}

/** 화면 표시용 A4 시트 — 제목/안내 텍스트 레이어 + 활동 그림.
   editable=true면 제목·안내를 인라인으로 수정할 수 있다(보드용).
   layers가 주어지면 그림 대신 흰 바탕 위에 분리된 요소들을 이동·스케일 가능하게 렌더. */
export function WorksheetSheet({
  props,
  className = '',
  editable = false,
  onEdit,
  layers,
  onLayersChange,
}: {
  props: WorksheetCardProps;
  className?: string;
  editable?: boolean;
  onEdit?: (patch: Partial<WorksheetCardProps>) => void;
  layers?: WorksheetLayer[];
  onLayersChange?: (next: WorksheetLayer[]) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const layerMode = !!layers; // 레이어 분리 켜짐 → 흰 바탕 + 조각들
  const updateLayer = (next: WorksheetLayer) =>
    onLayersChange?.((layers ?? []).map((l) => (l.id === next.id ? next : l)));
  const removeLayer = (id: string) => onLayersChange?.((layers ?? []).filter((l) => l.id !== id));
  return (
    <div
      ref={sheetRef}
      className={`relative w-full overflow-hidden bg-white ${className}`}
      // container-type: 텍스트를 시트 "너비" 비례(cqw)로 키워 화면·다운로드 크기를 일치시킨다.
      style={{ aspectRatio: '210 / 297', containerType: 'inline-size' }}
    >
      {/* 활동 그림 — 레이어 분리 시엔 흰 바탕(조각들이 그림을 재구성), 평소엔 원본 그림. */}
      {layerMode ? (
        <div className="absolute inset-0 bg-white" />
      ) : props.image_url ? (
        <img src={props.image_url} alt={props.title} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-fg-disabled">활동 그림 생성 중…</div>
      )}
      {layerMode &&
        layers!.map((l) => (
          <LayerPiece
            key={l.id}
            layer={l}
            containerRef={sheetRef}
            onChange={updateLayer}
            onRemove={() => removeLayer(l.id)}
          />
        ))}
      {/* 제목·안내 텍스트 레이어 — 그림 상단(비워 둔 자리)에 또렷하게 오버레이.
          글자 크기는 시트 너비(cqw)에 비례 → 다운로드 PNG와 동일한 비율(SHEET_TITLE_PCT 등). */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center px-[7%] pt-[3.5%]">
        <EditableText
          value={props.title}
          editable={editable}
          onCommit={(v) => onEdit?.({ title: v || props.title })}
          placeholder="제목"
          className="block break-keep text-center font-extrabold leading-tight text-accent [text-shadow:0_1px_10px_rgba(255,255,255,0.95),0_0_3px_rgba(255,255,255,0.95)]"
          style={{ fontSize: `${SHEET_TITLE_PCT}cqw` }}
        />
        {(props.instruction || editable) && (
          <EditableText
            value={props.instruction ?? ''}
            editable={editable}
            onCommit={(v) => onEdit?.({ instruction: v })}
            placeholder="활동 안내문"
            className="mt-[1cqw] block max-w-full rounded-pill bg-accent-soft/95 px-t3 py-0.5 text-center leading-snug text-fg-2 shadow-sm"
            style={{ fontSize: `${SHEET_INSTR_PCT}cqw` }}
          />
        )}
      </div>
    </div>
  );
}
