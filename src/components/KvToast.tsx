import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons';
import type { ToastDetail } from '@/lib/toast';

/* 전역 토스트 렌더러 — AppShell에 한 번 마운트. showToast()(kv:toast 이벤트)를
   받아 하단 중앙(프롬프트바 위)에 알약으로 띄운다. progress = 스피너·유지,
   success/error = 아이콘·자동 닫힘. prefers-reduced-motion과 무관한 단순 표시. */

const AUTO_HIDE_MS = 2200;

export function KvToast() {
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => setToast((e as CustomEvent<ToastDetail>).detail);
    window.addEventListener('kv:toast', onToast);
    return () => window.removeEventListener('kv:toast', onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const ms = toast.duration ?? (toast.kind === 'progress' ? 0 : AUTO_HIDE_MS);
    if (!ms) return; // progress — 다음 토스트가 대체할 때까지 유지
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return createPortal(
    <div
      role="status"
      className="pointer-events-none fixed bottom-24 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-t2 rounded-pill bg-fg px-t5 py-t3 text-sm font-semibold text-on-dark shadow-lg"
    >
      {toast.kind === 'progress' ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-on-dark/30 border-t-accent" />
      ) : (
        <Icon name={toast.kind === 'success' ? 'check' : 'x'} size={15} className="text-accent" />
      )}
      {toast.text}
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            setToast(null);
          }}
          className="pointer-events-auto ml-t2 rounded-pill bg-on-dark/15 px-t3 py-0.5 font-semibold text-on-dark transition-colors duration-150 ease-soft hover:bg-on-dark/25"
        >
          {toast.action.label}
        </button>
      )}
    </div>,
    document.body,
  );
}
