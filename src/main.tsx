import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// DEV 전용 성능 측정 도구(시드 + FPS 오버레이). 프로덕션 빌드에서는
// import.meta.env.DEV가 false로 치환되어 통째로 트리셰이킹된다. (Phase 1)
if (import.meta.env.DEV) {
  void import('./dev/perfTools');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
