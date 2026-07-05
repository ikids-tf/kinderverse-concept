import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTrayStore } from '@/store/trayStore';
import { PageHero } from '@/components/PageHero';
import {
  NotebookPen, Palette, Shapes, BookOpen, Image as ImageIcon, Tag, Sparkles,
  Cake, FileStack, FileText, Search, LayoutGrid, List, Maximize2, Wand2,
  Share2, Bookmark, Download, X, Check, Video, Play, Link as LinkIcon, Heart, Gamepad2, Trash2, type LucideIcon,
} from 'lucide-react';
import { listAssets, removeAsset, type ImageAsset } from '@/board/assets';
import { listWebLinks, removeWebLink, type WebLink } from '@/board/webLinks';
import { getVideoAsset } from '@/board/videoAssets';
import { getThumb } from '@/board/thumbs';
import { listLibrary, removeFromLibrary, type SavedGame } from '@/features/interactive-viewer/store/library';
import { removeGameCard } from '@/features/interactive-viewer/store/gameCards';
import { loadInteractiveNode } from '@/features/interactive-viewer/store/interactiveStore';
import { InteractiveOverlay } from '@/features/interactive-viewer/authoring/InteractiveOverlay';
import { InteractiveGallery } from '@/features/interactive-viewer/authoring/InteractiveGallery';
import { ZoomOverlay } from '@/components/board/ZoomOverlay';

/* 좋아요 — 로컬 영속(백엔드 없이 새로고침해도 유지). id별 on/off. */
const LIKES_KEY = 'kv:gallery:likes:v1';
function loadLikes(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}'); } catch { return {}; }
}
function setLike(id: string, on: boolean) {
  const m = loadLikes();
  if (on) m[id] = true; else delete m[id];
  try { localStorage.setItem(LIKES_KEY, JSON.stringify(m)); } catch { /* quota */ }
}

/* 항목별 '사용수/좋아요수' — 실제 집계가 없어 id 해시로 안정적인 의사 수치를 만든다
   (같은 카드는 항상 같은 값). 좋아요를 누르면 +1. */
function hashNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
const usageCount = (id: string) => 8 + (hashNum(id) % 320);
const baseLikes = (id: string) => 2 + (hashNum(id + 'L') % 90);

