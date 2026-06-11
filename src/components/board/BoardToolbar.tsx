import { useState } from 'react';
import { Icon, type IconName } from '@/lib/icons';
import { useBoardStore, type BoardNode, type NodeType } from '@/store/boardStore';
import { SHAPE_PATHS } from './NodeView';
import {
  addNodeCmd,
  addFrameCmd,
  addPresetNodeCmd,
  wrapSelectionInFrameCmd,
  toggleLockCmd,
  type PrimitiveType,
} from '@/board/commands';
import { autoTitleFrame } from '@/board/workflow';

/* Left vertical board toolbar (SKILL §6, PRD §4.3). Select + primitive adders +
   (bottom) lock/home. Every tool has a button path (no keyboard required).
   각 요소 버튼을 호버하면 오른쪽에 스타일 프리셋 플라이아웃이 열린다 — 스와치는
   실제 결과 모양 그대로(텍스트 위계 '가', 버튼/박스 미니어처, 포스트잇/괘선 노트,
   비율 박스, 도형 실루엣, A4 비율 틀)라 한눈에 알 수 있다. */

function viewCenterWorld() {
  const { zoom, panX, panY } = useBoardStore.getState().viewport;
  // approx canvas origin: left rail(68) + toolbar(56)
  const cx = (window.innerWidth - 124) / 2;
  const cy = (window.innerHeight - 120) / 2;
  return { x: (cx - panX) / zoom, y: (cy - panY) / zoom };
}

type ToolId = PrimitiveType | 'frame' | 'video';

const TOOLS: Array<{ id: ToolId; icon: IconName; label: string }> = [
  { id: 'text', icon: 'writing', label: '텍스트' },
  { id: 'sticky', icon: 'record', label: '메모' },
  { id: 'image', icon: 'gallery', label: '이미지' },
  { id: 'video', icon: 'video', label: '동영상' },
  { id: 'shape', icon: 'board', label: '도형' },
  { id: 'frame', icon: 'frame', label: '프레임' },
];

/** 동영상 플레이어 임베드 카드 — 툴바 동영상 버튼과 플라이아웃이 함께 쓴다. */
const VIDEO_PLAYER_PATCH: Partial<BoardNode> = {
  w: 640,
  h: 420,
  autoH: false,
  text: '동영상 플레이어',
  data: { embed: '/video-player.html', title: '동영상 플레이어' },
};

interface PresetItem {
  id: string;
  label: string;
  desc: string;
  patch: Partial<BoardNode>;
  swatch: React.ReactNode;
  /** 패널의 기본 타입 대신 다른 노드 타입으로 생성(예: 프레임 패널의 GLB 뷰어 카드). */
  nodeType?: NodeType;
}
interface PresetSection {
  label?: string;
  items: PresetItem[];
}

/* ---- 직관적 미니 스와치 ---- */

/** 이미지/프레임 비율 박스 — 실제 가로·세로 비율 그대로 축소(px 단위 박스). */
const ratioBox = (w: number, h: number, dashed = false) => (
  <span
    className={`flex items-center justify-center rounded-[3px] border ${
      dashed ? 'border-dashed border-fg-muted' : 'border-border-strong bg-surface-2'
    }`}
    style={{ width: w, height: h }}
  >
    {!dashed && <Icon name="gallery" size={Math.min(w, h) - 6} className="text-fg-muted" />}
  </span>
);

/** 도형 실루엣(별·하트는 NodeView와 같은 패스 공유). */
const shapeSvg = (kind: 'star' | 'heart', colorCls: string) => (
  <svg viewBox="0 0 24 24" width={19} height={19} className={colorCls} aria-hidden>
    <path d={SHAPE_PATHS[kind]} fill="currentColor" />
  </svg>
);

