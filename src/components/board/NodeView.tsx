import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '@/lib/icons';
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { editTextCmd } from '@/board/commands';
import { runWorkflowStep, type RunnerData, type StepKind } from '@/board/workflow';
import { saveFrameToFolder, fitFrameToChildren } from '@/board/frames';
import { runComposerChip, expandMindMapBranch, planFromNode, worksheetFromNode, type ComposerChip } from '@/board/composer';

/* Renders one board node (reference board model): frame container, runner control,
   image card (real src), and content-sized sticky/text memos. Selection ring +
   drag handled by the parent canvas via onPointerDown. */

const COLOR_BG: Record<string, string> = {
  'accent-soft': 'bg-accent-soft',
  'surface-3': 'bg-surface-3',
  'surface-2': 'bg-surface-2',
  gold: 'bg-gold',
  'success-soft': 'bg-success-soft',
};

/** Static drag-strips along a frame's 4 edges (hoisted — never changes). */
const FRAME_EDGE_STRIPS = [
  { left: 0, right: 0, top: 0, height: 16 },
  { left: 0, right: 0, bottom: 0, height: 16 },
  { top: 0, bottom: 0, left: 0, width: 16 },
  { top: 0, bottom: 0, right: 0, width: 16 },
] as const;

interface Props {
  node: BoardNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  dx?: number;
  dy?: number;
}

