/**
 * removeBackground.ts — 배경 제거 공용 엔진(단일 진입점). 보드/게임뷰어 등 모든 호출부가
 * 이 함수만 부른다(로직 중복 금지). 입력을 일반화·≤1024px 다운스케일해 워커로 보내고,
 * 안전 티어 분기를 한 곳에서 강제한다.
 *
 * 🔴 LICENSE TODO(상용 출시 전 점검): 온디바이스 = BiRefNet(onnx-community, MIT) — 상용 가능.
 *   RMBG-1.4(BRIA)·@imgly(AGPL)는 비상업/카피레프트 → 채택 금지. 서버 미세경계 티어
 *   (BiRefNet-HR/BEN2 등) 추가 시 해당 모델·가중치·호스팅 라이선스를 재점검할 것.
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
 * 현재 SERVER_ENABLED=false라 모든 소재가 온디바이스 처리된다.
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
