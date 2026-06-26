import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Upload, FolderPlus, X, Trash2, Folder, Check, Images, Film, Music, FileText, ChevronLeft, ChevronRight, Download, Frame, Archive, Play, Link2, ExternalLink } from 'lucide-react';
import { PageHero } from '@/components/PageHero';
import { useFolderStore, savedFileCount, type SavedFolder, type SavedFile, type BoardSnap } from '@/store/folderStore';
import { useBoardStore } from '@/store/boardStore';
import { listAssets, type ImageAsset } from '@/board/assets';
import { listWebLinks, type WebLink } from '@/board/webLinks';
import { getVideoAsset } from '@/board/videoAssets';
import { showToast } from '@/lib/toast';

/* ---------------- Folder Vault (자료보관함) ----------------
   File/material storage: upload files, create & remove folders, and
   multi-select files for bulk delete. Local state only (prototype).
   Ported 1:1 from the kinderVerse-2027 reference (inline-style + lucide). */

/* Milray Park light palette — hex values mirror src/styles/tokens.css 1:1. */
const C = {
  ink: '#141311',
  muted: '#8C887F',
  line: '#E7E0D4',
  coral: '#F2733E',
  fill2: 'rgba(40,33,24,.06)',
  shadow1: '0 8px 24px rgba(40,33,24,.06)',
};

const pageBody: React.CSSProperties = { padding: '0 28px 130px' };

type FileType = 'image' | 'video' | 'audio' | 'doc';
type FolderItem = { id: number; name: string; count: number };
type FileItem = { id: number; name: string; type: FileType; size: string };

/* ── 저장 폴더(프레임 트리) 파일 다운로드 — 확장자대로 실제 파일을 만든다 ──
   이미지(.jpg) = canvas로 JPEG 재인코딩(실패 시 원본 그대로) · 메모(.txt) = 평문
   Blob · 문서(.pdf) = 마크다운을 A4 인쇄 레이아웃으로 렌더한 숨김 iframe을
   인쇄(브라우저 'PDF로 저장')한다. */

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadNoteTxt(f: SavedFile) {
  downloadBlob(f.name, new Blob([f.content], { type: 'text/plain;charset=utf-8' }));
}

async function downloadImageJpg(f: SavedFile) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = f.content;
    });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth || 800;
    cv.height = img.naturalHeight || 600;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#fff'; // JPEG엔 알파가 없다 — 투명 영역은 흰색으로
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/jpeg', 0.92);
    a.download = f.name;
    a.click();
  } catch {
    // CORS 등으로 재인코딩 불가 — 원본 포맷 그대로 내려받기
    const a = document.createElement('a');
    a.href = f.content;
    a.download = f.name;
    a.click();
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 문서 마크다운 → 인쇄용 HTML(제목·굵게·목록·표만 — 계획안/통신문에 충분). */
function mdToHtml(md: string): string {
  const inline = (s: string) => escHtml(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\s*-{3,}\s*$/.test(ln)) {
      out.push('<hr/>');
      i++;
      continue;
    }
    if (/^\s*>\s?/.test(ln)) {
      // 인용 블록(운영 시 유의점 등) — 연속 > 행을 하나의 blockquote로
      const qs: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        qs.push(`<p>${inline(lines[i].replace(/^\s*>\s?/, ''))}</p>`);
        i++;
      }
      out.push(`<blockquote>${qs.join('')}</blockquote>`);
      continue;
    }
    if (/^\s*\|/.test(ln)) {
      // 표 블록 — | 행들을 모아 <table>로(|---| 구분행은 건너뜀)
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s\-:|]+\|\s*$/.test(lines[i])) {
          rows.push(lines[i].replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()));
        }
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        '<table><thead><tr>' + (head ?? []).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>',
      );
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(ln);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (/^\s*[-·]\s+/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-·]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-·]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    } else if (ln.trim()) out.push(`<p>${inline(ln)}</p>`);
    i++;
  }
  return out.join('\n');
}

