/// <reference lib="webworker" />
/**
 * worker.ts — 배경 제거 추론 워커(메인스레드 밖). transformers.js로 BiRefNet을 1회
 * 로드·캐시·워밍업하고, 입력 이미지를 세그멘트해 알파 마스크를 합성한 투명 PNG를 돌려준다.
 * WebGPU 우선, 미지원 시 WASM 폴백. 모델 가중치는 HF CDN에서 받아 브라우저 Cache에 캐시된다.
 *
 * 🔴 LICENSE: 온디바이스 모델 = BiRefNet(onnx-community, MIT) — 상용 가능.
 *   RMBG-1.4(BRIA)·@imgly(AGPL)는 비상업/카피레프트라 채택 금지.
 */
// transformers.js의 동적 출력은 정적 타입이 느슨해 일부 any 캐스팅을 쓴다(주석 표기).
import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from './types';

// 원격(HF CDN) 모델만 — 로컬 경로 탐색 끔.
env.allowLocalModels = false;

/** 온디바이스 기본 모델(MIT). 더 정밀한 변형(BiRefNet-ONNX/HR)으로 교체 가능. */
const MODEL_ID = 'onnx-community/BiRefNet_lite-ONNX';

type Loaded = { model: unknown; processor: unknown; device: string };
let loadPromise: Promise<Loaded> | null = null;

function post(m: WorkerResponse, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(m, transfer);
}

async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu) {
    try {
      // 일부 환경(헤드리스/CDP 프리뷰)에서 requestAdapter가 영원히 pending → 타임아웃으로 WASM 폴백.
      const adapter = await Promise.race([
        gpu.requestAdapter(),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (adapter) return 'webgpu';
    } catch {
      /* fall through */
    }
  }
  return 'wasm';
}

function load(): Promise<Loaded> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const device = await pickDevice();
      // dtype: WebGPU=fp16(115MB·빠름·GPU에 최적). WASM 폴백=fp32(224MB) — onnxruntime-web의
      // WASM EP는 fp16 세션 초기화가 불안정(행/미지원)해서 폴백엔 fp32가 안전하다.
      const dtype = device === 'webgpu' ? 'fp16' : 'fp32';
      post({ type: 'progress', stage: `loading-model:${device}` });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = await AutoModel.from_pretrained(MODEL_ID, { device, dtype } as any);
      const processor = await AutoProcessor.from_pretrained(MODEL_ID);
      // NOTE: BiRefNet_lite-ONNX는 입력이 1024×1024로 '고정'(동적 아님)이라 추론 해상도를 낮출 수
      // 없다. 따라서 WASM 폴백은 1024²로 돌아 메모리를 많이 쓴다(저사양/메모리 부족 기기에선 실패 가능
      // → 호출부가 실패를 받아 원본 유지). 권장 경로는 WebGPU. 더 가벼운 폴백이 필요하면 입력이
      // 동적인 MIT 모델(예: BiRefNet_lite의 동적 export)이나 서버 티어를 후속 검토.
      return { model, processor, device };
    })();
  }
  return loadPromise;
}

async function run(id: number, blob: Blob): Promise<void> {
  const { model, processor } = await load();
  post({ type: 'progress', id, stage: 'segmenting' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const image: any = await (RawImage as any).fromBlob(blob);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pixel_values } = await (processor as any)(image);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { output_image } = await (model as any)({ input_image: pixel_values });
  // BiRefNet: 시그모이드→0..255 uint8 마스크 → 원본 크기로 리사이즈(살리언트 객체 매트).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mask: any = await (RawImage as any).fromTensor(
    output_image[0].sigmoid().mul(255).to('uint8'),
  ).resize(image.width, image.height);

  // RGBA로 변환 후 마스크를 알파 채널에 주입.
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
      const { device } = await load();
      post({ type: 'ready', device });
    } else if (msg.type === 'run') {
      await run(msg.id, msg.blob);
    }
  } catch (err) {
    const id = 'id' in msg ? (msg as { id?: number }).id : undefined;
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
