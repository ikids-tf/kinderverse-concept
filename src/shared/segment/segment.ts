/**
 * segment.ts — 클릭 객체 분할(SAM) 공용 진입점. 편집기가 'AI 요소 지우기'에서 쓴다.
 * prepare(이미지 임베딩 1회) → segmentAt(클릭마다 마스크). 마스크는 이미지 원본 크기의
 * Uint8Array(1=객체)로, 호출부가 해당 픽셀을 투명하게 지운다.
 */

interface Pending {
  resolve: (v: { mask: Uint8Array; w: number; h: number }) => void;
  reject: (e: unknown) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<string, Pending>();
const prepResolvers = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data ?? {};
      if (m.type === 'ready') {
        prepResolvers.get('prep:' + m.id)?.resolve();
        prepResolvers.delete('prep:' + m.id);
      } else if (m.type === 'mask') {
        pending.get(m.reqId)?.resolve({ mask: m.mask, w: m.w, h: m.h });
        pending.delete(m.reqId);
      } else if (m.type === 'error') {
        if (m.reqId && pending.has(m.reqId)) {
          pending.get(m.reqId)?.reject(new Error(m.message));
          pending.delete(m.reqId);
        } else if (m.id && prepResolvers.has('prep:' + m.id)) {
          prepResolvers.get('prep:' + m.id)?.reject(new Error(m.message));
          prepResolvers.delete('prep:' + m.id);
        }
      }
    };
  }
  return worker;
}

/** 이미지 임베딩을 1회 계산·캐시(무거운 단계). 같은 id로 segmentAt 호출 가능해진다. */
export function prepareSegment(id: string, blob: Blob): Promise<void> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    prepResolvers.set('prep:' + id, { resolve, reject });
    w.postMessage({ type: 'prepare', id, blob });
  });
}

/** 클릭 점(이미지 픽셀 좌표)의 객체 마스크를 돌려준다. prepare된 id여야 한다. */
export function segmentAt(id: string, x: number, y: number): Promise<{ mask: Uint8Array; w: number; h: number }> {
  const w = getWorker();
  const reqId = 'seg' + ++seq;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    w.postMessage({ type: 'point', id, reqId, x, y });
  });
}

/** 여러 점(양성 label 1 = 추가 · 음성 label 0 = 빼기)으로 마스크를 정밀 조절한다. */
export function segmentAtPoints(
  id: string,
  points: { x: number; y: number; label: number }[],
): Promise<{ mask: Uint8Array; w: number; h: number }> {
  const w = getWorker();
  const reqId = 'seg' + ++seq;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    w.postMessage({ type: 'points', id, reqId, points });
  });
}

/** 유휴 시 모델 미리 받기(선택). */
export function warmupSegment(): void {
  getWorker();
}
