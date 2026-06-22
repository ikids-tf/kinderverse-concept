/**
 * 동작 런타임 — P0는 두 가지: 반응(animate 프리셋) · 교체(swap).
 * 애니메이션은 Web Animations API로 — 같은 요소를 반복 탭해도 깔끔히 재시작되고,
 * 회전 등 베이스 transform과 분리(.ic-el-inner 에만 적용).
 */
import type { AnimatePreset } from '../schema/interactiveNode';

function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Preset {
  frames: Keyframe[];
  duration: number;
  easing?: string;
  fill?: FillMode;
  /** transform 프리셋은 'add' — moveAlongPath 등으로 이미 옮겨진 위치(translate) 위에 합성된다
      (replace면 이동 위치를 덮어써 요소가 원점으로 튕긴다). opacity 프리셋은 기본('replace'). */
  composite?: CompositeOperation;
}

const PRESETS: Record<AnimatePreset, Preset> = {
  bounce: {
    frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-18%)' }, { transform: 'translateY(0)' }],
    duration: 600,
    easing: 'cubic-bezier(.5,.05,.5,.95)',
    composite: 'add',
  },
  jump: {
    frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-45%)' }, { transform: 'translateY(0)' }],
    duration: 700,
    easing: 'cubic-bezier(.3,0,.3,1)',
    composite: 'add',
  },
  wiggle: {
    frames: [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-8deg)' },
      { transform: 'rotate(8deg)' },
      { transform: 'rotate(-6deg)' },
      { transform: 'rotate(0deg)' },
    ],
    duration: 600,
    composite: 'add',
  },
  grow: {
    frames: [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    duration: 500,
    composite: 'add',
  },
  spin: {
    frames: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
    duration: 700,
    easing: 'ease-in-out',
    composite: 'add',
  },
  shake: {
    frames: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8%)' },
      { transform: 'translateX(8%)' },
      { transform: 'translateX(-5%)' },
      { transform: 'translateX(0)' },
    ],
    duration: 500,
    composite: 'add',
  },
  float: {
    frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-10%)' }, { transform: 'translateY(0)' }],
    duration: 1600,
    easing: 'ease-in-out',
    composite: 'add',
  },
  fadeIn: { frames: [{ opacity: 0 }, { opacity: 1 }], duration: 500, fill: 'both' },
  fadeOut: { frames: [{ opacity: 1 }, { opacity: 0 }], duration: 500, fill: 'forwards' },
};

/** 프리셋 한글 라벨(인스펙터). */
export const ANIMATE_LABELS: Record<AnimatePreset, string> = {
  bounce: '통통 튀기',
  jump: '점프',
  wiggle: '살랑살랑',
  grow: '커졌다 작아지기',
  spin: '빙글 회전',
  shake: '흔들흔들',
  float: '둥실둥실',
  fadeIn: '나타나기',
  fadeOut: '사라지기',
};

export const ANIMATE_PRESETS = Object.keys(PRESETS) as AnimatePreset[];

/** 요소의 애니메이션 타깃(.ic-el-inner)에 프리셋 재생. Animation 반환(없으면 null). */
export function runAnimate(target: HTMLElement, preset: AnimatePreset, repeat?: number): Animation | null {
  if (typeof target.animate !== 'function') return null;
  const p = PRESETS[preset];
  const duration = reducedMotion() ? Math.min(p.duration, 200) : p.duration;
  const iterations = repeat && repeat > 0 ? repeat : 1;
  return target.animate(p.frames, {
    duration,
    easing: p.easing ?? 'ease',
    iterations,
    fill: p.fill ?? 'none',
    composite: p.composite ?? 'replace',
  });
}

/** 재생 리셋 — 진행 중/완료(fill) 애니메이션을 모두 취소(원상 복귀). */
export function cancelAnimations(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.ic-el-inner').forEach((el) => {
    el.getAnimations?.().forEach((a) => a.cancel());
  });
}
