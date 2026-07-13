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
// 집중 편집(?edit=1) — 부모 보드가 kv-embed-fullscreen{edit:true} 를 받아 이 뷰어를 큰
// 오버레이로 다시 연다(NodeView 풀스크린 인프라 재사용). 이 모드에선 문서 옆(문서 밖)에
// 편집 패널이 앉도록 레이아웃을 바꾸고, 상단바는 '완료'(kv-fs-exit)로 닫는다.
const FOCUSED = params.get('edit') === '1';

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

  // 집중 편집(?edit=1)은 별도 iframe 으로 열리므로, 배경 카드 iframe 과 같은 KEY 를 공유한다.
  // 한쪽이 localStorage 를 바꾸면 다른 문서에서 'storage' 이벤트가 뜨므로, 그때 최신 상태를
  // 다시 읽어 두 뷰를 실시간 동기화한다(완료로 닫으면 배경 카드가 이미 최신). 값이 같으면
  // 무시해 두 iframe 간 저장→이벤트 무한 반사를 막는다.
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue == null) return;
      if (e.newValue === JSON.stringify(stateRef.current)) return;
      try {
        setState(JSON.parse(e.newValue) as EditState);
      } catch {
        /* 손상된 값 무시 */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
    <div className={`pe-embed${FOCUSED ? ' pe-focus' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#faf8f5' }}>
      {FOCUSED ? (
        // 집중 편집 헤더 — 드래그/삭제 없이 '완료'로 오버레이를 닫는다(kv-fs-exit).
        <div
          style={{
            flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', userSelect: 'none',
            borderBottom: '1px solid #e7ded4', background: '#f3ece3',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: '#2b2622' }}>편집디자인</span>
          <span style={{ fontSize: 11, color: '#a99e90' }}>· 집중 편집</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => postParent({ type: 'kv-fs-exit' })}
            title="편집 완료 — 보드로 돌아가기"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              padding: '6px 16px', fontSize: 12, fontWeight: 700, color: '#fff',
              background: 'var(--accent, #f2733e)', border: 'none', borderRadius: 999,
            }}
          >
            완료
          </button>
        </div>
      ) : (
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
          <div style={{ flex: 1 }} />
          {/* 크게 편집 — 부모 보드가 kv-embed-fullscreen{edit:true} 를 받아 큰 오버레이(?edit=1)로 연다. */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => postParent({ type: 'kv-embed-fullscreen', edit: true })}
            title="크게 편집 — 넓은 화면에서 문서 옆에 편집 도구를 연다"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#2b2622',
              background: '#fff', border: '1px solid #e7ded4', borderRadius: 999,
            }}
          >
            ⛶ 크게 편집
          </button>
          {/* 이 편집기 카드를 보드에서 삭제 — 드래그와 겹치지 않게 pointerDown 전파 차단, 확인 후 부모에 삭제 요청. */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (window.confirm('이 편집디자인 카드를 삭제할까요? (보드에서 ⌘Z로 되돌릴 수 있어요)')) {
                postParent({ type: 'kv-embed-delete' });
              }
            }}
            title="이 편집기 카드 삭제"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#b23b3b',
              background: '#fff', border: '1px solid #e7ded4', borderRadius: 999,
            }}
          >
            🗑 삭제
          </button>
        </div>
      )}
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
