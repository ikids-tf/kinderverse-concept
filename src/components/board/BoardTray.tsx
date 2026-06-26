import { X } from 'lucide-react';
import { useTrayStore } from '@/store/trayStore';
import { placeTrayItemAtCenter } from '@/board/tray';

/** 갤러리에서 보드로 가져온 자료의 '임시 트레이' — 프롬프트바 위에 고정(팬·클릭해도 유지).
    각 자료를 캔버스로 드래그하면 드롭 위치에, 클릭하면 화면 중앙에 배치된다(배치되면 트레이에서 빠짐).
    오른쪽 위 X는 트레이와 담긴 임시 자료를 보드에서 제거(갤러리 원본은 그대로). */
export function BoardTray() {
  const items = useTrayStore((s) => s.items);
  const clear = useTrayStore((s) => s.clear);
  if (!items.length) return null;
  return (
    <div
      className="fixed left-1/2 z-30 -translate-x-1/2 rounded-lg border border-border bg-surface shadow-2xl"
      style={{ bottom: 120, width: 'min(860px, 92vw)', padding: '12px 14px' }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="shrink-0 text-sm font-bold text-fg">갤러리 자료 {items.length}개</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
          자료를 원하는 곳에 <b className="text-accent">드래그</b>하거나 <b className="text-accent">클릭</b>하면 화면 중앙에 배치됩니다.
        </span>
        <button
          onClick={clear}
          title="임시 자료함 비우기 — 보드에서만 제거(갤러리는 유지)"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-fg hover:bg-surface-3"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-0.5">
        {items.map((it) => (
          <div
            key={it.id}
            role="button"
            tabIndex={0}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/kv-tray', it.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => placeTrayItemAtCenter(it)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); placeTrayItemAtCenter(it); }
            }}
            title={`${it.title} — 드래그하거나 클릭해서 보드에 배치`}
            className="shrink-0 cursor-grab overflow-hidden rounded-lg border border-border bg-surface-2 active:cursor-grabbing"
            style={{ width: 96 }}
          >
            <img src={it.src} alt={it.title} draggable={false} className="block w-full object-cover" style={{ height: 64 }} />
            <div className="truncate px-1.5 py-1 text-left font-semibold text-fg" style={{ fontSize: 10.5 }}>{it.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
