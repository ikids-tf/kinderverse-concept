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
  | 'motion';

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
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
  print: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3.2 1.9"/>',
  motion: '<circle cx="5" cy="18" r="2.6"/><circle cx="19" cy="6" r="2.6"/><path d="M7.3 16.2C10.5 13.6 13.5 10.4 16.7 7.8"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
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
