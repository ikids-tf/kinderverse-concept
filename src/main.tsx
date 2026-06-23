import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initBoardPersistence } from './board/persist';
import { initCloudSync } from './lib/cloudSync';
import { installLocalStorageMirror } from './lib/cloudMirror';
import './index.css';

// 시작 순서가 중요하다:
//  1) initCloudSync(): 클라우드(공유 공간) → 로컬(localStorage/IndexedDB)로 자료를 먼저 맞춘다.
//     자격증명(.env)이 없으면 즉시 통과 → 기존 '로컬 전용'과 동일.
//  2) initBoardPersistence(): 그 로컬(클라우드로 채워진)에서 보드를 복원 + 변경 미러 시작.
//  3) App을 '동기화 이후' 동적 임포트 → 스토어들의 모듈-로드 하이드레이션(folderStore 등)이
//     클라우드로 채워진 로컬 값을 읽게 한다(다른 기기와 같은 자료가 첫 렌더부터 보이도록).
void (async () => {
  installLocalStorageMirror(); // 이후 모든 localStorage 쓰기를 클라우드로 미러(앱 로드 전 설치)
  await initCloudSync();
  initBoardPersistence();

  if (import.meta.env.DEV) {
    void import('./dev/perfTools');
    void import('./dev/intentGolden');
  }

  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
