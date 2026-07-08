// 전역 편집기 — usePlayEditorStore 로 열리며 PlayRecordEditor(이식한 편집 캔버스)를 띄운다.
// 모달(전체화면 백드롭) 대신 "보드 위에 뜨는" 플로팅 패널: 백드롭 없이 보드가 뒤로 보이고,
// 헤더를 잡아 드래그로 옮길 수 있다. AppShell 에 한 번 마운트, 어느 "편집디자인" 버튼이든 openEditor(variant, payload).
import { useRef, useState } from 'react';
import { PlayRecordEditor } from '@/playrecord';
import { usePlayEditorStore } from './store';

export function PlayEditorModal() {
  const open = usePlayEditorStore((s) => s.open);
  const variant = usePlayEditorStore((s) => s.variant);
  const payload = usePlayEditorStore((s) => s.payload);
  const close = usePlayEditorStore((s) => s.close);
  if (!open) return null;
  // variant 를 key 로 → 다른 기능으로 다시 열면 편집기 상태가 새로 초기화된다.
  return <FloatingEditor key={variant} variant={variant} payload={payload} onClose={close} />;
}

function FloatingEditor({ variant, payload, onClose }: { variant: string; payload: unknown; onClose: () => void }) {
  const [state, setState] = useState<any>({ payload, variant, docs: {}, page: 0 });
  // 보드 위 플로팅 위치(드래그로 이동). 초기값: 좌상단에서 살짝 안쪽.
  const [pos, setPos] = useState({ x: 96, y: 84 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onHeaderDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onHeaderMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  };
  const onHeaderUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  return (
    // 백드롭 없음 → 보드가 뒤로 보이고 클릭도 통과. 패널만 pointerEvents 활성.
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          pointerEvents: 'auto',
          background: '#faf8f5',
          borderRadius: 16,
          padding: '14px 18px 16px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.30)',
          border: '1px solid #e7ded4',
          maxWidth: '96vw',
          maxHeight: '92vh',
          overflow: 'auto',
        }}
      >
        <div
          onPointerDown={onHeaderDown}
          onPointerMove={onHeaderMove}
          onPointerUp={onHeaderUp}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, cursor: 'move', touchAction: 'none', userSelect: 'none' }}
        >
          <strong style={{ fontSize: 15, color: '#2b2622' }}>편집디자인 <span style={{ fontSize: 12, color: '#a99e90', fontWeight: 400 }}>· 드래그로 이동</span></strong>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            style={{ border: '1px solid #ddd', background: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: '#333' }}
          >
            닫기 ✕
          </button>
        </div>
        {/* 편집기 500×707 카드 + 오른쪽 편집툴 패널(.dpanel) 공간 확보 */}
        <div style={{ position: 'relative', width: 500, height: 707, marginRight: 260 }}>
          <PlayRecordEditor
            value={state}
            selected
            zoom={1}
            onChange={(patch: any) => setState((s: any) => ({ ...s, ...patch }))}
            onExportImage={(_url: string, meta: any) => console.log('저장(PNG 다운로드)', meta)}
          />
        </div>
        <p style={{ fontSize: 12, color: '#8a7d6d', marginTop: 8 }}>
          상단 <b>↓</b> 버튼으로 PNG 저장(다운로드). 오른쪽에서 스티커·주제 그림을 추가하고, 요소를 드래그·회전·재생성할 수 있어요.
        </p>
      </div>
    </div>
  );
}
