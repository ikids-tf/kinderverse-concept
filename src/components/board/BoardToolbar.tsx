import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/lib/icons';
import { useBoardStore, newId, type BoardNode, type NodeType } from '@/store/boardStore';
import { SHAPE_PATHS } from '@/lib/shapes';
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

type ToolId = PrimitiveType | 'frame' | 'video' | 'motion' | 'doc';

const TOOLS: Array<{ id: ToolId; icon: IconName; label: string }> = [
  { id: 'frame', icon: 'frame', label: '프레임' },
  { id: 'text', icon: 'writing', label: '텍스트' },
  { id: 'sticky', icon: 'memo', label: '메모' },
  { id: 'doc', icon: 'plan', label: '문서' },
  { id: 'image', icon: 'gallery', label: '이미지' },
  { id: 'video', icon: 'video', label: '뷰어' },
  { id: 'motion', icon: 'motion', label: '애니메이션' },
];

/** 이동 애니메이션 노드 기본 모양 — 좌하 출발 → 우상 도착, 살짝 휜 곡선. */
const MOTION_PATCH = (loop: boolean): Partial<BoardNode> => ({
  w: 440,
  h: 230,
  autoH: false,
  data: {
    p1: { x: 36, y: 194 },
    p2: { x: 404, y: 56 },
    c1: { x: 159, y: 89 },
    c2: { x: 281, y: 43 },
    speedX: 1, // 배속(슬라이더 0.3~4×)
    loop,
    flip: 'flip', // 이동 방향으로 좌우 플립(기본) — 컨트롤의 [플립] 칩으로 회전/고정 전환
  },
});

/** 동영상 플레이어 임베드 카드 — 뷰어 플라이아웃의 '개별 뷰어'에서 쓴다. */
const VIDEO_PLAYER_PATCH: Partial<BoardNode> = {
  w: 640,
  h: 420,
  autoH: false,
  text: '동영상 플레이어',
  data: { embed: '/video-player.html', title: '동영상 플레이어' },
};

/** 매직 뷰어 — 뷰어 버튼 기본 클릭(유튜브·동영상·3D를 담는 내용에 맞춰 하나로). */
const MAGIC_VIEWER_PATCH: Partial<BoardNode> = {
  w: 640,
  h: 420,
  autoH: false,
  text: '매직 뷰어',
  data: { embed: '/magic-viewer.html', title: '매직 뷰어' },
};

/** 슬라이드 뷰어 — 교사가 레이아웃을 골라 직접 슬라이드를 만드는 자체 엔진(16:9).
    임베드 src는 인스턴스마다 ?id=로 분리(addPreset에서 주입) — 덱이 섞이지 않게.
    상세 아키텍처: slides-feature/CLAUDE.md(React 엔진·DeckSpec·레이아웃 enum). */
const SLIDES_VIEWER_PATCH: Partial<BoardNode> = {
  w: 720,
  h: 470,
  autoH: false,
  text: '슬라이드',
  data: { embed: '/slides-viewer.html', title: '슬라이드' },
};

/** 게임 뷰어 — 교사가 템플릿/프롬프트로 만들고 아이가 즐기는 인터랙티브 놀이(파스텔).
    화면 안쪽은 Milray 미적용(아이 대면) — src/game-viewer/theme.ts 토큰. 셸은 Milray 유지.
    상세 아키텍처: game-viewer-handoff/CLAUDE.md(템플릿+GameSpec 단일 계약). */
const GAME_VIEWER_PATCH: Partial<BoardNode> = {
  w: 760,
  h: 560,
  autoH: false,
  text: '놀이 만들기',
  data: { embed: '/game-viewer.html', title: '놀이 만들기' },
};

/** 인터렉티브 노드 — 네이티브 보드 노드(iframe 아님). 교사가 자료를 배치하고 탭하면
    움직임/교체가 일어나게 저작, 풀스크린 단독 재생. 카드 안쪽은 파스텔(아이 대면,
    .kv-inode) — Milray 미적용. 저작 단위 InteractiveNode는 data.docId로 참조(스키마:
    src/features/interactive-viewer/schema). 카드 비율은 논리 캔버스(1280×800=1.6)에 맞춤. */
const INTERACTIVE_VIEWER_PATCH: Partial<BoardNode> = {
  // 슬라이드와 같은 크기로 생성(처음 호출 시 너무 작던 문제). 논리 캔버스 1280×800=1.6 비율 유지
  // → 슬라이드 폭(720)에 맞추면 높이 450(720/1.6, 레터박스 없음).
  w: 720,
  h: 450,
  autoH: false,
  text: '인터랙티브',
  data: { title: '인터랙티브' },
};