const PRESET_PANELS: Record<ToolId, { title: string; sections: PresetSection[] }> = {
  text: {
    title: '텍스트',
    sections: [
      {
        items: [
          {
            id: 'title', label: '제목', desc: '주제·구역 제목 (코랄 밑줄)',
            patch: { text: '제목', data: { role: 'header' } },
            swatch: <span className="font-display text-base font-semibold leading-none text-fg">가</span>,
          },
          {
            id: 'body', label: '본문', desc: '기본 텍스트',
            patch: { text: '텍스트' },
            swatch: <span className="font-display text-sm leading-none text-fg">가</span>,
          },
          {
            id: 'label', label: '라벨', desc: '이름표·사진 설명 작은 글씨',
            patch: { text: '라벨', data: { fontSize: 'sm' } },
            swatch: <span className="font-sans text-[10px] leading-none text-fg-2">가</span>,
          },
        ],
      },
      {
        label: '배경 스타일',
        items: [
          {
            id: 'button', label: '버튼', desc: '코랄 배경 라벨 (구역 이름표)',
            patch: { text: '버튼', data: { box: 'button' } },
            swatch: <span className="rounded-pill bg-accent px-t2 py-0.5 text-[9px] font-semibold leading-none text-on-accent">가나</span>,
          },
          {
            id: 'boxRect', label: '사각 박스', desc: '테두리 사각 텍스트 박스',
            patch: { text: '텍스트', data: { box: 'rect' } },
            swatch: <span className="rounded-sm border border-border bg-surface px-t2 py-0.5 text-[9px] leading-none text-fg shadow-sm">가나</span>,
          },
          {
            id: 'boxRound', label: '원형 박스', desc: '둥근 알약형 텍스트 박스',
            patch: { text: '텍스트', data: { box: 'round' } },
            swatch: <span className="rounded-pill border border-border bg-surface px-t2 py-0.5 text-[9px] leading-none text-fg">가나</span>,
          },
        ],
      },
    ],
  },
  sticky: {
    title: '메모',
    sections: [
      {
        items: [
          {
            id: 'postit', label: '포스트잇', desc: '붙임 쪽지 — 빠른 메모',
            patch: { color: 'gold' },
            swatch: (
              <span
                className="block h-5 w-5 rounded-sm bg-gold shadow-sm"
                style={{ clipPath: 'polygon(0 0, 100% 0, 100% 68%, 68% 100%, 0 100%)' }}
              />
            ),
          },
          {
            id: 'note', label: '노트', desc: '가로 괘선 노트 — 긴 메모',
            patch: { color: 'surface-2', w: 220, h: 160, data: { deco: 'note' } },
            swatch: (
              <span className="flex h-5 w-5 flex-col justify-evenly rounded-sm border border-border bg-surface-2 px-0.5">
                <span className="block h-px w-full bg-border" />
                <span className="block h-px w-full bg-border" />
                <span className="block h-px w-full bg-border" />
              </span>
            ),
          },
        ],
      },
    ],
  },
  image: {
    title: '이미지 카드',
    sections: [
      {
        items: [
          { id: 'basic', label: '기본', desc: '200×150 — 자료 사진', patch: {}, swatch: ratioBox(21, 16) },
          { id: 'wide', label: '와이드', desc: '320×180 — 환경판·배너', patch: { w: 320, h: 180 }, swatch: ratioBox(25, 14) },
          { id: 'portrait', label: '세로', desc: '180×240 — 인물·관찰 컷', patch: { w: 180, h: 240 }, swatch: ratioBox(14, 19) },
          { id: 'square', label: '정사각', desc: '200×200 — 짝맞추기 카드', patch: { w: 200, h: 200 }, swatch: ratioBox(17, 17) },
        ],
      },
    ],
  },
  shape: {
    title: '도형',
    sections: [
      {
        items: [
          {
            id: 'rect', label: '사각형', desc: '구역 배경·묶음 표시', patch: {},
            swatch: <span className="block h-4 w-5 rounded-[3px] border border-border-strong bg-surface-3" />,
          },
          {
            id: 'circle', label: '원', desc: '자리 표시·순서 바탕',
            patch: { w: 140, h: 140, data: { shape: 'circle' } },
            swatch: <span className="block h-[18px] w-[18px] rounded-full border border-border-strong bg-surface-3" />,
          },
          {
            id: 'star', label: '별', desc: '칭찬·포인트 표시',
            patch: { w: 150, h: 150, color: 'gold', data: { shape: 'star' } },
            swatch: shapeSvg('star', 'text-gold'),
          },
          {
            id: 'heart', label: '하트', desc: '감사·사랑 표현',
            patch: { w: 150, h: 150, color: 'accent-soft', data: { shape: 'heart' } },
            swatch: shapeSvg('heart', 'text-accent-soft'),
          },
        ],
      },
    ],
  },
  video: {
    title: '동영상',
    sections: [
      {
        items: [
          {
            id: 'player', label: '동영상 플레이어', desc: '내 동영상 파일 재생 (mp4·webm)',
            nodeType: 'sticky',
            patch: VIDEO_PLAYER_PATCH,
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-fg-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m10.3 9.3 4.6 2.7-4.6 2.7z" fill="currentColor" stroke="none" />
              </svg>
            ),
          },
          {
            id: 'youtube', label: '유튜브', desc: '링크 붙여넣고 영상 재생',
            nodeType: 'sticky',
            patch: { w: 640, h: 420, autoH: false, text: '유튜브', data: { embed: '/youtube-viewer.html', title: '유튜브' } },
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-fg-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5.5" width="18" height="13" rx="3.2" />
                <path d="M10.4 9.4 14.8 12l-4.4 2.6z" fill="currentColor" stroke="none" />
              </svg>
            ),
          },
        ],
      },
    ],
  },
  frame: {
    title: '프레임 비율',
    sections: [
      {
        items: [
          { id: 'a4p', label: 'A4 세로', desc: '480×680 — 인쇄물 기준', patch: { w: 480, h: 680, data: { title: 'A4 세로' } }, swatch: ratioBox(14, 20, true) },
          { id: 'a4l', label: 'A4 가로', desc: '680×480 — 가로 인쇄물', patch: { w: 680, h: 480, data: { title: 'A4 가로' } }, swatch: ratioBox(20, 14, true) },
          { id: 'square', label: '정사각', desc: '520×520 — 게시 카드', patch: { w: 520, h: 520, data: { title: '정사각' } }, swatch: ratioBox(17, 17, true) },
          { id: 'wide', label: '와이드 16:9', desc: '640×360 — 화면·배너', patch: { w: 640, h: 360, data: { title: '와이드' } }, swatch: ratioBox(24, 13.5, true) },
          {
            id: 'youtube', label: '유튜브', desc: '링크 붙여넣고 영상 재생',
            nodeType: 'sticky',
            patch: { w: 640, h: 420, autoH: false, text: '유튜브', data: { embed: '/youtube-viewer.html', title: '유튜브' } },
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-fg-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5.5" width="18" height="13" rx="3.2" />
                <path d="M10.4 9.4 14.8 12l-4.4 2.6z" fill="currentColor" stroke="none" />
              </svg>
            ),
          },
          {
            id: 'glb', label: 'GLB 뷰어', desc: '3D 모델(GLB) 보기·애니메이션 재생',
            nodeType: 'sticky',
            patch: { w: 520, h: 480, autoH: false, text: 'GLB 뷰어', data: { embed: '/glb-viewer.html', title: 'GLB 뷰어' } },
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-fg-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
                <path d="M12 2.8 20 7v10l-8 4.2L4 17V7z" />
                <path d="M4 7l8 4 8-4M12 11v10" />
              </svg>
            ),
          },
        ],
      },
    ],
  },
};

