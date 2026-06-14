/* 슬라이드 뷰어 진입점 — 보드 카드(iframe) 또는 풀스크린 오버레이가 로드하는 별도 React 루트.
   같은 Milray 토큰(fonts + CSS 변수)을 앱과 동일하게 import해 복제 없이 브랜드 일치. */

import { createRoot } from 'react-dom/client';
import '../../../styles/tokens.css';
import '../engine/themes.css';
import '../engine/slides.css';
import { SlidesViewerApp } from './SlidesViewerApp';

const el = document.getElementById('kv-slides-root');
if (el) createRoot(el).render(<SlidesViewerApp />);