/* 문서 폼 — 각 유아교육 양식의 A4 문서 스캐폴드(data.doc 마크다운). 교사가 그대로
   프린트하거나, 선택 후 프롬프트로 채워(에이전트) 완성한다. 빈 양식이 보드에 바로 놓인다. */
const DOC_TEMPLATES: Array<{ id: string; label: string; desc: string; text: string }> = [
  {
    id: 'basic', label: '기본형', desc: '제목 + 본문 — 자유 문서',
    text: '# 제목\n\n내용을 입력하세요.',
  },
  {
    id: 'plan', label: '놀이계획', desc: '주간 놀이계획 — 요일별 표',
    text:
      '# 주간 놀이계획\n\n**대상** 만 OO세 · **기간** OO월 OO주 · **주제** \n\n' +
      '## 주간 교육목표\n- \n\n## 요일별 놀이\n' +
      '| 요일 | 누리과정 영역 | 놀이 활동 | 준비물 |\n|---|---|---|---|\n' +
      '| 월 |  |  |  |\n| 화 |  |  |  |\n| 수 |  |  |  |\n| 목 |  |  |  |\n| 금 |  |  |  |',
  },
  {
    id: 'story', label: '놀이기록', desc: '놀이이야기 — 학부모 공유용',
    text:
      '# 놀이 이야기\n\n**날짜** 20OO.OO.OO · **놀이 주제** \n\n' +
      '## 오늘의 놀이\n아이들이 어떤 놀이를 했는지 이야기처럼 적어요.\n\n' +
      '## 배움과 성장\n놀이 속에서 발견한 배움·성장을 적어요.\n\n## 가정 연계\n',
  },
  {
    id: 'observation', label: '관찰기록', desc: '발달 관찰 — 영역 연계',
    text:
      '# 관찰기록\n\n**아동** OOO · **일시** 20OO.OO.OO · **장면** \n\n' +
      '## 관찰 내용\n객관적 사실을 중심으로 기록해요.\n\n' +
      '## 발달 영역 연계\n- \n\n## 해석 및 지원 계획\n',
  },
  {
    id: 'notice', label: '알림장', desc: '가정통신문·안내문',
    text:
      '# 알림장\n\nOOO 학부모님께,\n\n안내 내용을 적어요.\n\n' +
      '## 안내 사항\n- \n\n20OO년 OO월 OO일\nOO반 드림',
  },
];

/** 문서 카드 패치 — A4 세로 비율 고정(480 : 679 ≈ 짧은 변 기준 1:√2). autoH를 끄고
    고정 높이로 둬 한 장(A4)처럼 보이게 한다. 바운드 박스 스케일은 data.doc 락으로
    이미 '정비례만' 적용되므로(BoardCanvas freeform 제외) 비율이 유지된다. */
const A4_W = 480;
const A4_H = 679;
const docPatch = (label: string, text: string): Partial<BoardNode> => ({
  w: A4_W,
  h: A4_H,
  autoH: false,
  text,
  data: { doc: true, title: label },
});

/** 문서 미니 스와치 — A4 페이지 + 본문 줄. */
const docSwatch = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} className="text-fg-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

