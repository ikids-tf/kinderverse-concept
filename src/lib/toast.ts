/* 전역 토스트 — 어떤 모듈에서든 showToast()로 띄우고, AppShell의 <KvToast />가
   렌더한다(window CustomEvent 브로드캐스트 — 스토어/컨텍스트 의존 없음).
   progress는 다음 토스트가 대체할 때까지 유지, success/error는 자동으로 사라진다. */

export type ToastKind = 'progress' | 'success' | 'error';

export interface ToastDetail {
  text: string;
  kind: ToastKind;
  /** 자동 닫힘(ms). progress 기본 = 유지(0), success/error 기본 = 2200. */
  duration?: number;
}

export function showToast(text: string, kind: ToastKind = 'success', duration?: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastDetail>('kv:toast', { detail: { text, kind, duration } }));
}
