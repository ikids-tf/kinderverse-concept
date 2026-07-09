/* 편집디자인 뷰어 — 보드 카드(iframe)로 임베드되는 PlayRecordEditor 래퍼.
   슬라이드 뷰어와 동일한 계약을 따른다:
     · ?id= 로 인스턴스 분리, 데이터는 localStorage(kv-playedit-<id>)에 저장/복원.
     · 상단 드래그 바 = 카드 이동(kv-embed-drag 를 부모 보드로 postMessage).
   호스트(스폰 함수)가 먼저 localStorage 에 { variant, payload } 를 써두면 여기서 읽어 편집기를 연다.
   편집 결과(docs/page/변형)는 그대로 localStorage 에 다시 저장 → 새로고침·보드 저장에도 유지. */

import { useEffect, useRef, useState } from 'react';
import { PlayRecordEditor } from '../index';

const params = new URLSearchParams(window.location.search);
const ID = params.get('id') || 'default';
const KEY = `kv-playedit-${ID}`;

interface EditState {
  variant: string;
  payload: unknown;
  docs?: Record<string, unknown>;
  docsVersion?: number;
  page?: number;
  title?: string;
}

function load(): EditState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as EditState;
  } catch {
    /* ignore */
  }
  return { variant: 'summer-story', payload: null, docs: {}, page: 0 };
}

function postParent(msg: unknown): void {
  if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
}

export function PlayEditorViewerApp() {
  const [state, setState] = useState<EditState>(load);

  // 편집 상태가 바뀔 때마다 localStorage 에 저장(디바운스 없이 즉시 — 편집기가 patch 단위로 호출).
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota — 큰 data-URI 이미지가 많으면 실패할 수 있음(다음 편집에서 재시도) */
    }
  }, [state]);

  // 상단 드래그 바 → 카드 이동(부모 보드가 kv-embed-drag 를 받아 노드를 옮긴다 — 슬라이드와 동일).
  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    postParent({ type: 'kv-embed-drag', phase: 'start', sx: e.screenX, sy: e.screenY });
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) postParent({ type: 'kv-embed-drag', phase: 'move', sx: e.screenX, sy: e.screenY });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    postParent({ type: 'kv-embed-drag', phase: 'end' });
  };

  // PNG 저장 — 편집기 하단 ↓ 버튼이 onExportImage(dataUrl, meta) 로 호출.
  const onExportImage = (dataUrl: string, meta: { fileName?: string }) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = (meta?.fileName || '편집디자인') + '.png';
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#faf8f5' }}>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', cursor: 'move', touchAction: 'none', userSelect: 'none',
          borderBottom: '1px solid #e7ded4', background: '#f3ece3',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#2b2622' }}>편집디자인</span>
        <span style={{ fontSize: 11, color: '#a99e90' }}>· 이 바를 잡고 드래그로 이동</span>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 12 }}>
        <PlayRecordEditor
          value={state}
          selected
          zoom={1}
          onChange={(patch: Partial<EditState>) => setState((s) => ({ ...s, ...patch }))}
          onExportImage={onExportImage}
        />
      </div>
    </div>
  );
}
