/**
 * removeBackground.ts — 배경 제거 공용 엔진(단일 진입점). 보드/게임뷰어 등 모든 호출부가
 * 이 함수만 부른다(로직 중복 금지). 입력을 일반화·≤1024px 다운스케일해 워커로 보내고,
 * 안전 티어 분기를 한 곳에서 강제한다.
 *
 * 백엔드는 **WASM + q8 단일 경로**(worker.ts 참고 — WebGPU는 storage-buffer 한계·OOM으로 제거).
 *
 * 🔴 LICENSE(상용 출시 전 반드시 교체): 현재 모델 = briaai/RMBG-1.4 (BRIA, 비상업) — 사용자
 *   승인 하 프로토타입 채택. 상업 출시 시 MIT/Apache 대안으로 교체할 것(worker.ts MODEL_ID).
 */
import type { AssetKind, RBInput, RemoveBgOptions, RemoveBgResult, Tier, WorkerResponse } from './types';

/** 서버 미세경계 티어 엔드포인트 — 아직 미배포. true가 되기 전엔 항상 온디바이스. */
const SERVER_ENABLED = false;
/** 추론 전 긴 변 다운스케일(메모리·속도). 보드 이미지(≈1024)엔 사실상 영향 없음. */
const MAX_EDGE = 1024;

/**
 * 🔴 안전 티어 분기(엔진 내부에서 강제 — 어디서 부르든 동일 적용).
 * - child-photo·unknown → 무조건 온디바이스(외부 전송 절대 금지).
 * - generated·object → allowServerTier + 서버 가동 시에만 서버 허용.
 */
export function pickTier(assetKind: AssetKind, allowServerTier?: boolean): Tier {
  if (assetKind === 'child-photo' || assetKind === 'unknown') return 'on-device';
  if (allowServerTier && SERVER_ENABLED && (assetKind === 'generated' || assetKind === 'object')) return 'server';
  return 'on-device';
}

let worker: Worker | null = null;
let seq = 0;
interface Pending {
  resolve: (r: { blob: Blob; width: number; height: number }) => void;
  reject: (e: unknown) => void;
  onProgress?: RemoveBgOptions['onProgress'];
}
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      if (m.type === 'result') {
        pending.get(m.id)?.resolve({ blob: m.blob, width: m.width, height: m.height });
        pending.delete(m.id);
      } else if (m.type === 'error') {
        if (m.id != null) {
          pending.get(m.id)?.reject(new Error(m.message));
          pending.delete(m.id);
        }
      } else if (m.type === 'progress' && m.id != null) {
        pending.get(m.id)?.onProgress?.({ stage: m.stage, progress: m.progress });
      }
    };
    worker.postMessage({ type: 'warmup' }); // 모델 1회 로드·워밍업(첫 실제 호출을 빠르게)
  }
  return worker;
}

/** 엔진 워밍업 — 유휴 시 미리 모델을 받아둔다(선택). */
export function warmupBackgroundRemoval(): void {
  getWorker();
}

async function normalizeToBitmap(input: RBInput): Promise<ImageBitmap> {
  if (typeof input === 'string') {
    const res = await fetch(input);
    return createImageBitmap(await res.blob());
  }
  if (input instanceof Blob) return createImageBitmap(input);
  if (typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement) {
    return createImageBitmap(input);
  }
  throw new Error('지원하지 않는 입력 형식입니다');
}

async function toDownscaledBlob(input: RBInput): Promise<Blob> {
  const bmp = await normalizeToBitmap(input);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 실패'))), 'image/png'),
  );
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('read 실패'));
    r.readAsDataURL(b);
  });
}

/**
 * 배경 제거 — 투명 PNG(blob+dataUrl) 반환. 모든 진입점(프롬프트바/인라인 버튼/게임뷰어)이 호출.
 * 백엔드는 WASM+q8 단일 경로. 현재 SERVER_ENABLED=false라 모든 소재가 온디바이스 처리된다.
 */
export async function removeBackground(input: RBInput, opts: RemoveBgOptions): Promise<RemoveBgResult> {
  const tier = pickTier(opts.assetKind, opts.allowServerTier);
  // 서버 티어는 미배포 — pickTier가 항상 on-device를 돌려주므로 분기 본체는 후속 작업.
  // (분기 자체는 여기 한 곳에 있어, 서버 가동 시 child-photo는 절대 진입하지 않는다.)

  const blob = await toDownscaledBlob(input);
  const w = getWorker();
  const id = ++seq;
  const out = await new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: opts.onProgress });
    if (opts.signal) {
      if (opts.signal.aborted) {
        pending.delete(id);
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      opts.signal.addEventListener(
        'abort',
        () => {
          // 추론 중간 취소는 불가(모델은 끝까지 실행) — 결과만 폐기한다.
          pending.delete(id);
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true },
      );
    }
    w.postMessage({ type: 'run', id, blob });
  });

  const dataUrl = await blobToDataUrl(out.blob);
  return { blob: out.blob, dataUrl, width: out.width, height: out.height, tier };
}

/* ── 잔여 노이즈 정리(despeckle) — 모델 없이 알파만 다듬는다 ───────────────
   이미 누끼된 이미지를 '다시 배경제거' 할 때 사용한다. 모델을 재실행하면 잘린 점을
   다시 전경으로 잡고, 대비 스트레치는 희미한 점을 키워 오히려 지저분해진다. 대신
   (1) 알파 하한 임계(키우지 않고 그 이하만 0) (2) 작은 연결요소(speckle) 제거
   (3) 가장자리 침식 을 단계적으로 적용해 흩어진 점·헤일로만 정확히 깎는다. */
