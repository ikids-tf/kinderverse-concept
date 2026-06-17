/// <reference lib="webworker" />
/**
 * worker.ts — 배경 제거 추론 워커(메인스레드 밖). transformers.js로 매팅 모델을 1회
 * 로드·캐시·워밍업하고, 입력 이미지를 세그멘트해 알파 마스크를 합성한 투명 PNG를 돌려준다.
 *
 * 백엔드 = **WASM + q8 단일 경로**(WebGPU 제거). 이유:
 *  - 이 매팅 모델은 셰이더 스테이지당 storage buffer 17개가 필요한데, 실측상 다수 기기의
 *    WebGPU 한계가 16이라 "Too many storage buffers"로 실패(실 GPU에서도 불가 확정).
 *  - fp32/fp16은 메모리가 커 저사양·임베디드 환경에서 OrtRun std::bad_alloc(OOM).
 *  - q8(양자화)은 메모리 ~1/4라 WASM에서 안정적으로 동작(검증: q8 약 9~13초로 정상).
 *  멀티스레드 WASM(cross-origin isolated)일 때 더 빠르나, 미설정이면 1스레드로 동작만 동일.
 *
 * 🔴 LICENSE(상용 출시 전 반드시 교체): 현재 모델 = **briaai/RMBG-1.4 (BRIA, 비상업)**.
 *   사용자 승인 하에 프로토타입용으로 채택 — CLAUDE.md §2의 단일색/라이선스 원칙상 상업
 *   출시 시엔 BRIA 유료 라이선스 또는 MIT/Apache 대안으로 교체해야 한다(아래 대안 참고).
 *   상업 안전 대안(코드 그대로, MODEL_ID·키만 교체): BiRefNet(MIT, q8 없음·메모리 큼) /
 *   Xenova/modnet(Apache, q8 보유·인물 매팅 특화, 입력 키 'input'/출력 'output').
 */
// transformers.js의 동적 출력은 정적 타입이 느슨해 일부 any 캐스팅을 쓴다(주석 표기).
import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from './types';

// 원격(HF CDN) 모델만 — 로컬 경로 탐색 끔.
env.allowLocalModels = false;
// 멀티스레드 WASM — cross-origin isolated 환경에서만 실제로 켜진다(아니면 1스레드로 폴백).
try {
  env.backends.onnx.wasm.numThreads = Math.min((navigator as Navigator).hardwareConcurrency || 4, 8);
} catch {
  /* 일부 환경에서 설정 불가 — 무시(기본값 사용) */
}

/** 배경 제거 모델. q8 변형이 있어 WASM 메모리에 맞는다. */
const MODEL_ID = 'briaai/RMBG-1.4';

type Loaded = { model: unknown; processor: unknown };
let loadPromise: Promise<Loaded> | null = null;

function post(m: WorkerResponse, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(m, transfer);
}

function load(): Promise<Loaded> {
  if (!loadPromise) {
    loadPromise = (async () => {
      post({ type: 'progress', stage: 'loading-model:wasm:q8' });
      const model = await AutoModel.from_pretrained(MODEL_ID, {
        // RMBG-1.4는 표준 HF 아키텍처가 아니라 custom config로 로드한다.
        config: { model_type: 'custom' },
        device: 'wasm',
        dtype: 'q8',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const processor = await AutoProcessor.from_pretrained(MODEL_ID);
      return { model, processor };
    })();
  }
  return loadPromise;
}

async function infer(loaded: Loaded, id: number, blob: Blob): Promise<void> {
  const { model, processor } = loaded;
  post({ type: 'progress', id, stage: 'segmenting' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const image: any = await (RawImage as any).fromBlob(blob);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pixel_values } = await (processor as any)(image);
  // RMBG-1.4: 입력 키 'input', 출력 키 'output'(이미 0..1 정규화된 매트 — 시그모이드 불필요).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { output } = await (model as any)({ input: pixel_values });
  // 0..1 → 0..255 uint8 마스크 → 원본 크기로 리사이즈.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mask: any = await (RawImage as any).fromTensor(
    output[0].mul(255).to('uint8'),
  ).resize(image.width, image.height);

  // 모델 매트를 그대로 알파 채널에 주입(충실 출력). 잔여 노이즈 정리는 호출부의
  // cleanupBackground(모델 없이 알파 despeckle)에서 단계적으로 수행한다.
  const rgba = image.rgba();
  const data = new Uint8ClampedArray(rgba.data);
  const md = mask.data as Uint8Array;
  for (let i = 0; i < md.length; i++) data[i * 4 + 3] = md[i];

  const canvas = new OffscreenCanvas(rgba.width, rgba.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.putImageData(new ImageData(data, rgba.width, rgba.height), 0, 0);
  const out = await canvas.convertToBlob({ type: 'image/png' });
  post({ type: 'result', id, blob: out, width: rgba.width, height: rgba.height });
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'warmup') {
      await load();
      post({ type: 'ready', device: 'wasm' });
    } else if (msg.type === 'run') {
      await infer(await load(), msg.id, msg.blob);
    }
  } catch (err) {
    const id = 'id' in msg ? (msg as { id?: number }).id : undefined;
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
