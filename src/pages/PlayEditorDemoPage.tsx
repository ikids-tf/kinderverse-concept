// "편집디자인" 런처 — 놀이기록 / 놀이중심 주제망 / 놀이계획 주안 버튼.
// 각 버튼은 usePlayEditorStore.openEditor(variant, payload) 로 전역 편집기 모달을 연다.
// (모달은 AppShell 에 마운트됨. 이 버튼들은 나중에 각 기능 카드/화면으로 옮겨 붙일 수 있다.)
import { STARTERS } from '@/playrecord-integration/starters';
import { usePlayEditorStore } from '@/playrecord-integration/store';

export function PlayEditorDemoPage() {
  const openEditor = usePlayEditorStore((s) => s.openEditor);
  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: '#2b2622' }}>편집디자인</h1>
      <p style={{ fontSize: 14, color: '#7c7269', marginBottom: 24 }}>
        아래 버튼을 누르면 편집 캔버스가 모달로 열립니다. 스티커·주제 그림을 추가하고, 요소를 드래그·회전·재생성한 뒤 PNG로 저장하세요.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STARTERS.map((s) => (
          <button
            key={s.key}
            onClick={() => openEditor(s.variant, s.payload)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
              border: '1px solid #e7ded4', background: '#fff', textAlign: 'left',
              fontSize: 16, fontWeight: 600, color: '#2b2622',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <span>{s.label} 편집디자인</span>
            <span style={{ fontSize: 13, color: '#d97757', fontWeight: 700 }}>열기 →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