export function BoardToolbar() {
  const selection = useBoardStore((s) => s.selection);
  const resetView = useBoardStore((s) => s.resetView);
  const show = useBoardStore((s) => s.show);
  const [fly, setFly] = useState<ToolId | null>(null);

  const add = (type: ToolId) => {
    // 기본 클릭 = 기존 동작 그대로 (프레임은 선택 감싸기 우선).
    if (type === 'frame') {
      const sel = useBoardStore.getState().selection;
      if (sel.length > 0) {
        const fid = wrapSelectionInFrameCmd(sel, '새 프레임');
        if (fid) void autoTitleFrame(fid); // 내용 분석 → 어울리는 제목 자동 부여
        return;
      }
      const c = viewCenterWorld();
      addFrameCmd(c.x - 260, c.y - 200, '새 프레임');
      return;
    }
    // 동영상 버튼 클릭 = 동영상 플레이어 카드(파일 불러와 재생) 바로 생성.
    if (type === 'video') {
      const c = viewCenterWorld();
      addPresetNodeCmd('sticky', c.x, c.y, VIDEO_PLAYER_PATCH, '동영상 플레이어 추가');
      return;
    }
    const c = viewCenterWorld();
    addNodeCmd(type, c.x - 90, c.y - 70);
  };

  const addPreset = (type: ToolId, p: PresetItem) => {
    const c = viewCenterWorld();
    addPresetNodeCmd(p.nodeType ?? type, c.x, c.y, p.patch, `${p.label} 추가`);
    setFly(null);
  };

  if (show) return null; // 슬라이드 쇼 중 — 화면을 깨끗하게(풀스크린처럼)

  return (
    <div className="pointer-events-auto absolute left-t3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-md backdrop-blur">
      <button
        title="선택"
        className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface-3 text-fg"
      >
        <Icon name="cursor" size={18} />
      </button>
      <div className="my-t1 h-px w-6 bg-border" />
      {TOOLS.map((t) => (
        <div
          key={t.id}
          className="relative"
          onMouseEnter={() => setFly(t.id)}
          onMouseLeave={() => setFly((f) => (f === t.id ? null : f))}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setFly((f) => (f === t.id ? null : f));
          }}
        >
          <button
            title={t.label}
            onClick={() => add(t.id)}
            onFocus={() => setFly(t.id)}
            className="flex h-10 w-10 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
          >
            <Icon name={t.icon} size={18} />
          </button>

          {/* 스타일 프리셋 플라이아웃 — pl이 호버 브리지 역할(마우스가 건너가도 유지) */}
          {fly === t.id && (
            <div className="absolute left-full top-0 z-30 pl-t2">
              <div className="w-56 rounded-lg border border-border bg-surface p-t2 shadow-lg">
                <p className="px-t2 pb-t1 text-overline text-fg-muted">{PRESET_PANELS[t.id].title}</p>
                {PRESET_PANELS[t.id].sections.map((sec, si) => (
                  <div key={si}>
                    {si > 0 && <div className="mx-t2 my-t1 h-px bg-border" />}
                    {sec.label && <p className="px-t2 py-t1 text-overline text-fg-muted">{sec.label}</p>}
                    <div className="flex flex-col">
                      {sec.items.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addPreset(t.id, p)}
                          className="flex items-center gap-t3 rounded-md px-t2 py-t2 text-left transition-colors duration-150 ease-soft hover:bg-surface-2"
                        >
                          <span className="flex h-7 w-8 shrink-0 items-center justify-center">{p.swatch}</span>
                          <span className="min-w-0 leading-tight">
                            <span className="block text-sm font-medium text-fg">{p.label}</span>
                            <span className="block truncate text-overline text-fg-muted">{p.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="my-t1 h-px w-6 bg-border" />
      <button
        title="잠금/해제 (⌘/Ctrl+L)"
        onClick={() => toggleLockCmd(selection)}
        disabled={selection.length === 0}
        className="flex h-10 w-10 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg disabled:opacity-40"
      >
        <Icon name="lock" size={18} />
      </button>
      <button
        title="홈 위치 (⌘/Ctrl+0)"
        onClick={() => resetView()}
        className="flex h-10 w-10 items-center justify-center rounded-pill text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
      >
        <Icon name="home" size={18} />
      </button>
    </div>
  );
}
