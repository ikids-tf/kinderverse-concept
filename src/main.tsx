import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initBoardPersistence } from './board/persist';
import './index.css';

// Restore persisted boards + start mirroring to localStorage BEFORE the app mounts
// so a refresh brings the boards back (성능작업 2-4). Must run before render so a
// restored activeId is in place ahead of MyBoardPage's "ensure one board" effect.
initBoardPersistence();

// DEV 전용 도구: 성능 측정(시드+FPS) · 의도 골든셋 평가(__kvIntentEval).
// 프로덕션 빌드에서는 import.meta.env.DEV가 false로 치환되어 트리셰이킹된다.
if (import.meta.env.DEV) {
  void import('./dev/perfTools');
  void import('./dev/intentGolden');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