/** 자료 다운로드 — 이미지/도안은 썸네일(원본 data URI), 동영상은 mp4, 웹은 새 탭. */
async function downloadItem(it: GalleryItem) {
  if (it.assetKind === 'web' && it.href) { window.open(it.href, '_blank', 'noopener'); return; }
  let url = it.thumb;
  let ext = 'jpg';
  if (it.assetKind === 'video') {
    url = await loadVideoSrc(it.videoAssetId);
    ext = 'mp4';
  }
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${it.t || 'kinderverse'}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* 동영상 자산의 실제 mp4(data URI)를 id로 한 번만 읽어 캐시 — 카드 호버 재생과
   뷰어가 공유한다(같은 영상을 두 번 IDB에서 읽지 않게). */
const videoSrcCache = new Map<string, Promise<string | undefined>>();
function loadVideoSrc(id?: string): Promise<string | undefined> {
  if (!id) return Promise.resolve(undefined);
  let p = videoSrcCache.get(id);
  if (!p) {
    p = getVideoAsset(id);
    videoSrcCache.set(id, p);
  }
  return p;
}

/* 저장된 mp4(data URI)에서 선명한 포스터(긴 변 720px)를 떠 온다 — 예전에 160px로
   구워진 포스터가 갤러리에서 깨져 보이던 것을 카드 마운트 시 교체하는 용도. */
const posterCache = new Map<string, Promise<string | undefined>>();
function hiResPoster(id?: string): Promise<string | undefined> {
  if (!id) return Promise.resolve(undefined);
  let p = posterCache.get(id);
  if (!p) {
    p = loadVideoSrc(id).then(
      (src) =>
        new Promise<string | undefined>((resolve) => {
          if (!src) return resolve(undefined);
          const v = document.createElement('video');
          v.muted = true;
          v.preload = 'auto';
          let settled = false;
          const done = (out?: string) => { if (settled) return; settled = true; resolve(out); };
          const grab = () => {
            try {
              const vw = v.videoWidth, vh = v.videoHeight;
              if (!vw || !vh) return done(undefined);
              const scale = Math.min(1, 720 / Math.max(vw, vh));
              const cv = document.createElement('canvas');
              cv.width = Math.max(1, Math.round(vw * scale));
              cv.height = Math.max(1, Math.round(vh * scale));
              const ctx = cv.getContext('2d');
              if (!ctx) return done(undefined);
              ctx.drawImage(v, 0, 0, cv.width, cv.height);
              done(cv.toDataURL('image/jpeg', 0.85));
            } catch {
              done(undefined);
            }
          };
          // Veo 영상은 검은 화면에서 페이드인 → 도입 프레임은 검다. 내용이 있는
          // 중간 지점(25%, 최대 1.2초)으로 시킹한 뒤 그 프레임을 포스터로 캡처한다.
          v.addEventListener('loadedmetadata', () => {
            const d = v.duration;
            v.currentTime = isFinite(d) && d > 0 ? Math.min(1.2, d * 0.25) : 0.5;
          }, { once: true });
          v.addEventListener('seeked', grab, { once: true });
          v.addEventListener('error', () => done(undefined), { once: true });
          setTimeout(grab, 4000); // 시킹이 안 끝나도 마지막엔 현재 프레임이라도
          v.src = src;
        }),
    );
    posterCache.set(id, p);
  }
  return p;
}

/* ---------------- Gallery (자료 갤러리) ----------------
   Browse teacher resources (worksheets, coloring, storybooks, posters, name
   tags, classroom decor, play records, templates) at a glance; click → full
   screen viewer to apply / share / save. Filters + grid/list view modes.
   Ported from the kinderVerse-2027 reference (inline-style + lucide).
   NOTE: per request, the coral gradient fills on resource cards are removed —
   thumbnails use a flat neutral brand surface (#F4EDE3) instead. */

/* Milray Park light palette — hex values mirror src/styles/tokens.css 1:1. */
const C = {
  bg: '#F8F7F2',
  ink: '#141311',
  muted: '#8C887F',
  line: '#E7E0D4',
  coral: '#F2733E',
  thumb: '#F4EDE3', // flat neutral surface that replaces the removed gradient
  shadow1: '0 8px 24px rgba(40,33,24,.06)',
  shadow2: '0 18px 48px rgba(40,33,24,.08)',
};

type GalleryItem = {
  id: string; t: string; cat: string; sub: string; icon: LucideIcon; ratio: string;
  /** 실제 보관함 자산 — 썸네일(이미지·포스터·웹 대표이미지) + 종류·링크. 없으면 mock(아이콘 카드). */
  thumb?: string;
  assetKind?: 'image' | 'video' | 'web';
  href?: string;
  videoAssetId?: string;
  /** 인터랙티브 게임 — 설정되면 카드 클릭 시 플레이 오버레이를 연다(뷰어 모달 대신). */
  gameDocId?: string;
  /** 호버 삭제 식별자 — 게임/자산/웹. 없으면 삭제 불가(mock 데모 자료). */
  del?:
    | { type: 'game'; docId: string }
    | { type: 'asset'; tag: string; createdAt: number; kind: ImageAsset['kind'] }
    | { type: 'web'; url: string };
};

const GALLERY_ITEMS: GalleryItem[] = [
  { id: 'g1', t: '가을 숫자 세기 활동지', cat: '활동지', sub: '수·연산 · 만 4–5세', icon: NotebookPen, ratio: '3 / 4' },
  { id: 'g2', t: '한글 자음 따라쓰기', cat: '활동지', sub: '언어 · 만 5세', icon: NotebookPen, ratio: '3 / 4' },
  { id: 'g3', t: '미로 찾기 워크시트', cat: '활동지', sub: '사고력 · 만 4세', icon: NotebookPen, ratio: '1 / 1' },
  { id: 'g4', t: '가을 나뭇잎 색칠 도안', cat: '도안', sub: '미술 · 자연', icon: Palette, ratio: '3 / 4' },
  { id: 'g5', t: '동물 친구들 색칠', cat: '도안', sub: '미술 · 동물', icon: Palette, ratio: '1 / 1' },
  { id: 'g6', t: '도형 오리기 도안', cat: '도안', sub: '조작 · 도형', icon: Shapes, ratio: '3 / 4' },
  { id: 'g7', t: '용감한 토끼 이야기', cat: '스토리북', sub: '창작 동화 · 12쪽', icon: BookOpen, ratio: '4 / 3' },
  { id: 'g8', t: '가을 숲 친구들', cat: '스토리북', sub: '자연 동화 · 10쪽', icon: BookOpen, ratio: '4 / 3' },
  { id: 'g9', t: '감정 나누기 그림책', cat: '스토리북', sub: '사회·정서 · 8쪽', icon: BookOpen, ratio: '1 / 1' },
  { id: 'g10', t: '손 씻기 6단계 포스터', cat: '포스터', sub: '보건 · 생활습관', icon: ImageIcon, ratio: '3 / 4' },
  { id: 'g11', t: '교통안전 약속 포스터', cat: '포스터', sub: '안전교육', icon: ImageIcon, ratio: '2 / 3' },
  { id: 'g12', t: '우리반 규칙 포스터', cat: '포스터', sub: '생활지도', icon: ImageIcon, ratio: '3 / 4' },
  { id: 'g13', t: '동물 모양 이름표', cat: '명찰', sub: '이름 넣기 템플릿', icon: Tag, ratio: '16 / 9' },
  { id: 'g14', t: '구름 이름표 세트', cat: '명찰', sub: '사물함·자리표', icon: Tag, ratio: '16 / 9' },
  { id: 'g15', t: '가을 교실 환경판', cat: '환경꾸미기', sub: '벽면 구성 · 10월', icon: Sparkles, ratio: '4 / 3' },
  { id: 'g16', t: '생일 축하 게시판', cat: '환경꾸미기', sub: '이벤트 꾸미기', icon: Cake, ratio: '1 / 1' },
  { id: 'g17', t: '계절 나무 데코', cat: '환경꾸미기', sub: '벽면 · 사계절', icon: Sparkles, ratio: '3 / 4' },
  { id: 'g18', t: '블록놀이 관찰기록', cat: '놀이기록', sub: '누리과정 연계', icon: FileStack, ratio: '3 / 4' },
  { id: 'g19', t: '역할놀이 기록 양식', cat: '놀이기록', sub: '관찰·평가', icon: FileStack, ratio: '1 / 1' },
  { id: 'g20', t: '가정통신문 템플릿', cat: '템플릿', sub: '월간 안내', icon: FileText, ratio: '3 / 4' },
  { id: 'g21', t: '주간 식단표 템플릿', cat: '템플릿', sub: '알레르기 표시', icon: FileText, ratio: '4 / 3' },
  { id: 'g22', t: '현장학습 동의서', cat: '템플릿', sub: '안내·회신', icon: FileText, ratio: '3 / 4' },
];

const GALLERY_CATS = ['전체', '게임', '도안', '동영상', '웹링크', '활동지', '스토리북', '포스터', '명찰', '환경꾸미기', '놀이기록', '템플릿'];

/** 저장된 인터랙티브 게임 → 갤러리 아이템. 썸네일은 장면 배경(있으면), 없으면 게임 아이콘 카드.
    클릭 시 gameDocId 로 플레이 오버레이를 연다(생성 게임이 '계속 리스트'된다). */
function buildGameItems(games: SavedGame[]): GalleryItem[] {
  return games.map((g) => {
    const doc = loadInteractiveNode(g.docId);
    const bg = doc?.canvas.background;
    const thumb = bg && typeof bg === 'object' ? bg.src : undefined;
    return {
      id: `game-${g.docId}`,
      t: g.title || '인터랙티브 게임',
      cat: '게임',
      sub: '인터랙티브 게임',
      icon: Gamepad2,
      ratio: '16 / 10',
      ...(thumb ? { thumb, assetKind: 'image' as const } : {}),
      gameDocId: g.docId,
      del: { type: 'game' as const, docId: g.docId },
    };
  });
}

/** 웹 링크의 파비콘 URL(대표 이미지가 없을 때 폴백). */
function faviconOf(href?: string): string {
  if (!href) return '';
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(href).hostname}&sz=64`;
  } catch {
    return '';
  }
}

/** 보관함 자산(이미지·도안·동영상) + 웹 링크 → 갤러리 아이템.
    PRD/요청: 일반 이미지·도안 → '도안', 동영상 → '동영상', 웹 링크 → '웹링크'. */
function buildArchiveItems(assets: ImageAsset[], links: WebLink[]): GalleryItem[] {
  const out: GalleryItem[] = [];
  for (const x of assets) {
    const isVideo = x.kind === 'video';
    out.push({
      id: `asset-${x.kind}-${x.videoAssetId ?? x.tag}-${x.createdAt}`,
      t: x.tag,
      cat: isVideo ? '동영상' : '도안',
      sub: isVideo ? '생성한 동영상' : x.kind === '도안' ? '생성한 도안' : '생성한 이미지',
      icon: isVideo ? Video : x.kind === '도안' ? Palette : ImageIcon,
      ratio: '1 / 1',
      thumb: x.url,
      assetKind: isVideo ? 'video' : 'image',
      ...(x.videoAssetId ? { videoAssetId: x.videoAssetId } : {}),
      del: { type: 'asset', tag: x.tag, createdAt: x.createdAt, kind: x.kind },
    });
  }
  for (const l of links) {
    out.push({
      id: `web-${l.url}`,
      t: l.title,
      cat: '웹링크',
      sub: l.domain || '웹 링크',
      icon: LinkIcon,
      ratio: '4 / 3',
      ...(l.thumb ? { thumb: l.thumb } : {}),
      assetKind: 'web',
      href: l.url,
      del: { type: 'web', url: l.url },
    });
  }
  return out;
}

// offline keyword match — prompt-bar driven "AI gather" (no backend dependency)
const GAL_STOP = new Set(['자료', '찾아줘', '찾아', '수업', '수업할', '할만한', '사용', '사용할', '좀', '해당', '추천', '해줘', '만들어줘', '보여줘', '해', '줘', '만한', '것', '거', '관련', '위한', '필요한', '있는', '좋은', '모아줘', '모아', '골라줘']);
function galHeuristic(query: string): string[] {
  const words = (query || '')
    .split(/[\s,·!?.]+/)
    .map((w) => w.replace(/(을|를|이|가|은|는|에|의|로|와|과|도|만|에서|에게|한테)$/, ''))
    .filter((w) => w.length >= 2 && !GAL_STOP.has(w));
  return GALLERY_ITEMS.filter((it) => words.some((w) => it.t.includes(w) || it.sub.includes(w) || it.cat.includes(w))).map((it) => it.id);
}

/** 카드가 뷰포트(+여유 마진)에 들어오면 true — 한 번 보이면 계속 true(스크롤 시 깜빡임 방지).
    보이는 카드만 썸네일을 굽고 이미지를 그려, 128장 풀해상도를 한 번에 디코딩하던 비용을 없앤다. */
function useInView<T extends HTMLElement>(rootMargin = '500px'): { ref: React.RefObject<T>; inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setInView(true); },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}

/* 마조너리(높이 가변)지만 '행 우선' 정렬 — 항목을 열에 라운드로빈으로 분배해
   맨 윗줄이 왼→오로 최신순이 되게 한다. CSS columns는 세로 우선이라 왼쪽 열부터
   채워져(최신이 왼쪽 열에 쌓임) 이 동작을 못 한다. */
function MasonryGrid({ items, onOpen, onDelete, picked, onTogglePick, onSendToBoard }: { items: GalleryItem[]; onOpen: (it: GalleryItem) => void; onDelete: (it: GalleryItem) => void; picked: Set<string>; onTogglePick: (id: string) => void; onSendToBoard: (it: GalleryItem) => void }) {
  const COL = 228;
  const GAP = 16;
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setCols(Math.max(1, Math.floor((w + GAP) / (COL + GAP))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 라운드로빈 분배 — i번째 항목 → (i % cols)열. 0번(최신)이 0열 맨 위.
  const buckets: GalleryItem[][] = Array.from({ length: cols }, () => []);
  items.forEach((it, i) => buckets[i % cols].push(it));
  return (
    <div ref={ref} style={{ display: 'flex', gap: GAP, alignItems: 'flex-start' }}>
      {buckets.map((bucket, ci) => (
        <div key={ci} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: GAP }}>
          {bucket.map((it) => <GalleryCard key={it.id} it={it} onOpen={() => onOpen(it)} onDelete={it.del ? () => onDelete(it) : undefined} picked={picked.has(it.id)} selecting={picked.size > 0} onTogglePick={() => onTogglePick(it.id)} onSendToBoard={() => onSendToBoard(it)} />)}
        </div>
      ))}
    </div>
  );
}

function GalleryCard({ it, onOpen, onDelete, picked, selecting, onTogglePick, onSendToBoard }: { it: GalleryItem; onOpen: () => void; onDelete?: () => void; picked: boolean; selecting: boolean; onTogglePick: () => void; onSendToBoard: () => void }) {
  const a = C.coral;
  const Icon = it.icon;
  const isVideo = it.assetKind === 'video';
  const isImage = it.assetKind === 'image';
  // 보이는 카드만 썸네일을 굽고 그린다(화면 밖 카드는 자리만 잡는 빈 면).
  const { ref, inView } = useInView<HTMLButtonElement>();
  const vidRef = useRef<HTMLVideoElement>(null);
  const [vidSrc, setVidSrc] = useState<string | undefined>();
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [natRatio, setNatRatio] = useState<number | undefined>(); // 로드된 이미지의 실제 비율 — 잘림 없이 원본 비율로 표시
  // 그리드용 작은 썸네일(긴 변 384px ≈ 30KB) — 풀해상도(it.thumb)는 뷰어/다운로드에서만.
  const [thumbSrc, setThumbSrc] = useState<string | undefined>();
  useEffect(() => {
    if (!inView || !isImage || !it.thumb || it.gameDocId) return; // 게임은 아래 '첫 화면' 합성으로 처리
    let alive = true;
    void getThumb(it.id, it.thumb).then((t) => { if (alive) setThumbSrc(t); });
    return () => { alive = false; };
  }, [inView, isImage, it.thumb, it.id, it.gameDocId]);
  // 게임 카드 — 빈 배경 대신 '실제 게임 첫 화면'(배경 + 보이는 캐릭터·아이템)을 합성해 보여준다.
  //   합성 실패(CORS 등) 시 배경 썸네일로 폴백.
  useEffect(() => {
    if (!inView || !it.gameDocId) return;
    let alive = true;
    void (async () => {
      try {
        const { loadInteractiveNode } = await import('@/features/interactive-viewer/store/interactiveStore');
        const doc = loadInteractiveNode(it.gameDocId!);
        if (!doc) return;
        const { renderGameFirstFrame } = await import('@/features/interactive-viewer/runtime/firstFrame');
        const frame = await renderGameFirstFrame(doc);
        if (!alive) return;
        if (frame) { setThumbSrc(frame); return; }
        if (it.thumb) { const t = await getThumb(it.id, it.thumb); if (alive) setThumbSrc(t); } // 폴백: 배경
      } catch { /* 합성 실패 — 무시(빈 카드) */ }
    })();
    return () => { alive = false; };
  }, [inView, it.gameDocId, it.id, it.thumb]);
  // 예전 저해상도 포스터 → 저장된 mp4에서 선명한 포스터로 교체(보일 때만 디코딩).
  const [poster, setPoster] = useState<string | undefined>(it.thumb);
  useEffect(() => {
    if (!inView || !isVideo || !it.videoAssetId) return;
    let alive = true;
    void hiResPoster(it.videoAssetId).then((hi) => { if (alive && hi) setPoster(hi); });
    return () => { alive = false; };
  }, [inView, isVideo, it.videoAssetId]);

  // 호버 → 실제 영상을 카드 안에서 재생(음소거·반복). 떠나면 멈추고 포스터로.
  const onEnter = () => {
    setHovered(true);
    if (!isVideo) return;
    if (vidSrc) { setPlaying(true); return; }
    void loadVideoSrc(it.videoAssetId).then((src) => { if (src) { setVidSrc(src); setPlaying(true); } });
  };
  const onLeave = () => {
    setHovered(false);
    if (!isVideo) return;
    setPlaying(false);
    const v = vidRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
  };
  useEffect(() => {
    const v = vidRef.current;
    if (v && playing) v.play().catch(() => {});
  }, [playing, vidSrc]);

  // 좋아요(영속) · 사용수/좋아요수(안정적 의사 수치)
  const [liked, setLiked] = useState(false);
  useEffect(() => { setLiked(!!loadLikes()[it.id]); }, [it.id]);
  const uses = usageCount(it.id);
  const likes = baseLikes(it.id) + (liked ? 1 : 0);
  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLiked((v) => { const n = !v; setLike(it.id, n); return n; });
  };
  const onDownload = (e: React.MouseEvent) => { e.stopPropagation(); void downloadItem(it); };
  const showActions = hovered || picked || selecting;

  // 카드 대표 이미지 — 영상=포스터, 이미지=구운 썸네일, 웹=대표 이미지(og:image).
  // 웹 링크는 thumb가 있으면 풀스크린과 같은 이미지를 카드에 꽉 채우고, 없을 때만 파비콘.
  const webThumb = it.assetKind === 'web' ? it.thumb : undefined;
  const mainImg = isVideo ? poster : isImage ? thumbSrc : webThumb;

  return (
    <button
      ref={ref}
      className="kv-galcard"
      onClick={onOpen}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ width: '100%', display: 'block', textAlign: 'left', padding: 0, border: picked ? `2px solid ${a}` : `1px solid ${C.line}`, borderRadius: 16, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', boxShadow: picked ? `0 0 0 3px ${a}33, ${C.shadow1}` : C.shadow1, transition: 'transform .15s, border-color .15s, box-shadow .15s' }}
    >
      <div style={{ position: 'relative', aspectRatio: natRatio ?? it.ratio, background: C.thumb, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {mainImg ? (
          <img src={mainImg} alt={it.t} draggable={false} loading="lazy" decoding="async" onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setNatRatio(im.naturalWidth / im.naturalHeight); }} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'auto' }} />
        ) : it.assetKind === 'web' && faviconOf(it.href) ? (
          <img src={faviconOf(it.href)} alt="" width={44} height={44} style={{ borderRadius: 10 }} />
        ) : isVideo || (isImage && it.thumb) ? (
          // 자산 이미지이지만 썸네일 준비 전(또는 화면 밖) — 자리만 잡는 옅은 면
          <Icon size={36} color={C.line} strokeWidth={1.5} />
        ) : (
          <Icon size={40} color={a} strokeWidth={1.7} />
        )}
        {/* 호버 인라인 재생 — 포스터 위에 덮어 그린다(음소거·반복) */}
        {isVideo && vidSrc && (
          <video
            ref={vidRef}
            src={vidSrc}
            muted
            loop
            playsInline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: playing ? 1 : 0, transition: 'opacity .15s' }}
          />
        )}
        {/* 재생 배지 — 재생 중에는 숨긴다 */}
        {isVideo && !playing && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <span style={{ width: 46, height: 46, borderRadius: 999, background: a, display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px rgba(20,19,17,.3)', border: '2px solid rgba(255,255,255,.85)' }}>
              <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
            </span>
          </span>
        )}
        <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 700, color: a, background: '#fff', borderRadius: 999, padding: '3px 9px', boxShadow: C.shadow1, opacity: showActions ? 0 : 1, transition: 'opacity .15s' }}>{it.cat}</span>
        {/* 선택 체크박스 — 호버/선택 시 좌상단(배지 자리) */}
        <span
          role="button"
          title={picked ? '선택 해제' : '선택'}
          onClick={(e) => { e.stopPropagation(); onTogglePick(); }}
          style={{ position: 'absolute', top: 10, left: 10, width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer', background: picked ? a : 'rgba(255,255,255,.92)', border: picked ? `2px solid ${a}` : `1.5px solid ${C.line}`, boxShadow: C.shadow1, opacity: showActions ? 1 : 0, transition: 'opacity .15s', zIndex: 3 }}
        >
          {picked && <Check size={15} color="#fff" strokeWidth={3} />}
        </span>
        {/* 마이보드로 보내기 — 호버 시 우상단(코랄, 선택 자료가 있으면 선택분 전체) */}
        <span
          className="kv-galmax"
          role="button"
          title={selecting ? '선택한 자료를 마이보드로 보내기' : '이 자료를 마이보드로 보내기'}
          onClick={(e) => { e.stopPropagation(); onSendToBoard(); }}
          style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, background: a, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: C.shadow1, zIndex: 3 }}
        >
          <LayoutGrid size={15} />
        </span>
        {/* 호버 시 — 삭제(삭제 가능 자료만) + 다운로드 + 확대 */}
        {onDelete && (
          <span
            className="kv-galmax"
            role="button"
            title="삭제"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ position: 'absolute', top: 10, right: 78, width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', color: '#D8442F', boxShadow: C.shadow1 }}
          >
            <Trash2 size={14} />
          </span>
        )}
        <span
          className="kv-galmax"
          role="button"
          title="다운로드"
          onClick={onDownload}
          style={{ position: 'absolute', top: 10, right: 44, width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', color: C.ink, boxShadow: C.shadow1 }}
        >
          <Download size={14} />
        </span>
        <span className="kv-galmax" style={{ position: 'absolute', top: 10, right: 112, width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', color: C.ink }}><Maximize2 size={14} /></span>
      </div>
      <div style={{ padding: '11px 14px 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.35 }}>{it.t}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{it.sub}</div>
        {/* 상시 표시 — 사용수 · 좋아요 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 9, fontSize: 12, color: C.muted }}>
          <span title="사용 횟수" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Wand2 size={13} color={C.muted} /> {uses.toLocaleString()}
          </span>
          <span
            role="button"
            title={liked ? '좋아요 취소' : '좋아요'}
            onClick={toggleLike}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: liked ? a : C.muted, cursor: 'pointer', fontWeight: liked ? 700 : 400, marginLeft: 'auto' }}
          >
            <Heart size={13} color={liked ? a : C.muted} fill={liked ? a : 'none'} /> {likes.toLocaleString()}
          </span>
        </div>
      </div>
    </button>
  );
}

function GalleryRow({ it, onOpen, onDelete }: { it: GalleryItem; onOpen: () => void; onDelete?: () => void }) {
  const a = C.coral;
  const Icon = it.icon;
  const isImage = it.assetKind === 'image';
  const { ref, inView } = useInView<HTMLButtonElement>();
  const [thumbSrc, setThumbSrc] = useState<string | undefined>();
  useEffect(() => {
    if (!inView || !isImage || !it.thumb) return;
    let alive = true;
    void getThumb(it.id, it.thumb).then((t) => { if (alive) setThumbSrc(t); });
    return () => { alive = false; };
  }, [inView, isImage, it.thumb, it.id]);
  // 이미지는 작은 썸네일, 영상/웹의 thumb(포스터/없음)은 그대로.
  const rowImg = isImage ? thumbSrc : it.thumb;
  return (
    <button
      ref={ref}
      className="kv-galcard"
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: 10, border: `1px solid ${C.line}`, borderRadius: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', boxShadow: C.shadow1, transition: 'transform .15s, border-color .15s, box-shadow .15s' }}
    >
      <div style={{ position: 'relative', width: 58, height: 58, borderRadius: 12, background: C.thumb, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {rowImg ? (
          <img src={rowImg} alt={it.t} draggable={false} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : it.assetKind === 'web' && faviconOf(it.href) ? (
          <img src={faviconOf(it.href)} alt="" width={24} height={24} style={{ borderRadius: 6 }} />
        ) : (
          <Icon size={24} color={a} strokeWidth={1.8} />
        )}
        {it.assetKind === 'video' && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <span style={{ width: 24, height: 24, borderRadius: 999, background: a, display: 'grid', placeItems: 'center', border: '1.5px solid rgba(255,255,255,.85)' }}>
              <Play size={11} color="#fff" fill="#fff" style={{ marginLeft: 1 }} />
            </span>
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.t}</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{it.cat} · {it.sub}</div>
      </div>
      {onDelete && (
        <span
          role="button"
          title="삭제"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, color: '#D8442F' }}
        >
          <Trash2 size={15} />
        </span>
      )}
      <Maximize2 size={16} color={C.muted} style={{ flexShrink: 0, marginRight: 6 }} />
    </button>
  );
}

function GalleryViewer({ item, onClose, onAction }: { item: GalleryItem; onClose: () => void; onAction: (m: string) => void }) {
  const a = C.coral;
  const Icon = item.icon;
  // 동영상 뷰어 — 실제 mp4를 IDB에서 읽어 원본 크기로 재생(없으면 포스터 폴백).
  const [viewerVideo, setViewerVideo] = useState<string | undefined>();
  useEffect(() => {
    if (item.assetKind !== 'video') return;
    let alive = true;
    void loadVideoSrc(item.videoAssetId).then((src) => { if (alive) setViewerVideo(src); });
    return () => { alive = false; };
  }, [item.assetKind, item.videoAssetId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const actions: Array<{ label: string; icon: LucideIcon; primary?: boolean; msg: string }> = [
    { label: '내 자료로 적용', icon: Wand2, primary: true, msg: `‘${item.t}’을(를) 내 자료로 적용했어요` },
    { label: '공유', icon: Share2, msg: '공유 링크를 복사했어요' },
    { label: '저장', icon: Bookmark, msg: '내 보관함에 저장했어요' },
    { label: '다운로드', icon: Download, msg: '다운로드를 시작했어요' },
  ];
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(20,19,17,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', background: C.bg, borderRadius: 20, width: 'min(1040px, 100%)', height: 'min(86vh, 760px)', display: 'flex', flexDirection: 'row', overflow: 'hidden', boxShadow: C.shadow2 }}>
        {/* large preview — 동영상은 실제 mp4를 원본 크기로 바로 재생, 그 외는 썸네일/포스터, mock은 종이 카드 */}
        <div style={{ flex: 1, minHeight: 0, background: item.assetKind === 'video' ? '#000' : C.thumb, display: 'grid', placeItems: 'center', padding: item.assetKind === 'video' ? 0 : 30, overflow: 'hidden' }}>
          {item.assetKind === 'video' ? (
            <video
              src={viewerVideo}
              poster={item.thumb}
              controls
              autoPlay
              loop
              playsInline
              style={{ maxHeight: '100%', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain', background: '#000' }}
            />
          ) : item.thumb ? (
            <div style={{ position: 'relative', maxHeight: '100%', maxWidth: '100%', display: 'grid', placeItems: 'center' }}>
              <img src={item.thumb} alt={item.t} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: C.shadow2 }} />
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: C.shadow2, aspectRatio: item.ratio, maxHeight: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '26px 30px', boxSizing: 'border-box' }}>
              <div style={{ width: 70, height: 70, borderRadius: 18, background: a, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={32} color="#fff" strokeWidth={1.8} /></div>
              <div style={{ fontWeight: 700, fontSize: 17, textAlign: 'center', color: C.ink, lineHeight: 1.35 }}>{item.t}</div>
              <div style={{ width: '76%', display: 'flex', flexDirection: 'column', gap: 7, marginTop: 2 }}>
                {[100, 86, 94, 72, 90].map((w, i) => <div key={i} style={{ height: 6, borderRadius: 4, background: C.line, width: `${w}%` }} />)}
              </div>
            </div>
          )}
        </div>
        {/* info + actions */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${C.line}`, padding: 26, display: 'flex', flexDirection: 'column', gap: 14, background: '#fff' }}>
          <div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: a, background: `${a}14`, borderRadius: 999, padding: '4px 11px' }}>{item.cat}</span>
            <div style={{ fontWeight: 700, fontSize: 20, marginTop: 12, lineHeight: 1.3 }}>{item.t}</div>
            <div style={{ color: C.muted, fontSize: 13.5, marginTop: 6 }}>{item.sub}</div>
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>교사용으로 바로 적용하거나, 우리 학급에 맞게 편집해 사용할 수 있어요.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            {actions.map((ac) => {
              const AcIcon = ac.icon;
              return (
                <button
                  key={ac.label}
                  onClick={() => onAction(ac.msg)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, border: ac.primary ? 'none' : `1px solid ${C.line}`, background: ac.primary ? a : '#fff', color: ac.primary ? '#fff' : C.ink, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, boxShadow: ac.primary ? `0 8px 20px ${a}44` : 'none' }}
                >
                  <AcIcon size={16} color={ac.primary ? '#fff' : a} /> {ac.label}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={onClose} title="닫기" style={{ position: 'absolute', top: 14, right: 14, width: 38, height: 38, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.9)', cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: C.shadow1 }}><X size={18} color={C.ink} /></button>
      </div>
    </div>,
    document.body,
  );
}

export function GalleryPage() {
  const a = C.coral;
  const [cat, setCat] = useState('전체');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sel, setSel] = useState<GalleryItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ai, setAi] = useState<{ label: string; ids: string[] } | null>(null);
  const [dynItems, setDynItems] = useState<GalleryItem[]>([]);
  const [gameItems, setGameItems] = useState<GalleryItem[]>([]);
  const [playDocId, setPlayDocId] = useState<string | null>(null);
  const [iHomeOpen, setIHomeOpen] = useState(false); // 게임 '홈' → 인터랙티브 홈(저장 게임 목록·추천)
  const [picked, setPicked] = useState<Set<string>>(() => new Set()); // 다중 선택(자료 id) — 마이보드로 보내기
  const navigate = useNavigate();

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  // 보관함(이미지·도안·동영상 + 웹 링크) 자동 로드 → 갤러리에 자산 카드로 표시.
  // 페이지 셸·기본 자료가 먼저 그려지도록 비긴급(startTransition) 업데이트로 둔다.
  useEffect(() => {
    let alive = true;
    void Promise.all([listAssets(), listWebLinks()])
      .then(([assets, links]) => {
        if (alive) startTransition(() => setDynItems(buildArchiveItems(assets, links)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 인터랙티브 게임 자동 로드(생성 게임이 계속 리스트). 방문 시 + 게임 저장 이벤트에 갱신.
  useEffect(() => {
    const refresh = () => setGameItems(buildGameItems(listLibrary()));
    refresh();
    window.addEventListener('kv:game-saved', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('kv:game-saved', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // prompt bar drives the gallery: a prompt → gather matching resources into an "AI" filter
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.tab === 'doc') { setCat('전체'); setQ(''); setAi({ label: d.text, ids: galHeuristic(d.text) }); }
    };
    window.addEventListener('kv:prompt', h);
    return () => window.removeEventListener('kv:prompt', h);
  }, []);

  // 게임 → 실제 보관함 자산 → mock 데모 자료 순.
  const allItems = useMemo(() => [...gameItems, ...dynItems, ...GALLERY_ITEMS], [gameItems, dynItems]);

  // 카드 클릭 — 게임이면 플레이 오버레이, 그 외엔 자료 뷰어.
  const openItem = (it: GalleryItem) => { if (it.gameDocId) setPlayDocId(it.gameDocId); else setSel(it); };

  // 호버 삭제 — 종류별로 보관함에서 제거하고 목록을 갱신. (게임은 라이브러리 목록에서만, 문서는 보드에 남음.)
  const deleteItem = (it: GalleryItem) => {
    const d = it.del;
    if (!d) return;
    // 게임은 목록에서만 빼므로(문서·보드는 유지) 확인 없이, 자산·웹은 영구 삭제라 확인.
    if (d.type !== 'game' && typeof window !== 'undefined' && !window.confirm(`'${it.t}'을(를) 보관함에서 삭제할까요?`)) return;
    void (async () => {
      if (d.type === 'game') {
        removeFromLibrary(d.docId);
        removeGameCard(d.docId); // 교사 활동 카드 동반 정리
        setGameItems(buildGameItems(listLibrary())); // 라이브러리(정본)에서 다시 빌드 → 확실히 사라짐
      } else if (d.type === 'asset') {
        await removeAsset(d.tag, d.createdAt, d.kind);
        setDynItems((x) => x.filter((y) => y.id !== it.id));
      } else if (d.type === 'web') {
        await removeWebLink(d.url);
        setDynItems((x) => x.filter((y) => y.id !== it.id));
      }
      setToast(`'${it.t}'을(를) 갤러리에서 지웠어요`);
    })();
  };

  const togglePick = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearPick = () => setPicked(new Set());
  // 선택(또는 단일) 자료를 보드 '임시 트레이'에 담고 보드로 이동 — 사용자가 원하는 위치에 직접 배치.
  const sendToBoard = (ids: string[]) => {
    const trayItems = allItems
      .filter((it) => ids.includes(it.id) && it.thumb)
      .map((it) => ({ id: it.id, src: it.thumb!, title: it.t, ratio: it.ratio }));
    if (!trayItems.length) { setToast('보드로 보낼 이미지가 없어요'); return; }
    useTrayStore.getState().add(trayItems);
    clearPick();
    setToast(`${trayItems.length}개를 보드 임시 자료함에 담았어요`);
    navigate('/board');
  };
  const sendToBoardSmart = (it: GalleryItem) => sendToBoard(picked.size > 0 ? [...picked] : [it.id]);

  const exitAi = () => setAi(null);
  const items = ai
    ? allItems.filter((i) => ai.ids.includes(i.id))
    : allItems.filter((i) => (cat === '전체' || i.cat === cat) && (!q.trim() || i.t.includes(q.trim()) || i.sub.includes(q.trim()) || i.cat.includes(q.trim())));

  const chip = (on: boolean): React.CSSProperties => ({ padding: '8px 15px', borderRadius: 999, border: `1px solid ${on ? a : C.line}`, background: on ? a : '#fff', color: on ? '#fff' : C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 });
  const vbtn = (on: boolean): React.CSSProperties => ({ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 10, border: `1px solid ${on ? a : C.line}`, background: on ? `${a}14` : '#fff', color: on ? a : C.muted, cursor: 'pointer', flexShrink: 0 });

  return (
    <div style={{ paddingBottom: 4 }}>
      <PageHero
        eyebrow="자산 라이브러리"
        title="갤러리"
        description="분류·기억 엔진이 정리한 사진과 자산. 동의된 사진만 파이프라인에 포함됩니다."
      />

      {/* toolbar: category filters + search + view toggle (sticky) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: C.bg, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 28px', flexWrap: 'wrap' }}>
        <div className="kv-gallery" style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1, minWidth: 0, paddingBottom: 2 }}>
          {GALLERY_CATS.map((c, idx) =>
            idx === 0 && ai ? (
              <button key="ai" onClick={exitAi} title="AI 추천 해제" style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Sparkles size={13} /> AI 추천 · {ai.ids.length}
              </button>
            ) : (
              <button key={c} onClick={() => { setAi(null); setCat(c); }} style={chip(!ai && c === cat)}>{c}</button>
            ),
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 999, padding: '8px 14px', minWidth: 190 }}>
            <Search size={16} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="자료 검색" style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: C.ink, width: '100%', minWidth: 0 }} />
          </div>
          <button title="그리드 보기" onClick={() => setView('grid')} style={vbtn(view === 'grid')}><LayoutGrid size={18} /></button>
          <button title="목록 보기" onClick={() => setView('list')} style={vbtn(view === 'list')}><List size={18} /></button>
        </div>
      </div>

      {/* AI gather banner */}
      {ai && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 28px 6px', padding: '10px 14px', borderRadius: 12, background: `${a}10`, border: `1px solid ${a}33`, fontSize: 13.5 }}>
          <Sparkles size={16} color={a} style={{ flexShrink: 0 }} />
          <span style={{ color: C.ink, fontWeight: 600 }}>‘{ai.label}’</span>
          <span style={{ color: C.muted }}>에 어울리는 자료 {ai.ids.length}개를 모았어요</span>
          <button onClick={exitAi} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>전체 보기</button>
        </div>
      )}

      {/* gallery */}
      <div style={{ padding: '6px 28px 130px' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.muted, marginTop: 80, fontSize: 14 }}>{ai ? `‘${ai.label}’에 어울리는 자료를 찾지 못했어요.` : `‘${q || cat}’에 해당하는 자료가 없어요.`}</div>
        ) : view === 'grid' ? (
          <MasonryGrid items={items} onOpen={openItem} onDelete={deleteItem} picked={picked} onTogglePick={togglePick} onSendToBoard={sendToBoardSmart} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 880, margin: '0 auto' }}>
            {items.map((it) => <GalleryRow key={it.id} it={it} onOpen={() => openItem(it)} onDelete={it.del ? () => deleteItem(it) : undefined} />)}
          </div>
        )}
      </div>

      {/* 선택 자료 일괄 작업 바 — 마이보드로 보내기 / 선택 해제 */}
      {picked.size > 0 && (
        <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px 10px 18px', borderRadius: 999, background: a, color: '#fff', boxShadow: '0 12px 32px rgba(20,19,17,.28)' }}>
          <Check size={16} />
          <span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' }}>{picked.size}개 선택됨</span>
          <button onClick={() => sendToBoard([...picked])} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: a, border: 'none', borderRadius: 999, padding: '8px 15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, whiteSpace: 'nowrap' }}>
            <LayoutGrid size={15} /> 마이보드로 보내기
          </button>
          <button onClick={clearPick} title="선택 해제" style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, background: 'rgba(255,255,255,.18)', color: '#fff', border: 'none', borderRadius: 999, cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}
      {sel && <GalleryViewer item={sel} onClose={() => setSel(null)} onAction={(m) => setToast(m)} />}
      {/* 게임 카드 클릭 → 플레이 오버레이(인터랙티브 홈과 동일 경로). */}
      {playDocId && (
        <ZoomOverlay origin={null} onClose={() => setPlayDocId(null)} zIndex={150} backdropClassName="">
          {(close) => (
            <InteractiveOverlay
              docId={playDocId}
              initialMode="play"
              onClose={close}
              onExit={() => setPlayDocId(null)}
              onHome={() => { setPlayDocId(null); setIHomeOpen(true); }}
            />
          )}
        </ZoomOverlay>
      )}
      {/* 인터랙티브 홈(저장 게임 목록·추천) — 게임 '홈' 버튼에서 진입. 자기완결 포털. */}
      {iHomeOpen && <InteractiveGallery onClose={() => setIHomeOpen(false)} />}
      {toast && createPortal(
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: C.ink, color: '#fff', padding: '11px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, boxShadow: C.shadow2, display: 'flex', alignItems: 'center', gap: 8 }}><Check size={15} color={C.coral} /> {toast}</div>,
        document.body,
      )}
    </div>
  );
}
