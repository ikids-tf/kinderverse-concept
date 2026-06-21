/* KinderVerse icon set.
   Adapted from the Milray Park UI kit (Lucide paths, MIT) into a single typed
   <Icon> component. Thin, rounded line icons matching the brand. */

export type IconName =
  | 'search'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronLeft'
  | 'arrowRight'
  | 'arrowLeft'
  | 'plus'
  | 'minus'
  | 'check'
  | 'x'
  | 'menu'
  | 'sparkle'
  | 'star'
  | 'message'
  | 'user'
  | 'home'
  | 'gallery'
  | 'board'
  | 'class'
  | 'calendar'
  | 'folder'
  | 'send'
  | 'plan'
  | 'record'
  | 'memo'
  | 'observation'
  | 'writing'
  | 'studio'
  | 'lock'
  | 'cursor'
  | 'present'
  | 'frame'
  | 'external'
  | 'copy'
  | 'download'
  | 'print'
  | 'layers'
  | 'video'
  | 'history'
  | 'motion'
  | 'heart'
  | 'scissors'
  | 'edit'
  | 'gamepad'
  | 'settings'
  | 'sound'
  | 'mute'
  | 'play'
  | 'maximize'
  | 'minimize'
  | 'undo'
  | 'redo'
  | 'upload'
  | 'link'
  | 'chevronUp'
  | 'trash'
  | 'square'
  | 'type'
  | 'hash'
  | 'toggle'
  | 'help'
  | 'eyeOff'
  | 'book'
  | 'repeat'
  | 'reset'
  | 'circle';

const ICON_PATHS: Record<IconName, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  gallery: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5L5 21"/>',
  board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  class: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.4"/><path d="M18 14.2a5.2 5.2 0 0 1 3 4.8"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  plan: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  record: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16l4 4v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5z"/><path d="M15 3v4.5h4.5"/><path d="M8 13h6M8 16.5h4"/>',
  // 메모 툴 전용 — record(문서)와 같은 파일 모양이되 안쪽 가로 줄 두 개 없음.
  memo: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16l4 4v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5z"/><path d="M15 3v4.5h4.5"/>',
  observation: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  writing: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  studio: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.7 0 2.5-1.3 2.5-2.5 0-.6-.2-1.1-.6-1.5-.4-.4-.6-.9-.6-1.5 0-1.2 1-2 2.2-2H17c2.8 0 5-2.2 5-5C22 5.8 17.5 2 12 2Z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  cursor: '<path d="m4 4 7.5 16 2.3-6.7L20.5 11z"/>',
  present: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20M12 16v4"/>',
  frame: '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10.3 9.3 4.6 2.7-4.6 2.7z"/>',
  heart: '<path d="M12 20.5 4.2 12.7a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3a4.6 4.6 0 0 1 6.5 6.5z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  gamepad: '<rect x="2" y="6" width="20" height="12" rx="6"/><path d="M7 12h3M8.5 10.5v3"/><circle cx="15.5" cy="11" r="1"/><circle cx="18" cy="13.5" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19 7a8 8 0 0 1 0 10"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h1"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
  print: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3.2 1.9"/>',
  motion: '<circle cx="5" cy="18" r="2.6"/><circle cx="19" cy="6" r="2.6"/><path d="M7.3 16.2C10.5 13.6 13.5 10.4 16.7 7.8"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 19V7"/><path d="m7 11 5-5 5 5"/><path d="M5 21h14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  toggle: '<rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="8" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><path d="M12 17h.01"/>',
  eyeOff: '<path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7"/><path d="M6.6 6.6A13 13 0 0 0 2 12s3 8 10 8a8.8 8.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
};

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  fill?: string;
  color?: string;
  className?: string;
}

export function Icon({
  name,
  size = 20,
  stroke = 1.9,
  fill = 'none',
  color = 'currentColor',
  className,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
