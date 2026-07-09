// "편집디자인" 런처 — 놀이기록 / 주제망 / 주안 / 월안 버튼.
// 각 버튼은 편집기를 '보드 카드(iframe)'로 생성한다(모달 아님 — 사용자 지시). spawnEditorCard 가
// 보드 스토어에 노드를 얹은 뒤 /board 로 이동해 그 카드를 보여준다.
import { useNavigate } from 'react-router-dom';
import { STARTERS } from '@/playrecord-integration/starters';
import { spawnEditorCard } from '@/playrecord-integration/spawnEditorCard';

export function PlayEditorDemoPage() {
  const navigate = useNavigate();
  const launch = (variant: string, payload: unknown) => {
    spawnEditorCard(variant, payload); // 보드 스토어에 편집기 카드 노드 추가(전역)
    navigate('/board'); // 보드로 이동 → 방금 만든 카드가 화면 중앙에 뜬다
  };
  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: '#2b2622' }}>편집디자인</h1>
      <p style={{ fontSize: 14, color: '#7c7269', marginBottom: 24 }}>
        아래 버튼을 누르면 편집 캔버스가 <b>보드 카드</b>로 생성됩니다. 스티커·주제 그림을 추가하고, 요소를 드래그·회전·재생성한 뒤 PNG로 저장하세요.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STARTERS.map((s) => (
          <button
            key={s.key}
            onClick={() => launch(s.variant, s.payload)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
              border: '1px solid #e7ded4', background: '#fff', textAlign: 'left',
              fontSize: 16, fontWeight: 600, color: '#2b2622',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <span>{s.label} 편집디자인</span>
            <span style={{ fontSize: 13, color: '#d97757', fontWeight: 700 }}>보드에 열기 →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
