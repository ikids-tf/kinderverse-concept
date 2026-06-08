import type { RouteTarget } from './contract';

/* Per-page available_actions registry (SKILL §3 rule 2, §6.2 / PRD §6.2).
   The prompt bar is a context handler: each page registers the actions it can
   accept, and the router only routes within that set. Keyed by route path. */

export const PAGE_ACTIONS: Record<string, string[]> = {
  '/': ['start_task', 'chat'],
  '/chat': ['chat', 'start_task'],
  '/board': ['generate', 'mindmap', 'merge', 'relayout', 'restyle', 'add_media', 'start_task'],
  '/gallery': ['classify', 'search', 'add_media'],
  '/class': ['add_child', 'note', 'start_task'],
  '/calendar': ['create_event', 'generate', 'start_task'],
  '/folder': ['open_bundle', 'search'],
  '/profile': [],
};

export function actionsForPath(pathname: string): string[] {
  return PAGE_ACTIONS[pathname] ?? ['chat'];
}

/* Where to send the teacher once the router picks an agent. M2 has no Tier1
   agent pages yet, so agents land on My Board (where lanes/agents arrive in
   M4/M6) seeded with the chosen task. */
export function pathForRoute(route: RouteTarget, mode?: string): string {
  switch (route) {
    case 'plan':
      return '/board?new=play_plan';
    case 'record':
      return mode === 'observation' ? '/board?new=observation' : '/board?new=play_story';
    case 'studio':
      return '/board?new=studio';
    case 'writing':
      return '/board?new=writing';
    case 'mindmap':
      return '/board?new=mindmap';
    case 'router':
    default:
      return '/chat';
  }
}

export const ROUTE_LABEL: Record<RouteTarget, string> = {
  router: '라우터',
  record: '기록',
  plan: '계획',
  studio: '스튜디오',
  writing: '문장',
  mindmap: '생각그물',
};
