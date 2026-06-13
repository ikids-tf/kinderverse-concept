import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PageHero } from '@/components/PageHero';
import {
  NotebookPen, Palette, Shapes, BookOpen, Image as ImageIcon, Tag, Sparkles,
  Cake, FileStack, FileText, Search, LayoutGrid, List, Maximize2, Wand2,
  Share2, Bookmark, Download, X, Check, Video, Play, Link as LinkIcon, type LucideIcon,
} from 'lucide-react';
import { listAssets, type ImageAsset } from '@/board/assets';
import { listWebLinks, type WebLink } from '@/board/webLinks';

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

const GALLERY_CATS = ['전체', '도안', '동영상', '웹링크', '활동지', '스토리북', '포스터', '명찰', '환경꾸미기', '놀이기록', '템플릿'];

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

function GalleryCard({ it, onOpen }: { it: GalleryItem; onOpen: () => void }) {
  const a = C.coral;
  const Icon = it.icon;
  return (
    <button
      className="kv-galcard"
      onClick={onOpen}
      style={{ breakInside: 'avoid', marginBottom: 16, width: '100%', display: 'block', textAlign: 'left', padding: 0, border: `1px solid ${C.line}`, borderRadius: 16, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', boxShadow: C.shadow1, transition: 'transform .15s, border-color .15s, box-shadow .15s' }}
    >
      <div style={{ position: 'relative', aspectRatio: it.ratio, background: C.thumb, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {it.thumb ? (
          <img src={it.thumb} alt={it.t} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : it.assetKind === 'web' && faviconOf(it.href) ? (
          <img src={faviconOf(it.href)} alt="" width={44} height={44} style={{ borderRadius: 10 }} />
        ) : (
          <Icon size={40} color={a} strokeWidth={1.7} />
        )}
        {it.assetKind === 'video' && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <span style={{ width: 46, height: 46, borderRadius: 999, background: a, display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px rgba(20,19,17,.3)', border: '2px solid rgba(255,255,255,.85)' }}>
              <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
            </span>
          </span>
        )}
        <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 700, color: a, background: '#fff', borderRadius: 999, padding: '3px 9px', boxShadow: C.shadow1 }}>{it.cat}</span>
        <span className="kv-galmax" style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', color: C.ink }}><Maximize2 size={14} /></span>
      </div>
      <div style={{ padding: '11px 14px 14px' }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.35 }}>{it.t}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{it.sub}</div>
      </div>
    </button>
  );
}

function GalleryRow({ it, onOpen }: { it: GalleryItem; onOpen: () => void }) {
  const a = C.coral;
  const Icon = it.icon;
  return (
    <button
      className="kv-galcard"
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: 10, border: `1px solid ${C.line}`, borderRadius: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', boxShadow: C.shadow1, transition: 'transform .15s, border-color .15s, box-shadow .15s' }}
    >
      <div style={{ position: 'relative', width: 58, height: 58, borderRadius: 12, background: C.thumb, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {it.thumb ? (
          <img src={it.thumb} alt={it.t} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
      <Maximize2 size={16} color={C.muted} style={{ flexShrink: 0, marginRight: 6 }} />
    </button>
  );
}

function GalleryViewer({ item, onClose, onAction }: { item: GalleryItem; onClose: () => void; onAction: (m: string) => void }) {
  const a = C.coral;
  const Icon = item.icon;
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
        {/* large preview — 실제 자산은 썸네일/포스터, mock은 종이 카드 */}
        <div style={{ flex: 1, minHeight: 0, background: C.thumb, display: 'grid', placeItems: 'center', padding: 30, overflow: 'hidden' }}>
          {item.thumb ? (
            <div style={{ position: 'relative', maxHeight: '100%', maxWidth: '100%', display: 'grid', placeItems: 'center' }}>
              <img src={item.thumb} alt={item.t} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: C.shadow2 }} />
              {item.assetKind === 'video' && (
                <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                  <span style={{ width: 64, height: 64, borderRadius: 999, background: a, display: 'grid', placeItems: 'center', boxShadow: '0 8px 22px rgba(20,19,17,.35)', border: '3px solid rgba(255,255,255,.85)' }}>
                    <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
                  </span>
                </span>
              )}
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

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  // 보관함(이미지·도안·동영상 + 웹 링크) 자동 로드 → 갤러리에 자산 카드로 표시.
  useEffect(() => {
    let alive = true;
    void Promise.all([listAssets(), listWebLinks()])
      .then(([assets, links]) => { if (alive) setDynItems(buildArchiveItems(assets, links)); })
      .catch(() => {});
    return () => { alive = false; };
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

  // 실제 보관함 자산을 앞에, mock 데모 자료를 뒤에 둔다.
  const allItems = useMemo(() => [...dynItems, ...GALLERY_ITEMS], [dynItems]);

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
          <div style={{ columns: '228px', columnGap: 16 }}>
            {items.map((it) => <GalleryCard key={it.id} it={it} onOpen={() => setSel(it)} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 880, margin: '0 auto' }}>
            {items.map((it) => <GalleryRow key={it.id} it={it} onOpen={() => setSel(it)} />)}
          </div>
        )}
      </div>

      {sel && <GalleryViewer item={sel} onClose={() => setSel(null)} onAction={(m) => setToast(m)} />}
      {toast && createPortal(
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: C.ink, color: '#fff', padding: '11px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, boxShadow: C.shadow2, display: 'flex', alignItems: 'center', gap: 8 }}><Check size={15} color={C.coral} /> {toast}</div>,
        document.body,
      )}
    </div>
  );
}
