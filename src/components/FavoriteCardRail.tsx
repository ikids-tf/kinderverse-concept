import { useNavigate } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { FAVORITE_CARDS } from '@/lib/nav';
import { useUIStore } from '@/store/uiStore';
import { useBoardsStore } from '@/store/boardsStore';
import { kindFromFavorite } from '@/board/seed';

/* Favorite card rail (SKILL.md §7).
   Rises above the prompt bar when the star is clicked on an empty input.
   카드 클릭 → 해당 콘텐츠에 최적화되게 시드된 "새 보드(캔버스)"를 만들고 My Board로 이동. */

export function FavoriteCardRail() {
  const navigate = useNavigate();
  const setFavoritesOpen = useUIStore((s) => s.setFavoritesOpen);
  const createBoard = useBoardsStore((s) => s.createBoard);

  return (
    <div
      role="menu"
      aria-label="즐겨찾기 작업"
      className="kv-reveal mb-t3 flex flex-wrap items-stretch gap-t3"
    >
      {FAVORITE_CARDS.map((card) => (
        <button
          key={card.id}
          role="menuitem"
          onClick={() => {
            setFavoritesOpen(false);
            createBoard(kindFromFavorite(card.id));
            navigate('/board');
          }}
          className="group flex min-w-[148px] flex-1 items-center gap-t3 rounded-xl border border-border bg-surface px-t4 py-t3 text-left shadow-sm transition-[transform,box-shadow] duration-150 ease-soft hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-accent-soft text-accent">
            <Icon name={card.icon} size={18} />
          </span>
          <span className="flex flex-col">
            <span className="font-sans text-sm font-semibold text-fg">{card.label}</span>
            <span className="text-overline text-fg-muted">{card.agent}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
