/**
 * play(node) — 단일 진입점(계약 lessonModeContract). 직접 경로(풀스크린)와 수업 모드
 * 경로(살아있는 슬라이드)가 같은 이 함수로 노드를 mount·실행한다. P0에선 풀스크린
 * 저작 오버레이가 <InteractiveStage>를 직접 쓰고, 프로그램matic mount는 이 함수가 담당
 * (수업 모드 어댑터가 P1에서 호출).
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { NodePlaybackController, NodeRuntimeEvent, PlayNode } from '../schema/lessonModeContract';
import { InteractiveStage } from './InteractiveStage';

export const playNode: PlayNode = (node, opts) => {
  const root: Root = createRoot(opts.mount);
  const listeners = new Map<NodeRuntimeEvent, Set<(p?: unknown) => void>>();
  let state: 'idle' | 'playing' | 'completed' = 'idle';
  let nonce = 0;

  const emit = (ev: NodeRuntimeEvent, payload?: unknown) => listeners.get(ev)?.forEach((h) => h(payload));
  const render = () => root.render(createElement(InteractiveStage, { doc: node, mode: 'play', resetNonce: nonce }));

  const controller: NodePlaybackController = {
    start() {
      state = 'playing';
      nonce += 1;
      render();
      emit('started');
    },
    pause() {
      state = 'idle';
    },
    reset() {
      nonce += 1;
      render();
    },
    destroy() {
      root.unmount();
      listeners.clear();
    },
    get state() {
      return state;
    },
    on(ev, handler) {
      let set = listeners.get(ev);
      if (!set) {
        set = new Set();
        listeners.set(ev, set);
      }
      set.add(handler);
      return () => {
        listeners.get(ev)?.delete(handler);
      };
    },
  };

  render();
  queueMicrotask(() => emit('ready'));
  if (opts.autoStart ?? opts.mode === 'standalone') controller.start();
  return controller;
};
