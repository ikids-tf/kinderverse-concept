import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { FAVORITE_CARDS } from '@/lib/nav';
import { useUIStore } from '@/store/uiStore';
import { useBoardsStore } from '@/store/boardsStore';
import { kindFromFavorite } from '@/board/seed';

/* Favorite card rail (SKILL.md §7). Star click → a natural, lightly overlapping
   row of card shortcuts rises from behind the prompt bar (the bar sits higher in
   z, and the rail slightly underlaps it). Styling mirrors the bar (surface, soft
   border/shadow, backdrop-blur; coral only on the icon chip). Hover lifts a card
   to the front. Card click → seeded "새 보드" + go to My Board. */

export function FavoriteCardRail({ closing = false }: { closing?: boolean }) {
  const navigate = useNavigate();
  const setFavoritesOpen = useUIStore((s) => s.setFavoritesOpen);
  const createBoard = useBoardsStore((s) => s.createBoard);

  // Mount tucked behind the bar, then spread on the next frame (animated rise).
  // On `closing`, fall back to the tucked state so it descends back behind the bar.
  const [entered, setEntered] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const shown = entered && !closing;
  const n = FAVORITE_CARDS.length;
  const mid = (n - 1) / 2;

  return (
    <div
      role="menu"
      aria-label="즐겨찾기 작업"
      className="relative z-0 h-[148px]"
      style={{ marginBottom: -10 }} // underlap the bar slightly
    >
      {FAVORITE_CARDS.map((card, i) => {
        const off = i - mid; // -2..2
        const isH = hover === card.id;
        const dx = off * 98; // light overlap so labels stay readable
        const rot = shown ? (isH ? off * 1.4 : off * 4) : 0; // gentle lean; straighten on hover
        const ty = (shown ? 0 : 78) - (isH ? 14 : 0); // rise from behind bar; lift on hover
        const scale = isH ? 1.05 : shown ? 1 : 0.9;
        return (
          <button
            key={card.id}
            role="menuitem"
            onPointerEnter={() => setHover(card.id)}
            onPointerLeave={() => setHover((h) => (h === card.id ? null : h))}
            onClick={() => {
              setFavoritesOpen(false);
              createBoard(kindFromFavorite(card.id));
              navigate('/board');
            }}
            style={{
              left: '50%',
              zIndex: isH ? 30 : 20 - Math.abs(off), // hovered/center on top
              opacity: shown ? 1 : 0,
              transform: `translateX(calc(-50% + ${dx}px)) translateY(${ty}px) rotate(${rot}deg) scale(${scale})`,
              // open: stagger left→right; close: reverse (right→left); hover: instant.
              transitionDelay: isH ? '0ms' : closing ? `${(n - 1 - i) * 40}ms` : `${i * 50}ms`,
            }}
            className="absolute bottom-0 flex w-[108px] origin-bottom flex-col items-center gap-t2 rounded-md border border-border bg-surface/95 px-t3 pb-t4 pt-t3 text-center shadow-md backdrop-blur transition-[transform,opacity,box-shadow] duration-[420ms] ease-[cubic-bezier(0.32,1.32,0.5,1)] will-change-transform hover:border-border-strong hover:shadow-lg"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon name={card.icon} size={20} />
            </span>
            <span>
              <span className="block font-sans text-sm font-semibold text-fg">{card.label}</span>
              <span className="mt-0.5 block text-overline text-fg-muted">{card.agent}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
