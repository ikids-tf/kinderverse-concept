import { NavLink } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { navByGroup, type NavItem } from '@/lib/nav';

/* Left navigation (SKILL.md §5).
   Wide screens: vertical icon rail on the left.
   Narrow screens: bottom tab bar (the rail is hidden; AppShell renders <BottomTabs/>).
   Responsiveness keys off the shell container (container query) — see AppShell. */

function RailItem({ item }: { item: NavItem }) {
  // 활성 표시는 아이콘 배경 필만(왼쪽 세로 라인 제거), 아이콘 아래에 이름 라벨.
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={item.label}
      className="group flex w-14 flex-col items-center gap-0.5 py-t1"
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-9 w-12 items-center justify-center rounded-lg transition-colors duration-150 ease-soft ${
              isActive ? 'bg-surface-3 text-accent' : 'text-fg-2 group-hover:bg-surface-2 group-hover:text-fg'
            }`}
          >
            <Icon name={item.icon} size={20} stroke={isActive ? 2 : 1.8} />
          </span>
          <span
            className={`max-w-full truncate text-[10px] font-medium leading-tight ${
              isActive ? 'text-accent' : 'text-fg-muted group-hover:text-fg-2'
            }`}
          >
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function LNB() {
  return (
    <nav
      aria-label="주 메뉴"
      className="flex h-full w-[68px] flex-col items-center border-r border-border bg-bg-deep py-t4"
    >
      {/* brand mark */}
      <NavLink to="/" end aria-label="홈" className="mb-t5 flex h-10 w-10 items-center justify-center rounded-pill bg-accent text-on-accent">
        <Icon name="sparkle" size={20} fill="currentColor" />
      </NavLink>

      {/* top group */}
      <div className="flex flex-col items-center gap-t1">
        {navByGroup('top').map((item) => (
          <RailItem key={item.id} item={item} />
        ))}
      </div>

      {/* mid group(우리반·캘린더·폴더) — 하단으로 내려 프로필 바로 위에 둔다 */}
      <div className="mt-auto flex flex-col items-center gap-t1">
        {navByGroup('mid').map((item) => (
          <RailItem key={item.id} item={item} />
        ))}
      </div>

      {/* bottom group — profile pinned to the bottom (위 그룹과 여유 간격) */}
      <div className="mt-t6 flex flex-col items-center gap-t1">
        {navByGroup('bottom').map((item) => (
          <RailItem key={item.id} item={item} />
        ))}
      </div>
    </nav>
  );
}

/* Bottom tab bar for narrow viewports. Mirrors the rail items in a single row. */
export function BottomTabs() {
  const items = [...navByGroup('top'), ...navByGroup('mid'), ...navByGroup('bottom')];
  return (
    <nav
      aria-label="주 메뉴"
      className="flex items-stretch justify-around border-t border-border bg-bg-deep px-t2 pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            [
              'flex flex-1 flex-col items-center gap-0.5 py-t2 text-overline transition-colors duration-150 ease-soft',
              isActive ? 'text-accent' : 'text-fg-muted',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} size={20} stroke={isActive ? 2 : 1.8} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
