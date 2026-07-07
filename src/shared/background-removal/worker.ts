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
import { postProcessMatte, refineMatte } from './matte';
import type { WorkerRequest, WorkerResponse } from './types';

// 원격(HF CDN) 모델만 — 로컬 경로 탐색 끔.
env.allowLocalModels = false;
// 멀티스레드 WASM — cross-origin isolated 환경에서만 실제로 켜진다(아니면 1스레드로 폴백).
try {
  const wasm = env.backends?.onnx?.wasm;
  if (wasm) wasm.numThreads = Math.min((navigator as Navigator).hardwareConcurrency || 4, 8);
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

async function infer(loaded: Loaded, id: number, blob: Blob, mainOnly: boolean): Promise<void> {
  const { model, processor } = loaded;
  post({ type: 'progress', id, stage: 'segmenting' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const image: any = await (RawImage as any).fromBlob(blob);
  // ⚠️ 입력 알파는 **추론 전에** 캡처해야 한다 — processor가 RawImage를 제자리에서
  // RGB(3채널)로 변환할 수 있어, 추론 뒤 image.rgba()는 알파를 255로 '재구성'한다
  // (실측: 재실행 시 입력 투명 영역이 불투명 검정으로 되살아나던 원인).
  const nPix = image.width * image.height;
  const inA = new Uint8Array(nPix);
  let inTrans = 0;
  if (image.channels === 4) {
    const src = image.data as Uint8Array;
    for (let i = 0; i < nPix; i++) {
      inA[i] = src[i * 4 + 3];
      if (inA[i] < 8) inTrans++;
    }
  } else {
    inA.fill(255); // 3채널 입력(JPEG 등) — 전부 불투명
  }
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

  // 매트 다듬기 2단 — 모두 '워커 안'에서 끝낸다(여기만 raw 매트=모델 확신도와
  // 프리멀티플라이 이전의 원본 RGB가 살아 있다 — 캔버스를 거치면 α=0 픽셀 RGB가
  // 검정으로 소실돼 구멍 복원이 불가능해진다. 실측 확정: putImageData→PNG,
  // drawImage→getImageData 두 지점 모두에서 소실).
  //  1) refineMatte: 전역 헤이즈 보정(테두리 링에서 배경 수준 추정 → smoothstep).
  //  2) postProcessMatte: 맥락적 후처리 — 주 피사체 유지·에워싸인 구멍의
  //     진짜 틈/오류 구멍 분류(이미지 적응 raw 앵커+배경색 크로마)·디프린지. matte.ts 참고.
  const md = mask.data as Uint8Array;
  const raw = md.slice(); // refine 이전 원본 매트(모델 확신도) 보존
  const levels = refineMatte(md, image.width, image.height);
  const rgba = image.rgba();
  const data = new Uint8ClampedArray(rgba.data);
  post({ type: 'progress', id, stage: 'post-processing' }); // 마지막 수백 ms가 '멈춤'으로 안 보이게
  // 입력 알파 가드 — 이미 누끼된 PNG를 재실행하면 α=0 픽셀의 RGB가 입력 단계에서 이미
  // 검정으로 소실돼 있다. (a) 그런 입력에선 색 판정·디프린지를 끄고(colorTrusted=false),
  // (b) 최종 알파를 입력 알파(위에서 추론 전 캡처한 inA)와 min 병합해 '구멍 복원'이
  //     검정을 되살리지 못하게 한다.
  postProcessMatte(md, raw, data, image.width, image.height, {
    mainOnly,
    bgLevel: levels.p25,
    colorTrusted: inTrans / md.length < 0.02,
  });
  for (let i = 0; i < md.length; i++) data[i * 4 + 3] = Math.min(md[i], inA[i]);

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
      await infer(await load(), msg.id, msg.blob, msg.mainOnly === true);
    }
  } catch (err) {
    const id = 'id' in msg ? (msg as { id?: number }).id : undefined;
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