interface PresetItem {
  id: string;
  label: string;
  desc: string;
  patch: Partial<BoardNode>;
  swatch: React.ReactNode;
  /** 패널의 기본 타입 대신 다른 노드 타입으로 생성(예: 프레임 패널의 GLB 뷰어 카드). */
  nodeType?: NodeType;
  /** 준비 중(기능 미연결) — 버튼만 보이고 클릭해도 노드를 만들지 않는다('준비 중' 배지). */
  comingSoon?: boolean;
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

/** 이동 애니메이션 스와치 — 두 원 + 곡선 + 가운데 조절점(기능 모양 그대로). */
const motionSwatch = (
  <svg viewBox="0 0 24 24" width={20} height={20} className="text-fg-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <circle cx="5" cy="18" r="2.5" />
    <circle cx="19" cy="6" r="2.5" />
    <path d="M7.2 16.2C10.3 13.2 13.7 10.8 16.8 7.8" strokeDasharray="2.6 2.3" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

const PRESET_PANELS: Record<ToolId, { title: string; caption?: string; sections: PresetSection[] }> = {
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
  doc: {
    title: '문서',
    sections: [
      {
        items: DOC_TEMPLATES.map((t) => ({
          id: t.id,
          label: t.label,
          desc: t.desc,
          nodeType: 'sticky' as NodeType,
          patch: docPatch(t.label, t.text),
          swatch: docSwatch(),
        })),
      },
    ],
  },
  image: {
    title: '이미지',
    sections: [
      {
        items: [
          { id: 'image', label: '이미지', desc: '자료 사진·AI 그림 (가로)', patch: {}, swatch: ratioBox(21, 16) },
          { id: 'worksheet', label: '활동지', desc: '인쇄용 활동지·도안 (세로 3:4)', patch: { w: 360, h: 480 }, swatch: ratioBox(15, 20) },
          { id: 'card', label: '카드', desc: '그림·낱말·짝맞추기 카드 (정사각)', patch: { w: 200, h: 200 }, swatch: ratioBox(17, 17) },
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
    title: '뷰어',
    sections: [
      {
        label: '무엇이든 — 매직 뷰어',
        items: [
          {
            id: 'magic', label: '매직 뷰어', desc: '유튜브·동영상·3D를 하나로 — 링크·파일·프롬프트로 알아서',
            nodeType: 'sticky',
            patch: MAGIC_VIEWER_PATCH,
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-accent" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 19 19 5M14 5h5v5" />
                <path d="M7.5 7.5 9 9M4 12l1.2 1.2M12 4l1.2 1.2" />
              </svg>
            ),
          },
        ],
      },
      {
        label: '개별 뷰어',
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
          {
            id: 'glb', label: '3D 뷰어', desc: '3D 모델(GLB) 보기·애니메이션 재생',
            nodeType: 'sticky',
            patch: { w: 520, h: 480, autoH: false, text: '3D 뷰어', data: { embed: '/glb-viewer.html', title: '3D 뷰어' } },
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-fg-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
                <path d="M12 2.8 20 7v10l-8 4.2L4 17V7z" />
                <path d="M4 7l8 4 8-4M12 11v10" />
              </svg>
            ),
          },
        ],
      },
      {
        label: '직접 만들기',
        items: [
          {
            id: 'slides', label: '슬라이드', desc: '레이아웃을 골라 수업·안내 슬라이드 제작 (16:9)',
            nodeType: 'sticky',
            patch: SLIDES_VIEWER_PATCH,
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-accent" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4.5" width="18" height="15" rx="2.4" />
                <path d="M6.5 9h7M6.5 12.5h11M6.5 16h8" />
              </svg>
            ),
          },
          {
            id: 'game', label: '놀이 만들기', desc: '숫자 세기·그림자 맞추기 등 아이용 인터랙티브 놀이 (음성·보상)',
            nodeType: 'sticky',
            patch: GAME_VIEWER_PATCH,
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-accent" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2.5" y="7" width="19" height="10" rx="5" />
                <path d="M7 12h2.4M8.2 10.8v2.4" />
                <circle cx="15.4" cy="11.3" r="0.5" fill="currentColor" />
                <circle cx="17.2" cy="13" r="0.5" fill="currentColor" />
              </svg>
            ),
          },
          {
            id: 'interactive', label: '인터랙티브', desc: '탭·드래그로 반응하는 인터랙티브 카드',
            nodeType: 'interactive',
            patch: INTERACTIVE_VIEWER_PATCH,
            swatch: (
              <svg viewBox="0 0 24 24" width={19} height={19} className="text-accent" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 9l5.5 12 1.7-5.2L21 14.3 9 9z" />
                <path d="M5 5l1 1.4M5.2 11l1.4-.6M11 5.2l-.6 1.4" />
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
        ],
      },
    ],
  },
  motion: {
    title: '이동 애니메이션',
    caption:
      '출발·도착 원에 카드를 연결하고 ▶를 누르면 선을 따라 움직여요. 선 위의 두 점을 각각 드래그하면 S자·파도 등 다채로운 곡선이 돼요 — 수업 자료를 손쉽게 움직이는 콘텐츠로.',
    sections: [
      {
        items: [
          {
            id: 'once',
            label: '한 번 이동',
            desc: '출발 → 도착 한 번 이동 (↺로 처음으로)',
            nodeType: 'motion',
            patch: MOTION_PATCH(false),
            swatch: motionSwatch,
          },
          {
            id: 'loop',
            label: '왕복 반복',
            desc: '갔다가 돌아오기를 반복 (▶/⏸)',
            nodeType: 'motion',
            patch: MOTION_PATCH(true),
            swatch: motionSwatch,
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

  // 호버 중 툴바가 사라져도(슬라이드 쇼 진입 등) body 클래스가 남지 않게 정리.
  useEffect(() => () => document.body.classList.remove('kv-toolbar-hover'), []);

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
    // 뷰어 버튼 클릭 = 매직 뷰어(유튜브·동영상·3D를 담는 내용에 맞춰) 바로 생성.
    if (type === 'video') {
      const c = viewCenterWorld();
      addPresetNodeCmd('sticky', c.x, c.y, MAGIC_VIEWER_PATCH, '매직 뷰어 추가');
      return;
    }
    // 문서 버튼 클릭 = 기본형 문서 바로 생성(호버 플라이아웃에서 양식 선택).
    if (type === 'doc') {
      const c = viewCenterWorld();
      const t = DOC_TEMPLATES[0];
      addPresetNodeCmd('sticky', c.x, c.y, docPatch(t.label, t.text), '문서 추가');
      return;
    }
    // 애니메이션 버튼 클릭 = 이동 경로(한 번 이동) 바로 생성.
    if (type === 'motion') {
      const c = viewCenterWorld();
      addPresetNodeCmd('motion', c.x, c.y, MOTION_PATCH(false), '이동 애니메이션 추가');
      return;
    }
    const c = viewCenterWorld();
    const id = addNodeCmd(type, c.x - 90, c.y - 70);
    // 텍스트 라벨만 추가 즉시 편집 모드로(빈 라벨은 바로 타이핑이 자연스럽다).
    // 포스트잇(메모)은 먼저 드래그 가능한 카드로 등장 — 편집은 더블클릭/선택 후 타이핑.
    if (type === 'text') {
      const n = useBoardStore.getState().nodes[id];
      if (n) useBoardStore.getState().updateNodeRaw(id, { data: { ...(n.data ?? {}), autoEdit: true } });
    }
  };

  const addPreset = (type: ToolId, p: PresetItem) => {
    const c = viewCenterWorld();
    // 'video'·'doc'은 노드 타입이 아니라 툴 id — 프리셋은 모두 sticky(임베드/문서).
    const fallback: NodeType = type === 'video' || type === 'doc' ? 'sticky' : type;
    let patch = p.patch;
    // 슬라이드 뷰어 — 인스턴스마다 고유 ?id=로 덱(localStorage 키)을 분리한다.
    const data = patch.data as Record<string, unknown> | undefined;
    if (data && typeof data.embed === 'string' && data.embed.startsWith('/slides-viewer.html')) {
      patch = { ...patch, data: { ...data, embed: `/slides-viewer.html?id=${newId('deck')}` } };
    }
    // 인터렉티브 노드 — 인스턴스마다 고유 docId로 InteractiveNode 문서를 분리한다.
    if (p.nodeType === 'interactive') {
      patch = { ...patch, data: { ...(data ?? {}), docId: newId('inode') } };
    }
    addPresetNodeCmd(p.nodeType ?? fallback, c.x, c.y, patch, `${p.label} 추가`);
    setFly(null);
  };

  if (show) return null; // 슬라이드 쇼 중 — 화면을 깨끗하게(풀스크린처럼)

  return (
    <div
      // 툴바 호버 → 프롬프트바를 또렷하게(body 클래스로 CSS가 바 투명도를 올린다).
      onPointerEnter={() => document.body.classList.add('kv-toolbar-hover')}
      onPointerLeave={() => document.body.classList.remove('kv-toolbar-hover')}
      className="pointer-events-auto absolute left-t3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-t1 rounded-pill border border-border bg-surface/95 p-t1 shadow-md backdrop-blur">
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
            <div className="absolute left-full top-1/2 z-30 -translate-y-1/2 pl-t2">
              <div className="w-56 max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-surface p-t2 shadow-lg">
                <p className="px-t2 pb-t1 text-overline text-fg-muted">{PRESET_PANELS[t.id].title}</p>
                {PRESET_PANELS[t.id].caption && (
                  <p className="px-t2 pb-t2 text-xs leading-snug text-fg-2">{PRESET_PANELS[t.id].caption}</p>
                )}
                {PRESET_PANELS[t.id].sections.map((sec, si) => (
                  <div key={si}>
                    {si > 0 && <div className="mx-t2 my-t1 h-px bg-border" />}
                    {sec.label && <p className="px-t2 py-t1 text-overline text-fg-muted">{sec.label}</p>}
                    <div className="flex flex-col">
                      {sec.items.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { if (!p.comingSoon) addPreset(t.id, p); }}
                          disabled={p.comingSoon}
                          className={`flex items-center gap-t3 rounded-md px-t2 py-t2 text-left transition-colors duration-150 ease-soft ${p.comingSoon ? 'cursor-default opacity-60' : 'hover:bg-surface-2'}`}
                        >
                          <span className="flex h-7 w-8 shrink-0 items-center justify-center">{p.swatch}</span>
                          <span className="min-w-0 leading-tight">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                              {p.label}
                              {p.comingSoon && (
                                <span className="rounded-pill bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-fg-muted">준비 중</span>
                              )}
                            </span>
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
