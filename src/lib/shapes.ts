/** 별·하트 SVG 패스(24×24 viewBox, preserveAspectRatio=none으로 노드 박스에 맞춤).
    NodeView(도형 카드)와 BoardToolbar(스와치)가 공유 — 컴포넌트 파일에서 분리(HMR). */
export const SHAPE_PATHS: Record<string, string> = {
  star: 'M12 1.8l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.6l-6.2 3.3L7 14 2 9.1l6.9-1z',
  heart:
    'M12 21.4l-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.6z',
};