export function NodeView({ node, selected, onPointerDown, dx = 0, dy = 0 }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const editable = node.type === 'sticky' || node.type === 'text' || node.type === 'image';

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // Content cards report their REAL rendered (outer) height into data.renderH so
  // the containing frame can grow to wrap them exactly. node.h alone understates
  // image cards (its h is only the image area; the caption adds height below).
  const measured = node.type === 'sticky' || node.type === 'text' || node.type === 'image';
  useEffect(() => {
    if (!measured) return;
    const el = cardRef.current;
    if (!el) return;
    const sync = () => {
      const h = Math.round(el.offsetHeight);
      const cur = useBoardStore.getState().nodes[node.id];
      if (!cur) return;
      const prev = typeof cur.data?.renderH === 'number' ? cur.data.renderH : 0;
      if (Math.abs(prev - h) <= 1) return;
      useBoardStore.getState().updateNodeRaw(node.id, { data: { ...(cur.data ?? {}), renderH: h } });
      const fid = cur.data?.frameId as string | undefined;
      if (fid) fitFrameToChildren(fid);
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, measured]);

  function commit() {
    setEditing(false);
    editTextCmd(node.id, node.text ?? '', draft);
  }

  const left = node.x + dx;
  const top = node.y + dy;
  const ring = selected ? 'ring-2 ring-accent' : 'ring-1 ring-transparent';

  const down = (e: React.PointerEvent) => onPointerDown(e, node.id);
  const dbl = (e: React.MouseEvent) => {
    if (editable && !node.locked) {
      e.stopPropagation();
      setDraft(node.text ?? '');
      setEditing(true);
    }
  };

  /* ---------- frame: back container (interior click-through) ---------- */
  if (node.type === 'frame') {
    const title = (node.data?.title as string) ?? '프레임';
    const savedBundleId = node.data?.savedBundleId as string | undefined;
    const chips = (node.data?.nextSteps as ComposerChip[] | undefined) ?? [];
    const isSub = !!node.data?.sub; // nested section frame (e.g. 아이디어) — no save/chips chrome
    const renameTitle = (v: string) =>
      useBoardStore.getState().updateNodeRaw(node.id, { data: { ...node.data, title: v.trim() || '프레임' } });
    const frameBg = `border-2 ${selected ? 'border-accent' : isSub ? 'border-border/70' : 'border-border'} ${isSub ? 'bg-surface-2/50' : 'bg-surface/40'} shadow-md`;
    return (
      <div
        className="absolute"
        style={{ left, top, width: node.w, height: node.h, pointerEvents: 'none' }}
      >
        <div className={`absolute inset-0 rounded-lg ${frameBg}`} />
        {/* in-frame loading state — shown while the composer fills this frame, so the
            teacher sees the frame land and knows generation is running. */}
        {!!node.data?.loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-t3 rounded-lg" style={{ pointerEvents: 'none' }}>
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
            <span className="rounded-pill border border-border bg-surface px-t3 py-t1 text-sm font-medium text-fg-2 shadow-sm">
              {(node.data?.loadingLabel as string) ?? 'AI가 자료를 만들고 있어요…'}
            </span>
          </div>
        )}
        {/* edge grab strips — drag to move the frame */}
        {FRAME_EDGE_STRIPS.map((pos, i) => (
          <div key={i} onPointerDown={down} style={{ position: 'absolute', ...pos, pointerEvents: 'auto', cursor: 'grab' }} />
        ))}
        {/* title tab — drag to move, double-click to rename */}
        <div
          onPointerDown={down}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(title);
            setEditing(true);
          }}
          className={`absolute -top-7 left-0 inline-flex items-center gap-t1 rounded-md border px-t3 py-t1 text-overline shadow-sm ${
            selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg-2'
          }`}
          style={{ pointerEvents: 'auto', cursor: 'grab' }}
        >
          <Icon name="frame" size={12} />
          {editing ? (
            <input
              autoFocus
              data-kv-editable="true"
              value={draft}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { renameTitle(draft); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-28 bg-transparent text-overline focus:outline-none"
            />
          ) : (
            title
          )}
        </div>

        {/* save the whole frame to one folder (top composer frame only) */}
        {!isSub && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (!savedBundleId) saveFrameToFolder(node.id); }}
          title="이 프레임을 폴더에 저장"
          className={`absolute -top-7 right-0 inline-flex items-center gap-t1 rounded-md border px-t2 py-t1 text-overline shadow-sm ${
            savedBundleId
              ? 'border-success/40 bg-success-soft text-success'
              : 'border-border bg-surface text-fg-2 hover:border-accent hover:text-accent'
          }`}
          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        >
          <Icon name={savedBundleId ? 'check' : 'folder'} size={12} /> {savedBundleId ? '저장됨' : '폴더에 저장'}
        </button>
        )}

        {/* next-step recommendation chips (subtle, never auto-run) */}
        {!isSub && chips.length > 0 && (
          <div
            className="absolute left-0 flex flex-wrap items-center gap-t1"
            style={{ top: node.h + 8, width: node.w, pointerEvents: 'auto' }}
          >
            <span className="text-overline text-fg-muted">추천</span>
            {chips.map((chip) => (
              <button
                key={chip.id}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (chip.status !== 'running') void runComposerChip(node.id, chip.id); }}
                disabled={chip.status === 'running'}
                className={`inline-flex items-center gap-t1 rounded-pill border px-t3 py-t1 text-sm shadow-sm backdrop-blur transition-colors duration-150 ease-soft ${
                  chip.status === 'done'
                    ? 'border-border bg-surface/70 text-fg-muted'
                    : 'border-border bg-surface/95 text-fg-2 hover:border-accent hover:text-accent'
                }`}
              >
                {chip.status === 'running' ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                ) : (
                  <Icon name="sparkle" size={12} className="text-accent" />
                )}
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---------- runner: workflow control card ---------- */
  if (node.type === 'runner') {
    return <RunnerCard node={node} selected={selected} onPointerDown={onPointerDown} left={left} top={top} />;
  }

  /* ---------- image card (real src / loading / placeholder) ---------- */
  if (node.type === 'image') {
    return (
      <div
        ref={cardRef}
        onPointerDown={down}
        onDoubleClick={dbl}
        className={`absolute select-none overflow-hidden rounded-md border border-border bg-surface shadow-sm ${ring}`}
        style={{ left, top, width: node.w }}
      >
        <div className="relative" style={{ width: '100%', height: node.h }}>
          {node.loading ? (
            <div className="flex h-full w-full items-center justify-center bg-surface-2 text-fg-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            </div>
          ) : node.src ? (
            <img src={node.src} alt={node.text ?? ''} draggable={false} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-fg-muted">
              <Icon name="studio" size={24} />
            </div>
          )}
          {node.src && (
            <span className="absolute left-1 top-1 rounded-pill bg-fg/75 px-t2 py-0.5 text-[10px] text-on-dark">AI 생성</span>
          )}
        </div>
        {(node.text || editing) && (
          <div className="px-t2 py-t1">
            {editing ? (
              <textarea
                ref={ref}
                data-kv-editable="true"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                className="w-full resize-none bg-transparent text-overline text-fg focus:outline-none"
              />
            ) : (
              <span className="block truncate text-xs font-semibold text-fg" title={imgTitle(node.text)}>{imgTitle(node.text)}</span>
            )}
          </div>
        )}
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- sticky / memo · A4 document (data.doc) ---------- */
  if (node.type === 'sticky') {
    // Mind-map center — the topic, a prominent coral node.
    if (node.data?.role === 'mm-center') {
      return (
        <div
          ref={cardRef}
          onPointerDown={down}
          onDoubleClick={dbl}
          className={`absolute z-10 flex select-none items-center justify-center rounded-2xl border-2 border-accent bg-accent px-t4 py-t3 text-center shadow-lg ${ring}`}
          style={{ left, top, width: node.w, ...(node.autoH ? { minHeight: node.h } : { height: node.h }) }}
        >
          {editing ? (
            <textarea
              ref={ref}
              data-kv-editable="true"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              className="w-full resize-none bg-transparent text-center font-display text-h4 font-semibold text-on-accent focus:outline-none"
            />
          ) : (
            <p className="font-display text-h4 font-semibold leading-tight text-on-accent">{node.text || '주제'}</p>
          )}
          {Array.isArray(node.data?.decorations) && <StickerDecos items={node.data.decorations as StickerDecoData[]} />}
          {node.locked && <LockBadge />}
        </div>
      );
    }
    const isDoc = !!node.data?.doc;
    const isIdea = node.data?.role === 'idea'; // selectable idea pick (in the 아이디어 sub-frame)
    const coverImage = node.data?.coverImage as string | undefined; // newsletter cover
    const docImages = Array.isArray(node.data?.docImages) ? (node.data.docImages as string[]) : [];
    const loadingDoc = !!node.data?.loadingDoc;
    const decorations = Array.isArray(node.data?.decorations) ? (node.data.decorations as StickerDecoData[]) : [];
    const srcLinks = node.data?.role === 'source' && Array.isArray(node.data?.links)
      ? (node.data.links as SourceLinkData[])
      : null;
    return (
      <div
        ref={cardRef}
        onPointerDown={down}
        onDoubleClick={srcLinks ? undefined : dbl}
        className={`group absolute select-none shadow-md ${ring} ${isIdea ? 'cursor-pointer' : ''} ${
          isDoc
            ? 'rounded-lg border border-border bg-surface p-t6'
            : srcLinks
              ? 'rounded-lg border border-border bg-surface-2 p-t4'
              : `rounded-md ${COLOR_BG[node.color ?? 'accent-soft'] ?? 'bg-accent-soft'} p-t3`
        }`}
        style={{ left, top, width: node.w, ...(node.autoH ? { minHeight: node.h } : { height: node.h }) }}
      >
        {srcLinks ? (
          <SourceLinks
            links={srcLinks}
            thumbs={Array.isArray(node.data?.thumbs) ? (node.data.thumbs as SourceThumbData[]) : undefined}
            summary={node.data?.summary as string | undefined}
          />
        ) : editing ? (
          <textarea
            ref={ref}
            data-kv-editable="true"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            rows={Math.max(3, draft.split('\n').length)}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-fg focus:outline-none"
          />
        ) : isDoc ? (
          <div className="kv-doc-md text-sm leading-relaxed text-fg">
            {coverImage && (
              <img
                src={coverImage}
                alt=""
                draggable={false}
                className="mb-t4 block w-full rounded-md border border-border object-cover"
                style={{ maxHeight: 220 }}
              />
            )}
            <Markdown remarkPlugins={[remarkGfm]}>{node.text || ''}</Markdown>
            {docImages.length > 0 && (
              <div className="mt-t4 grid grid-cols-2 gap-t2">
                {docImages.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    draggable={false}
                    className="block w-full rounded-md border border-border object-cover"
                    style={{ maxHeight: 150 }}
                  />
                ))}
              </div>
            )}
            {loadingDoc && (
              <span className="mt-t2 inline-flex items-center gap-t2 text-overline text-fg-muted">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                생성 중…
              </span>
            )}
          </div>
        ) : (
          <MemoText text={node.text} />
        )}
        {/* idea pick affordance — empty ring = selectable, coral check = selected */}
        {isIdea && (
          <span
            className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm ${
              selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface'
            }`}
          >
            {selected && <Icon name="check" size={12} />}
          </span>
        )}
        {/* mind-map branch → hover toolbar: 확장(하위활동) · 계획안 · 활동지.
            One idea → expand the map, or generate a connected plan/worksheet. */}
        {node.data?.role === 'mm-branch' && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-pill border border-border bg-surface px-1 py-1 opacity-0 shadow-lg transition-opacity duration-150 ease-soft group-hover:opacity-100"
          >
            <button
              onClick={(e) => { e.stopPropagation(); void expandMindMapBranch(node.id); }}
              title="하위 활동으로 확장"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 transition-colors duration-150 ease-soft hover:bg-accent hover:text-on-accent"
            >
              <Icon name="plus" size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void planFromNode(node.id); }}
              title="이 활동으로 계획안 만들기"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 transition-colors duration-150 ease-soft hover:bg-accent hover:text-on-accent"
            >
              <Icon name="calendar" size={15} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void worksheetFromNode(node.id); }}
              title="이 활동으로 활동지 만들기"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 transition-colors duration-150 ease-soft hover:bg-accent hover:text-on-accent"
            >
              <Icon name="writing" size={15} />
            </button>
          </div>
        )}
        {/* Design Director — decorate: theme stickers "stuck" on the corners. */}
        <StickerDecos items={decorations} />
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- text · frame header (role:header) ---------- */
  if (node.type === 'text') {
    const isHeader = node.data?.role === 'header';
    const font = isHeader ? 'font-display text-h2 font-semibold' : 'font-display text-h4';
    return (
      <div
        ref={cardRef}
        onPointerDown={down}
        onDoubleClick={dbl}
        className={`absolute select-none rounded-sm px-t2 ${ring}`}
        style={{ left, top, width: node.w, ...(node.autoH ? { minHeight: node.h } : { height: node.h }) }}
      >
        {editing ? (
          <textarea
            ref={ref}
            data-kv-editable="true"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            className={`w-full resize-none bg-transparent ${font} text-fg focus:outline-none`}
          />
        ) : (
          <p className={`whitespace-pre-wrap ${font} text-fg`}>{node.text || '텍스트'}</p>
        )}
        {/* designed header rule — a short coral underline */}
        {isHeader && !editing && <span className="mt-t1 block h-[3px] w-14 rounded-pill bg-accent" />}
        {node.locked && <LockBadge />}
      </div>
    );
  }

  /* ---------- shape ---------- */
  return (
    <div
      onPointerDown={down}
      className={`absolute rounded-lg border border-border ${COLOR_BG[node.color ?? 'surface-3'] ?? 'bg-surface-3'} ${ring}`}
      style={{ left, top, width: node.w, height: node.h }}
    >
      {node.locked && <LockBadge />}
    </div>
  );
}

function LockBadge() {
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-on-dark">
      <Icon name="lock" size={11} />
    </span>
  );
}

/* Memo editorial design — first line is a bold title, the rest is body text. */
function MemoText({ text }: { text?: string }) {
  const t = text ?? '';
  const nl = t.indexOf('\n');
  const title = (nl >= 0 ? t.slice(0, nl) : t).trim() || '메모…';
  const body = nl >= 0 ? t.slice(nl + 1).trim() : '';
  return (
    <>
      <p className="font-semibold leading-snug text-fg" style={{ fontSize: '0.95rem' }}>{title}</p>
      {body && <p className="mt-t1 whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{body}</p>}
    </>
  );
}

/** A clean, short title from an image caption (before "—" / "(" separators). */
function imgTitle(text?: string): string {
  const first = (text ?? '').split('\n')[0];
  // Keep only the title — drop any trailing annotation: a 누리과정 영역 tag in
  // brackets ([...]/【...】), an em-dash note, or a parenthetical.
  const cut = first.split(/\s*[—–([【]/)[0].trim();
  return (cut || first).slice(0, 30);
}

/* ---- corner sticker decoration (Design Director — decorate pillar) ---- */
interface StickerDecoData {
  emoji: string;
  anchor: 'tl' | 'tr' | 'bl' | 'br';
  rot: number;
  size: number;
}
function StickerDecos({ items }: { items: StickerDecoData[] }) {
  return (
    <>
      {items.map((d, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute z-10 flex items-center justify-center rounded-full border border-border bg-surface shadow-md"
          style={{
            ...(d.anchor === 'tl'
              ? { left: -14, top: -14 }
              : d.anchor === 'tr'
                ? { right: -14, top: -14 }
                : d.anchor === 'bl'
                  ? { left: -14, bottom: -14 }
                  : { right: -14, bottom: -14 }),
            width: d.size,
            height: d.size,
            transform: `rotate(${d.rot}deg)`,
            fontSize: Math.round(d.size * 0.56),
            lineHeight: 1,
          }}
        >
          {d.emoji}
        </span>
      ))}
    </>
  );
}

/* ---- web-source card: topic thumbnails (free image sites) + search link rows ---- */
interface SourceLinkData {
  title: string;
  url: string;
  domain: string;
}
interface SourceThumbData {
  thumb: string;
  url: string;
  title: string;
  source: string;
}
function SourceLinks({ links, thumbs, summary }: { links: SourceLinkData[]; thumbs?: SourceThumbData[]; summary?: string }) {
  return (
    <div className="flex flex-col gap-t2">
      <span className="inline-flex items-center gap-t1 text-overline text-fg-2">
        <Icon name="search" size={13} className="text-accent" /> 웹 자료
      </span>
      {summary && <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{summary}</p>}
      {thumbs && thumbs.length > 0 && (
        <div className="grid grid-cols-2 gap-t1">
          {thumbs.map((t, i) => (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noreferrer noopener"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title={t.title}
              className="group relative block overflow-hidden rounded-md border border-border bg-surface"
            >
              <img
                src={t.thumb}
                alt={t.title}
                draggable={false}
                loading="lazy"
                onError={(e) => { (e.currentTarget.closest('a') as HTMLElement | null)?.style.setProperty('display', 'none'); }}
                className="h-20 w-full object-cover transition-transform duration-200 ease-soft group-hover:scale-105"
              />
              {t.source && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-fg/65 px-t1 py-0.5 text-[10px] text-on-dark">{t.source}</span>
              )}
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-t1">
        {links.map((l, i) => (
          <a
            key={i}
            href={l.url}
            target="_blank"
            rel="noreferrer noopener"
            // stop the board from starting a drag/selection so the click navigates
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            title={l.url}
            className="group flex items-center gap-t2 rounded-md border border-border bg-surface px-t2 py-t1 no-underline transition-colors duration-150 ease-soft hover:border-accent"
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(l.domain || l.title)}&sz=64`}
              alt=""
              width={18}
              height={18}
              draggable={false}
              className="shrink-0 rounded-sm"
            />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm text-fg">{l.title}</span>
              {l.domain && l.domain !== l.title && (
                <span className="block truncate text-overline text-fg-muted">{l.domain}</span>
              )}
            </span>
            <Icon name="external" size={13} className="shrink-0 text-fg-muted transition-colors group-hover:text-accent" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ---- runner control card ---- */
const STEP_ICON: Record<StepKind, Parameters<typeof Icon>[0]['name']> = {
  idea: 'plan',
  image: 'studio',
  plan: 'plan',
  worksheet: 'writing',
};

function RunnerCard({
  node,
  selected,
  onPointerDown,
  left,
  top,
}: {
  node: BoardNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  left: number;
  top: number;
}) {
  const data = node.data as unknown as RunnerData;
  const steps = data?.steps ?? [];
  const ideaDone = steps.find((s) => s.kind === 'idea')?.status === 'done';
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`absolute select-none rounded-xl border bg-surface shadow-lg ${selected ? 'border-accent' : 'border-border'}`}
      style={{ left, top, width: node.w }}
    >
      {/* drag handle / header */}
      <div
        onPointerDown={(e) => onPointerDown(e, node.id)}
        className="flex items-center gap-t2 rounded-t-xl border-b border-border bg-bg-deep/60 px-t3 py-t2"
        style={{ cursor: 'grab' }}
      >
        <Icon name="sparkle" size={14} fill="currentColor" className="text-accent" />
        <span className="text-overline text-fg-2">워크플로 러너</span>
      </div>
      <div className="flex flex-col gap-t1 p-t2">
        {steps.map((s, i) => {
          const enabled = s.kind === 'idea' || ideaDone;
          const running = s.status === 'running';
          return (
            <button
              key={s.kind}
              onPointerDown={stop}
              onClick={(e) => {
                stop(e);
                if (enabled && !running) void runWorkflowStep(node.id, s.kind);
              }}
              disabled={!enabled || running}
              className={`flex items-center gap-t2 rounded-md px-t3 py-t2 text-left text-sm transition-colors duration-150 ease-soft ${
                s.status === 'done'
                  ? 'bg-success-soft text-success'
                  : enabled
                    ? 'bg-bg/60 text-fg hover:bg-surface-2'
                    : 'text-fg-disabled'
              }`}
            >
              <span className="text-overline text-fg-muted">{i + 1}</span>
              <Icon name={STEP_ICON[s.kind]} size={14} />
              <span className="font-medium">{s.label}</span>
              <span className="ml-auto text-overline">
                {running ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                ) : s.status === 'done' ? (
                  <Icon name="check" size={13} />
                ) : s.status === 'error' ? (
                  '재시도'
                ) : (
                  '실행'
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
