/* 편집디자인 뷰어 진입점 — 보드 카드(iframe)가 /play-editor.html 로 로드하는 별도 React 루트.
   앱과 동일한 Milray 토큰(tokens.css) + 편집기 스타일(playrecord.css)을 import 해 브랜드 일치. */

import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import '../playrecord.css';
import { PlayEditorViewerApp } from './PlayEditorViewerApp';

const el = document.getElementById('kv-playedit-root');
if (el) createRoot(el).render(<PlayEditorViewerApp />);
