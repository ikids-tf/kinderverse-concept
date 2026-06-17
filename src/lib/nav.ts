import type { IconName } from './icons';

/* Single source of truth for the integrated IA (SKILL.md §5).
   LNB groups: top (홈·갤러리·My Board) / mid (우리반·캘린더·폴더) / bottom (프로필).
   AI 채팅 is a global entry reached via the prompt bar message icon — NOT an LNB item.
   No "My Verse" menu (absorbed into My Board). */

export type NavGroup = 'top' | 'mid' | 'bottom';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: IconName;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: '홈', path: '/', icon: 'home', group: 'top' },
  { id: 'gallery', label: '갤러리', path: '/gallery', icon: 'gallery', group: 'top' },
  { id: 'myboard', label: 'My Board', path: '/board', icon: 'board', group: 'top' },

  { id: 'class', label: '우리반', path: '/class', icon: 'class', group: 'mid' },
  { id: 'calendar', label: '캘린더', path: '/calendar', icon: 'calendar', group: 'mid' },
  { id: 'folder', label: '자료보관', path: '/folder', icon: 'folder', group: 'mid' },

  { id: 'profile', label: '프로필', path: '/profile', icon: 'user', group: 'bottom' },
];

export const navByGroup = (group: NavGroup) => NAV_ITEMS.filter((n) => n.group === group);

// Global, non-LNB route.
export const AI_CHAT_PATH = '/chat';

/* Favorite cards that rise from the prompt bar star (SKILL.md §7) → route to the
   matching agent page. Maps card → destination per §1 (놀이계획=plan, etc.). */
export interface FavoriteCard {
  id: string;
  label: string;
  icon: IconName;
  /** Target route. M1 routes these to My Board where lanes/agents will live. */
  path: string;
  agent: 'plan' | 'record' | 'writing' | 'studio';
  mode?: 'observation' | 'story';
}

export const FAVORITE_CARDS: FavoriteCard[] = [
  { id: 'play_plan', label: '놀이계획', icon: 'plan', path: '/board?new=play_plan', agent: 'plan' },
  { id: 'play_story', label: '놀이기록', icon: 'record', path: '/board?new=play_story', agent: 'record', mode: 'story' },
  { id: 'observation', label: '관찰기록', icon: 'observation', path: '/board?new=observation', agent: 'record', mode: 'observation' },
  { id: 'writing', label: '문장생성', icon: 'writing', path: '/board?new=writing', agent: 'writing' },
  { id: 'studio', label: '스튜디오', icon: 'studio', path: '/board?new=studio', agent: 'studio' },
];
