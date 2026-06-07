import { NavLink } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { navByGroup, type NavItem } from '@/lib/nav';

/* Left navigation (SKILL.md §5).
   Wide screens: vertical icon rail on the left.
   Narrow screens: bottom tab bar (the rail is hidden; AppShell renders <BottomTabs/>).
   Responsiveness keys off the shell container (container query) — see AppShell. */

function RailItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={item.label}
      className={({ isActive }) =>
        [
          'group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors duration-150 ease-soft',
          isActive ? 'bg-surface-3 text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {/* active marker — coral pill on the left edge */}
          <span
            aria-hidden
            className={`absolute left-0 h-6 w-[3px] rounded-pill bg-accent transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <Icon name={item.icon} size={22} stroke={isActive ? 2 : 1.8} />
          <span className="sr-only">{item.label}</span>
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

      <div className="my-t4 h-px w-7 bg-border" />

      {/* mid group */}
      <div className="flex flex-col items-center gap-t1">
        {navByGroup('mid').map((item) => (
          <RailItem key={item.id} item={item} />
        ))}
      </div>

      {/* bottom group — profile pinned to the bottom */}
      <div className="mt-auto flex flex-col items-center gap-t1">
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