function printDocPdf(f: SavedFile) {
  const title = f.name.replace(/\.pdf$/i, '');
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
    @page { size: A4; margin: 18mm; }
    body { font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; color: #141311; line-height: 1.65; font-size: 12.5px; }
    h1 { font-size: 21px; margin: 0 0 12px; } h2 { font-size: 15px; margin: 18px 0 8px; } h3 { font-size: 13.5px; margin: 14px 0 6px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    th, td { border: 1px solid #d8d2c6; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 11.5px; }
    th { background: #f4ede3; }
    ul { margin: 6px 0; padding-left: 18px; } p { margin: 6px 0; }
    hr { border: 0; border-top: 1px dashed #d8d2c6; margin: 12px 0; }
    blockquote { margin: 10px 0; padding: 9px 12px; background: #fbefe4; border-left: 3px solid #F2733E; border-radius: 6px; }
    blockquote p { margin: 3px 0; }
  </style></head><body>${mdToHtml(f.content)}</body></html>`);
  doc.close();
  // 렌더 완료 후 인쇄 다이얼로그(대상: 'PDF로 저장') → 끝나면 iframe 제거
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 120);
}

function downloadSavedFile(f: SavedFile) {
  if (f.type === 'board' || f.type === 'embed') return; // 보드 스냅샷·뷰어는 보기 전용
  if (f.type === 'image') void downloadImageJpg(f);
  else if (f.type === 'note') downloadNoteTxt(f);
  else printDocPdf(f);
}

/** 임베드 뷰어를 NodeView와 동일하게 복원 — 로드된 미디어(embedSrc)가 있으면 ?src=, 없으면 ?title=. */
function embedViewerSrc(f: SavedFile): string {
  const base = f.content || '/video-player.html';
  const sep = base.includes('?') ? '&' : '?';
  if (f.embedSrc) return `${base}${sep}src=${encodeURIComponent(f.embedSrc)}`;
  return `${base}${sep}title=${encodeURIComponent(f.name)}`;
}

/** 임베드 종류 — 동영상 계열인지(아이콘·라벨용). */
function isVideoEmbed(content: string): boolean {
  return /video-player|youtube|magic-viewer/.test(content);
}

/** 대략적 파일 크기 라벨(컨텐츠 기준 — 원격 이미지는 표기 생략). */
function sizeLabel(f: SavedFile): string {
  if (f.type === 'board') return '보드 스냅샷';
  if (f.type === 'embed') return isVideoEmbed(f.content) ? '동영상' : '뷰어';
  if (f.type === 'image' && !f.content.startsWith('data:')) return 'JPG';
  const bytes = f.content.startsWith('data:')
    ? Math.round((f.content.length * 3) / 4)
    : new Blob([f.content]).size;
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ── 미리보기 렌더러 ─────────────────────────────────────────────────────────
   문서/보드 스냅샷을 카드 썸네일과 풀스크린 뷰어가 공유한다. 문서 마크다운은
   mdToHtml(자체 이스케이프)로 변환해 그대로 그린다. */

const SNAP_DOC_CSS = `
.kv-snapdoc { font-family: var(--font-sans, 'Pretendard', sans-serif); color: #141311; }
.kv-snapdoc h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
.kv-snapdoc h2 { font-size: 13.5px; font-weight: 700; margin: 12px 0 6px; }
.kv-snapdoc h3 { font-size: 12.5px; font-weight: 700; margin: 10px 0 5px; }
.kv-snapdoc p { font-size: 11.5px; line-height: 1.6; margin: 4px 0; }
.kv-snapdoc ul { font-size: 11.5px; line-height: 1.6; margin: 4px 0; padding-left: 16px; }
.kv-snapdoc table { border-collapse: collapse; width: 100%; margin: 6px 0; }
.kv-snapdoc th, .kv-snapdoc td { border: 1px solid #E7E0D4; padding: 4px 6px; font-size: 10.5px; text-align: left; vertical-align: top; }
.kv-snapdoc th { background: #F4EDE3; }
.kv-snapdoc hr { border: 0; border-top: 1px dashed #E0D9CC; margin: 10px 0; }
.kv-snapdoc blockquote { margin: 8px 0; padding: 8px 10px; background: #FBEFE4; border-left: 3px solid #F2733E; border-radius: 6px; }
.kv-snapdoc blockquote p { margin: 2px 0; }
.kv-docview { font-family: var(--font-sans, 'Pretendard', sans-serif); color: #141311; }
.kv-docview h1 { font-size: 26px; font-weight: 700; margin: 0 0 14px; font-family: var(--font-display, serif); }
.kv-docview h2 { font-size: 17px; font-weight: 700; margin: 20px 0 9px; }
.kv-docview h3 { font-size: 15px; font-weight: 700; margin: 16px 0 7px; }
.kv-docview p { font-size: 14px; line-height: 1.7; margin: 7px 0; }
.kv-docview ul { font-size: 14px; line-height: 1.7; margin: 7px 0; padding-left: 20px; }
.kv-docview table { border-collapse: collapse; width: 100%; margin: 10px 0; }
.kv-docview th, .kv-docview td { border: 1px solid #E0D9CC; padding: 8px 10px; font-size: 13px; text-align: left; vertical-align: top; }
.kv-docview th { background: #F4EDE3; }
`;

const MEMO_BG: Record<string, string> = {
  paper: '#fff',
  'accent-soft': 'var(--accent-soft, #FBE8DB)',
  'surface-2': 'var(--surface-2, #F1EAE0)',
};

/** 보드 문서 카드와 똑같은 렌더 — 표지 배너 + kv-doc-md(보드의 편집 디자인 스타일)
    마크다운. 뷰어(원본 크기)와 그리드 썸네일(scale 축소)이 공유한다. */
function DocSheet({ md, cover, width }: { md: string; cover?: string; width: number }) {
  return (
    <div className="kv-doc-md text-sm leading-relaxed text-fg" style={{ width, background: '#fff', borderRadius: 12, padding: 24, boxSizing: 'border-box' }}>
      {cover && (
        <img
          src={cover}
          alt=""
          draggable={false}
          style={{ display: 'block', width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}`, marginBottom: 14 }}
        />
      )}
      <Markdown remarkPlugins={[remarkGfm]}>{md}</Markdown>
    </div>
  );
}

/** embed 뷰어의 포스터 이미지 — 유튜브 watch/embed URL은 썸네일로, 이미지 URL은 그대로.
    그 외(덱 id·iframe 경로 등)는 포스터 없음 → 아이콘 플레이스홀더로 표시(깨진 <img> 방지). */
function embedPoster(src?: string): string | undefined {
  if (!src) return undefined;
  const yt = src.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  if (src.startsWith('data:image') || src.includes('i.ytimg.com') || /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(src)) return src;
  return undefined;
}

/** 저장 당시 보드 모습 — 실측 px 레이아웃을 CSS scale로 통째로 축소(썸네일/뷰어 공용). */
function BoardPreview({ content, maxW, maxH, radius = 12 }: { content: string; maxW: number; maxH: number; radius?: number }) {
  let snap: BoardSnap | null = null;
  try {
    snap = JSON.parse(content) as BoardSnap;
  } catch {
    snap = null;
  }
  if (!snap || !snap.w || !snap.h) return null;
  const k = Math.min(maxW / snap.w, maxH / snap.h);
  return (
    <div style={{ width: Math.round(snap.w * k), height: Math.round(snap.h * k), position: 'relative', overflow: 'hidden', borderRadius: radius, flexShrink: 0 }}>
      <div
        style={{ width: snap.w, height: snap.h, transform: `scale(${k})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0, background: '#FBF7EF', border: `1px solid ${C.line}`, boxSizing: 'border-box' }}
      >
        {snap.nodes.map((n, i) => {
          const box: React.CSSProperties = { position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: 'border-box' };
          if (n.kind === 'frame') {
            return <div key={i} style={{ ...box, border: `1.5px solid ${C.line}`, borderRadius: 12, background: 'rgba(255,255,255,.4)' }} />;
          }
          if (n.kind === 'image') {
            return <img key={i} src={n.src} alt="" style={{ ...box, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.line}` }} />;
          }
          if (n.kind === 'doc') {
            return (
              <div key={i} style={{ ...box, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, overflow: 'hidden' }}>
                {n.cover && (
                  <img src={n.cover} alt="" style={{ display: 'block', width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}`, marginBottom: 10 }} />
                )}
                <div className="kv-snapdoc" dangerouslySetInnerHTML={{ __html: mdToHtml((n.text ?? '').slice(0, 12000)) }} />
              </div>
            );
          }
          if (n.kind === 'embed') {
            const video = isVideoEmbed(n.embed ?? '');
            const poster = embedPoster(n.src);
            return (
              <div key={i} style={{ ...box, background: 'var(--accent-soft, #FBE8DB)', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', display: 'grid', placeItems: 'center', position: 'relative' }}>
                {poster && (
                  <img
                    src={poster}
                    alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                <span style={{ position: 'relative', display: 'grid', placeItems: 'center', gap: 6, textAlign: 'center', padding: poster ? '8px 12px' : 8, background: poster ? 'rgba(20,19,17,.5)' : 'transparent', borderRadius: 12 }}>
                  {video ? <Film size={26} color={poster ? '#fff' : C.coral} /> : <Frame size={26} color={poster ? '#fff' : C.coral} />}
                  <span style={{ fontSize: 12, fontWeight: 700, color: poster ? '#fff' : C.ink, maxWidth: '94%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.text || (video ? '동영상' : '뷰어')}</span>
                </span>
                {video && (
                  <span style={{ position: 'absolute', right: 8, bottom: 8, width: 34, height: 34, borderRadius: 999, background: 'rgba(20,19,17,.5)', display: 'grid', placeItems: 'center' }}>
                    <Play size={15} color="#fff" fill="#fff" />
                  </span>
                )}
              </div>
            );
          }
          const lines = (n.text ?? '').split('\n');
          return (
            <div key={i} style={{ ...box, background: MEMO_BG[n.color ?? 'accent-soft'] ?? MEMO_BG['accent-soft'], borderRadius: 8, padding: 10, overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 3 }}>{lines[0]}</div>
              {lines.length > 1 && (
                <div style={{ fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: '#4D4A44' }}>{lines.slice(1).join('\n')}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FolderPage() {
  const a = C.coral;
  const seq = useRef(100);
  const fileInput = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<FolderItem[]>([
    { id: 1, name: '가을 활동', count: 12 },
    { id: 2, name: '놀이 사진', count: 38 },
    { id: 3, name: '도안 · 학습지', count: 24 },
    { id: 4, name: '음원 · 동요', count: 9 },
  ]);
  const [files, setFiles] = useState<FileItem[]>([
    { id: 11, name: '단풍놀이.jpg', type: 'image', size: '2.4 MB' },
    { id: 12, name: '가정통신문_10월.pdf', type: 'doc', size: '180 KB' },
    { id: 13, name: '가을바람 동요.mp3', type: 'audio', size: '3.1 MB' },
    { id: 14, name: '관찰일지.docx', type: 'doc', size: '92 KB' },
    { id: 15, name: '블록놀이.png', type: 'image', size: '1.8 MB' },
    { id: 16, name: '체조영상.mp4', type: 'video', size: '24 MB' },
    { id: 17, name: '색칠도안.pdf', type: 'doc', size: '320 KB' },
    { id: 18, name: '현장학습.jpg', type: 'image', size: '3.6 MB' },
  ]);
  const [sel, setSel] = useState<Set<number>>(() => new Set());

  // 보드 프레임에서 저장된 폴더 트리 + 드릴인 경로(브레드크럼).
  const saved = useFolderStore((s) => s.saved);
  const removeSaved = useFolderStore((s) => s.removeSavedFolder);
  const [path, setPath] = useState<SavedFolder[]>([]);
  const cur = path.length ? path[path.length - 1] : null;
  // 풀스크린 뷰어 — 파일 클릭 = 바로 보기(다운로드는 뷰어 안 버튼). Esc/배경 클릭으로 닫기.
  // 좌우 화살표(버튼·키보드)로 현재 폴더의 모든 파일을 연속 탐색한다.
  const [viewer, setViewer] = useState<SavedFile | null>(null);
  const curFiles: SavedFile[] = cur ? cur.children.filter((c): c is SavedFile => c.kind === 'file') : [];
  const viewerIdx = viewer ? curFiles.findIndex((f) => f.id === viewer.id) : -1;
  const stepViewer = (d: number) => {
    const next = curFiles[viewerIdx + d];
    if (next) setViewer(next);
  };
  const navigate = useNavigate();
  /** board.board → 마이보드의 원본 프레임으로 점프(선택 + 센터·줌).
      frameId가 없는 구버전 저장본은 '폴더 이름 = 프레임 제목'으로 폴백 매칭. */
  const openOnBoard = (frameId?: string, fallbackTitle?: string) => {
    setViewer(null);
    navigate('/board');
    // 보드 페이지 마운트(lazy route) 후 프레임 포커스 — 삭제됐으면 안내만.
    setTimeout(() => {
      const st = useBoardStore.getState();
      let fid = frameId && st.nodes[frameId]?.type === 'frame' ? frameId : undefined;
      if (!fid && fallbackTitle) {
        fid = Object.values(st.nodes).find(
          (n) => n.type === 'frame' && ((n.data?.title as string) ?? '') === fallbackTitle,
        )?.id;
      }
      if (fid) {
        st.setSelection([fid]);
        st.focusNode(fid);
      } else {
        showToast('보드에서 해당 프레임을 찾을 수 없어요 — 삭제되었을 수 있어요', 'error');
      }
    }, 400);
  };
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      else if (e.key === 'ArrowRight') stepViewer(1);
      else if (e.key === 'ArrowLeft') stepViewer(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── 보관함 — 보드에서 자동 수집된 자산(이미지·도안·생성 동영상 포스터) + 웹 링크 ──
  //    별도 store가 아니라 보드와 공유하는 IDB 보관함(assets.ts·webLinks.ts·videoAssets.ts)을
  //    읽어 보여준다(읽기 전용 집계 — 보드 생성/검색이 곧 이 폴더를 채운다).
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultAssets, setVaultAssets] = useState<ImageAsset[]>([]);
  const [vaultLinks, setVaultLinks] = useState<WebLink[]>([]);
  const [vaultView, setVaultView] = useState<{ kind: 'image' | 'video'; url: string; title: string } | null>(null);
  const loadVault = useCallback(() => {
    void listAssets().then(setVaultAssets);
    void listWebLinks().then(setVaultLinks);
  }, []);
  useEffect(() => { loadVault(); }, [loadVault]);
  const vaultCount = vaultAssets.length + vaultLinks.length;
  // 동영상은 실제 mp4를 클릭 시점에 videoAssets(IDB)에서 로드(포스터는 그리드 썸네일).
  const openVaultVideo = async (asset: ImageAsset) => {
    const mp4 = asset.videoAssetId ? await getVideoAsset(asset.videoAssetId) : undefined;
    if (!mp4) { showToast('동영상을 불러올 수 없어요 — 원본이 삭제되었을 수 있어요', 'error'); return; }
    setVaultView({ kind: 'video', url: mp4, title: asset.tag });
  };
  useEffect(() => {
    if (!vaultView) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVaultView(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vaultView]);

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearSel = () => setSel(new Set());
  const selectAll = () => setSel((s) => (s.size === files.length ? new Set() : new Set(files.map((f) => f.id))));
  const removeSelected = () => { setFiles((fs) => fs.filter((f) => !sel.has(f.id))); clearSel(); };
  const addFolder = () => setFolders((fs) => [...fs, { id: ++seq.current, name: '새 폴더', count: 0 }]);
  const removeFolder = (id: number) => setFolders((fs) => fs.filter((f) => f.id !== id));
  // prompt bar drives the vault: typing a prompt creates a folder with that name
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.tab === 'folder') setFolders((fs) => [...fs, { id: ++seq.current, name: String(d.text).slice(0, 24), count: 0 }]); };
    window.addEventListener('kv:prompt', h);
    return () => window.removeEventListener('kv:prompt', h);
  }, []);
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files || [])];
    if (list.length) {
      const typeOf = (n: string): FileType => (/\.(png|jpe?g|gif|webp)$/i.test(n) ? 'image' : /\.(mp4|mov|webm)$/i.test(n) ? 'video' : /\.(mp3|wav|m4a)$/i.test(n) ? 'audio' : 'doc');
      setFiles((fs) => [...list.map((f) => ({ id: ++seq.current, name: f.name, type: typeOf(f.name), size: (f.size / 1048576).toFixed(1) + ' MB' })), ...fs]);
    }
    e.target.value = '';
  };

  const TypeIcon = ({ type }: { type: FileType }) => {
    const I = type === 'image' ? Images : type === 'video' ? Film : type === 'audio' ? Music : FileText;
    return <I size={26} color={a} opacity={0.75} />;
  };

  const head: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: C.ink, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 };
  const tanBtn: React.CSSProperties = { ...pill, border: `1px solid ${C.line}`, background: '#F4EDE3', color: C.ink };
  const ghostBtn: React.CSSProperties = { ...pill, border: 'none', background: 'transparent', color: C.muted };

  return (
    <div style={{ paddingBottom: 4 }}>
      <style>{SNAP_DOC_CSS}</style>
      {/* ── 풀스크린 뷰어 — 클릭한 파일을 포맷대로 바로 본다(Esc/배경/X로 닫기) ── */}
      {viewer && (
        <div
          onClick={() => setViewer(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,19,17,.8)', display: 'flex', flexDirection: 'column' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {viewer.name}
              {curFiles.length > 1 && (
                <span style={{ marginLeft: 10, fontWeight: 600, fontSize: 12.5, color: 'rgba(255,255,255,.55)' }}>
                  {viewerIdx + 1} / {curFiles.length}
                </span>
              )}
            </span>
            {viewer.type === 'board' ? (
              <button
                onClick={() => openOnBoard(viewer.frameId, cur?.name)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 999, border: 'none', background: a, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
              >
                <Frame size={14} color="#fff" /> 마이보드에서 보기
              </button>
            ) : viewer.type === 'embed' ? null : (
              <button
                onClick={() => downloadSavedFile(viewer)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 999, border: 'none', background: a, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
              >
                <Download size={14} color="#fff" /> 다운로드
              </button>
            )}
            <button
              title="닫기 (Esc)"
              onClick={() => setViewer(null)}
              style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <X size={17} color="#fff" />
            </button>
          </div>
          {/* 좌우 화살표 — 현재 폴더의 모든 파일을 연속 탐색(←/→ 키도 동일) */}
          {curFiles.length > 1 && (
            <>
              <button
                title="이전 자료 (←)"
                disabled={viewerIdx <= 0}
                onClick={(e) => { e.stopPropagation(); stepViewer(-1); }}
                style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(20,19,17,.5)', cursor: viewerIdx <= 0 ? 'default' : 'pointer', display: 'grid', placeItems: 'center', opacity: viewerIdx <= 0 ? 0.3 : 1, zIndex: 1 }}
              >
                <ChevronLeft size={22} color="#fff" />
              </button>
              <button
                title="다음 자료 (→)"
                disabled={viewerIdx >= curFiles.length - 1}
                onClick={(e) => { e.stopPropagation(); stepViewer(1); }}
                style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(20,19,17,.5)', cursor: viewerIdx >= curFiles.length - 1 ? 'default' : 'pointer', display: 'grid', placeItems: 'center', opacity: viewerIdx >= curFiles.length - 1 ? 0.3 : 1, zIndex: 1 }}
              >
                <ChevronRight size={22} color="#fff" />
              </button>
            </>
          )}
          <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: '0 26px 30px' }}>
            {viewer.type === 'image' ? (
              <img src={viewer.content} alt="" style={{ maxWidth: '92%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, background: '#fff' }} />
            ) : viewer.type === 'board' ? (
              <BoardPreview
                content={viewer.content}
                maxW={typeof window !== 'undefined' ? window.innerWidth * 0.86 : 1100}
                maxH={typeof window !== 'undefined' ? window.innerHeight * 0.78 : 680}
              />
            ) : viewer.type === 'embed' ? (
              // 동영상·슬라이드 등 뷰어 — 보드와 똑같은 iframe으로 그 자리에서 재생/본다.
              <iframe
                src={embedViewerSrc(viewer)}
                title={viewer.name}
                style={{ width: 'min(960px, 94vw)', height: 'min(620px, 82vh)', border: 'none', borderRadius: 14, background: '#000', boxShadow: '0 24px 64px rgba(0,0,0,.4)' }}
                allow="autoplay; fullscreen; encrypted-media; clipboard-write"
              />
            ) : viewer.type === 'doc' ? (
              // 보드에서 생성된 모습 그대로 — 표지 배너 + kv-doc-md 편집 디자인.
              <div style={{ maxHeight: '100%', overflowY: 'auto', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,.4)' }}>
                <DocSheet md={viewer.content} cover={viewer.cover} width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth * 0.92 : 720)} />
              </div>
            ) : (
              <div style={{ width: 'min(580px, 94vw)', maxHeight: '100%', overflowY: 'auto', background: '#FBF1E7', borderRadius: 14, padding: '30px 32px', boxShadow: '0 24px 64px rgba(0,0,0,.4)', whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.75, color: C.ink }}>
                {viewer.content}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── 보관함 라이트박스 — 이미지/동영상 바로 보기(Esc·배경·X 닫기) ── */}
      {vaultView && (
        <div
          onClick={() => setVaultView(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,19,17,.8)', display: 'flex', flexDirection: 'column' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vaultView.title}</span>
            <button
              title="닫기 (Esc)"
              onClick={() => setVaultView(null)}
              style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <X size={17} color="#fff" />
            </button>
          </div>
          <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: '0 26px 30px' }}>
            {vaultView.kind === 'image' ? (
              <img src={vaultView.url} alt="" style={{ maxWidth: '92%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, background: '#fff' }} />
            ) : (
              <video src={vaultView.url} controls autoPlay style={{ maxWidth: '92%', maxHeight: '100%', borderRadius: 12, background: '#000' }} />
            )}
          </div>
        </div>
      )}
      <PageHero
        eyebrow="자료 보관함"
        title="자료보관함"
        description={`${folders.length}개 폴더 · ${files.length}개 파일 — 업로드하고 분류해 수업에 바로 활용하세요.`}
      />
      <div style={pageBody}>
      {cur ? (
        /* ── 저장 폴더 드릴인 — 브레드크럼 + 하위 폴더/파일(클릭 = 다운로드) ── */
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 22, flexWrap: 'wrap' }}>
            <button style={ghostBtn} onClick={() => setPath([])}>자료보관함</button>
            {path.map((p, i) => (
              <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight size={14} color={C.muted} />
                <button
                  style={{ ...ghostBtn, color: i === path.length - 1 ? C.ink : C.muted, fontWeight: i === path.length - 1 ? 700 : 600 }}
                  onClick={() => setPath(path.slice(0, i + 1))}
                >
                  {p.name}
                </button>
              </span>
            ))}
          </div>
          {cur.children.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>빈 폴더입니다.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
              {cur.children.map((e) =>
                e.kind === 'folder' ? (
                  <div
                    key={e.id}
                    onClick={() => setPath([...path, e])}
                    className="kv-doc"
                    style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: C.shadow1, display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <span style={{ width: 40, height: 40, borderRadius: 11, background: `${a}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Folder size={20} color={a} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                      <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{savedFileCount(e)}개 항목</div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={e.id}
                    onClick={() => setViewer(e)}
                    title={`${e.name} 보기`}
                    style={{ background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 14, padding: 12, cursor: 'pointer', boxShadow: C.shadow1 }}
                  >
                    {/* 포맷별 실제 미리보기 — 이미지/보드 스냅샷/문서/메모 */}
                    <div style={{ height: 110, borderRadius: 10, background: `${a}08`, display: 'grid', placeItems: 'center', marginBottom: 10, overflow: 'hidden', position: 'relative' }}>
                      {e.type === 'image' ? (
                        <img src={e.content} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                      ) : e.type === 'board' ? (
                        <BoardPreview content={e.content} maxW={150} maxH={106} radius={8} />
                      ) : e.type === 'embed' ? (
                        <div style={{ position: 'absolute', inset: 0, background: 'var(--accent-soft, #FBE8DB)', display: 'grid', placeItems: 'center' }}>
                          <span style={{ width: 44, height: 44, borderRadius: 999, background: 'rgba(20,19,17,.55)', display: 'grid', placeItems: 'center' }}>
                            {isVideoEmbed(e.content) ? <Play size={20} color="#fff" fill="#fff" /> : <Frame size={20} color="#fff" />}
                          </span>
                        </div>
                      ) : e.type === 'doc' ? (
                        <div style={{ position: 'absolute', inset: 0, background: '#fff', overflow: 'hidden' }}>
                          <div style={{ transform: 'scale(0.46)', transformOrigin: 'top left' }}>
                            <DocSheet md={e.content.slice(0, 900)} cover={e.cover} width={340} />
                          </div>
                        </div>
                      ) : (
                        <div style={{ position: 'absolute', inset: 0, background: MEMO_BG['accent-soft'], padding: 10, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, fontSize: 11.5, marginBottom: 3 }}>{e.content.split('\n')[0]}</div>
                          <div style={{ fontSize: 10.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: '#4D4A44' }}>
                            {e.content.split('\n').slice(1).join('\n').slice(0, 160)}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                    <div style={{ color: C.muted, fontSize: 11.5, marginTop: 3 }}>{sizeLabel(e)} · 클릭해 보기</div>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      ) : vaultOpen ? (
        /* ── 보관함 — 보드 자동수집 자료·동영상 + 웹 링크(읽기 전용 집계) ── */
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 22, flexWrap: 'wrap' }}>
            <button style={ghostBtn} onClick={() => setVaultOpen(false)}>자료보관함</button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ChevronRight size={14} color={C.muted} />
              <button style={{ ...ghostBtn, color: C.ink, fontWeight: 700 }}>보관함</button>
            </span>
          </div>
          {vaultCount === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
              보관함이 비어 있어요 — 보드에서 자료·동영상을 만들거나 웹 링크를 검색하면 자동으로 모여요.
            </div>
          ) : (
            <>
              {vaultAssets.length > 0 && (
                <>
                  <div style={head}><span>자료 · 동영상</span><span style={{ fontSize: 12.5, color: C.muted, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>{vaultAssets.length}개</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 30 }}>
                    {vaultAssets.map((it, i) => {
                      const isVideo = it.kind === 'video';
                      return (
                        <div
                          key={`${it.tag}-${it.createdAt}-${i}`}
                          onClick={() => (isVideo ? void openVaultVideo(it) : setVaultView({ kind: 'image', url: it.url, title: it.tag }))}
                          title={`${it.tag} 보기`}
                          style={{ background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 14, padding: 12, cursor: 'pointer', boxShadow: C.shadow1 }}
                        >
                          <div style={{ height: 110, borderRadius: 10, background: `${a}08`, marginBottom: 10, overflow: 'hidden', position: 'relative' }}>
                            <img src={it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                            {isVideo && (
                              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(20,19,17,.18)' }}>
                                <span style={{ width: 40, height: 40, borderRadius: 999, background: 'rgba(20,19,17,.55)', display: 'grid', placeItems: 'center' }}>
                                  <Play size={18} color="#fff" fill="#fff" />
                                </span>
                              </span>
                            )}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.tag}</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 3 }}>{isVideo ? '동영상' : it.kind === '도안' ? '도안' : '이미지'} · 클릭해 보기</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {vaultLinks.length > 0 && (
                <>
                  <div style={head}><span>웹 링크</span><span style={{ fontSize: 12.5, color: C.muted, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>{vaultLinks.length}개</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                    {vaultLinks.map((l, i) => (
                      <a
                        key={`${l.url}-${i}`}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.url}
                        className="kv-doc"
                        style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 12, boxShadow: C.shadow1, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: C.ink }}
                      >
                        <span style={{ width: 44, height: 44, borderRadius: 10, background: `${a}10`, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
                          {l.thumb ? <img src={l.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Link2 size={18} color={a} />}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.domain || l.url}</span>
                            <ExternalLink size={11} color={C.muted} style={{ flexShrink: 0 }} />
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
      {/* action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        <button style={{ ...pill, border: 'none', background: a, color: '#fff' }} onClick={() => fileInput.current?.click()}><Upload size={15} color="#fff" /> 업로드</button>
        <button style={tanBtn} onClick={addFolder}><FolderPlus size={16} color={a} /> 새 폴더</button>
        <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={onUpload} />
        <div style={{ flex: 1 }} />
        {sel.size > 0 && (
          <>
            <span style={{ fontSize: 13, fontWeight: 600, color: a }}>{sel.size}개 선택</span>
            <button style={ghostBtn} onClick={selectAll}>{sel.size === files.length ? '전체 해제' : '전체 선택'}</button>
            <button style={{ ...pill, border: 'none', background: '#C8472E', color: '#fff' }} onClick={removeSelected}><Trash2 size={15} color="#fff" /> 삭제</button>
            <button style={ghostBtn} onClick={clearSel}><X size={15} color={C.muted} /></button>
          </>
        )}
      </div>

      {/* folders */}
      <div style={head}><span>폴더</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 30 }}>
        {/* 보관함 — 보드에서 자동 수집된 자료·동영상·웹 링크(클릭 = 안으로) */}
        <div
          onClick={() => { loadVault(); setVaultOpen(true); }}
          className="kv-doc"
          style={{ position: 'relative', background: '#fff', border: `1.5px solid ${a}55`, borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: C.shadow1, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <span style={{ width: 40, height: 40, borderRadius: 11, background: `${a}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Archive size={20} color={a} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>보관함</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{vaultCount}개 항목 · 보드 자동수집</div>
          </div>
        </div>
        {/* 보드 프레임에서 저장된 폴더(클릭 = 안으로 — 이미지 jpg·문서 pdf·메모 txt·중첩 프레임은 하위 폴더) */}
        {saved.map((f) => (
          <div
            key={f.id}
            onClick={() => setPath([f])}
            className="kv-doc"
            style={{ position: 'relative', background: '#fff', border: `1.5px solid ${a}55`, borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: C.shadow1, display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 11, background: `${a}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Folder size={20} color={a} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{savedFileCount(f)}개 항목 · 보드 저장</div>
            </div>
            <button title="폴더 삭제" onClick={(e) => { e.stopPropagation(); removeSaved(f.id); }}
              style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <X size={15} color={C.muted} />
            </button>
          </div>
        ))}
        {folders.map((f) => (
          <div key={f.id} className="kv-doc" style={{ position: 'relative', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: C.shadow1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: `${a}14`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Folder size={20} color={a} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{f.count}개 항목</div>
            </div>
            <button title="폴더 삭제" onClick={(e) => { e.stopPropagation(); removeFolder(f.id); }}
              style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <X size={15} color={C.muted} />
            </button>
          </div>
        ))}
        <button onClick={addFolder} style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: 14, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, minHeight: 68 }}>
          <FolderPlus size={18} color={a} /> 새 폴더
        </button>
      </div>

      {/* files */}
      <div style={head}><span>파일</span><span style={{ fontSize: 12.5, color: C.muted, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>{files.length}개</span></div>
      {files.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>파일이 없습니다. 상단의 업로드로 자료를 추가하세요.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {files.map((f) => {
            const on = sel.has(f.id);
            return (
              <div key={f.id} onClick={() => toggle(f.id)} style={{ position: 'relative', background: '#fff', border: `1.5px solid ${on ? a : C.line}`, borderRadius: 14, padding: 12, cursor: 'pointer', boxShadow: on ? `0 0 0 3px ${a}22, ${C.shadow1}` : C.shadow1, transition: 'border-color .15s, box-shadow .15s' }}>
                <span style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${on ? a : C.line}`, background: on ? a : 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center' }}>
                  {on && <Check size={12} color="#fff" strokeWidth={3} />}
                </span>
                <div style={{ height: 84, borderRadius: 10, background: `${a}10`, display: 'grid', placeItems: 'center', marginBottom: 10 }}><TypeIcon type={f.type} /></div>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ color: C.muted, fontSize: 11.5, marginTop: 3 }}>{f.size}</div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
      </div>
    </div>
  );
}