export async function cleanupBackground(
  input: RBInput,
  opts: { level?: number; keepMainOnly?: boolean } = {},
): Promise<{ dataUrl: string; removed: number }> {
  const level = Math.max(1, Math.floor(opts.level ?? 1));
  const keepMainOnly = opts.keepMainOnly ?? false;
  const bmp = await normalizeToBitmap(input);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const N = w * h;
  let removed = 0;

  // 4연결 라벨링 헬퍼(mask: 1=전경) — 컴포넌트 크기 배열과 label을 채운다.
  const stack = new Int32Array(N);
  const labelOf = (mask: Uint8Array, label: Int32Array): number[] => {
    label.fill(0);
    const sizes: number[] = [0];
    let cur = 0;
    for (let s = 0; s < N; s++) {
      if (mask[s] !== 1 || label[s] !== 0) continue;
      cur++;
      sizes[cur] = 0;
      let sp = 0;
      stack[sp++] = s;
      label[s] = cur;
      while (sp > 0) {
        const p = stack[--sp];
        sizes[cur]++;
        const x = p % w;
        const y = (p / w) | 0;
        if (x > 0 && mask[p - 1] === 1 && label[p - 1] === 0) { label[p - 1] = cur; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] === 1 && label[p + 1] === 0) { label[p + 1] = cur; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] === 1 && label[p - w] === 0) { label[p - w] = cur; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] === 1 && label[p + w] === 0) { label[p + w] = cur; stack[sp++] = p + w; }
      }
    }
    return sizes;
  };
  // 1px 침식/팽창(4-이웃).
  const erode1 = (src: Uint8Array): Uint8Array => {
    const o = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
      if (!src[p]) continue;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !src[p - 1]) continue;
      if (x < w - 1 && !src[p + 1]) continue;
      if (y > 0 && !src[p - w]) continue;
      if (y < h - 1 && !src[p + w]) continue;
      o[p] = 1;
    }
    return o;
  };
  const dilate1 = (src: Uint8Array): Uint8Array => {
    const o = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
      if (src[p]) { o[p] = 1; continue; }
      const x = p % w, y = (p / w) | 0;
      if ((x > 0 && src[p - 1]) || (x < w - 1 && src[p + 1]) || (y > 0 && src[p - w]) || (y < h - 1 && src[p + w])) o[p] = 1;
    }
    return o;
  };

  const label = new Int32Array(N);

  if (keepMainOnly) {
    // ── 주 피사체만 남기기(누끼 노이즈 자동 정리) ──────────────────────────
    // 복잡한 배경의 매트는 피사체가 가는 '다리'로 배경 노이즈와 연결돼 있어 단순 라벨링으론
    // 못 끊는다. 모폴로지 오프닝(침식→가장 큰 덩어리→팽창)으로 다리를 끊고 주 피사체만 복원한다.
    const FLOOR = Math.round(0.30 * 255); // 희미한 노이즈·연결다리 제거(피사체 외곽은 보존)
    const E = 3; // 침식/팽창 횟수(다리 두께 < 2E면 끊김)
    const orig = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const a = data[i * 4 + 3];
      if (a > FLOOR) orig[i] = 1;
      else if (a > 0) { data[i * 4 + 3] = 0; removed++; }
    }
    let er: Uint8Array = orig;
    for (let k = 0; k < E; k++) er = erode1(er);
    const sizes = labelOf(er, label);
    let maxC = 0, maxS = 0;
    for (let c = 1; c < sizes.length; c++) if (sizes[c] > maxS) { maxS = sizes[c]; maxC = c; }
    let core: Uint8Array = new Uint8Array(N);
    if (maxC > 0) for (let p = 0; p < N; p++) core[p] = label[p] === maxC ? 1 : 0;
    for (let k = 0; k < E; k++) core = dilate1(core);
    // 복원한 주 피사체(원래 실루엣 내부) 밖은 모두 투명화.
    for (let p = 0; p < N; p++) {
      if (!(core[p] && orig[p]) && data[p * 4 + 3] !== 0) { data[p * 4 + 3] = 0; removed++; }
    }
  } else {
    // ── 기본(정리 버튼) ── 알파 하한 + 작은 섬 제거 + level별 가장자리 침식 ──
    const floor = Math.round(Math.min(0.5, 0.1 * level) * 255);
    const mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const a = data[i * 4 + 3];
      if (a > floor) mask[i] = 1;
      else if (a > 0) { data[i * 4 + 3] = 0; removed++; }
    }
    const minIsland = Math.max(16, Math.round(N * Math.min(0.012, 0.0018 * level)));
    const sizes = labelOf(mask, label);
    for (let p = 0; p < N; p++) {
      if (mask[p] === 1 && sizes[label[p]] < minIsland) { mask[p] = 0; data[p * 4 + 3] = 0; removed++; }
    }
    const erodePx = level >= 3 ? 2 : level >= 2 ? 1 : 0;
    for (let k = 0; k < erodePx; k++) {
      const prev = mask.slice();
      for (let p = 0; p < N; p++) {
        if (prev[p] !== 1) continue;
        const x = p % w, y = (p / w) | 0;
        const edge =
          (x > 0 && prev[p - 1] === 0) ||
          (x < w - 1 && prev[p + 1] === 0) ||
          (y > 0 && prev[p - w] === 0) ||
          (y < h - 1 && prev[p + w] === 0);
        if (edge) { mask[p] = 0; data[p * 4 + 3] = 0; removed++; }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  const dataUrl = await new Promise<string>((res, rej) =>
    canvas.toBlob((b) => {
      if (!b) return rej(new Error('toBlob 실패'));
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error('read 실패'));
      r.readAsDataURL(b);
    }, 'image/png'),
  );
  return { dataUrl, removed };
}
