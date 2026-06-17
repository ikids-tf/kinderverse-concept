/// <reference lib="webworker" />
/**
 * segment.worker.ts — 클릭 지점 객체 분할(Segment Anything, point-prompt). 이미지의 '의미적
 * 요소'를 이해해 클릭한 객체의 정확한 마스크를 돌려준다(색 유사성 flood-fill과 달리 맥락 기반).
 *
 * 모델 = Xenova/slimsam-77-uniform (SlimSAM, Apache-2.0) — 경량 SAM. WASM + q8.
 * 흐름: prepare(이미지 임베딩 1회 계산·캐시) → point(클릭마다 디코더만 빠르게 실행).
 */
import { SamModel, AutoProcessor, RawImage, Tensor, env } from '@huggingface/transformers';

env.allowLocalModels = false;
try {
  env.backends.onnx.wasm.numThreads = Math.min((navigator as Navigator).hardwareConcurrency || 4, 8);
} catch {
  /* 무시 */
}

const MODEL_ID = 'Xenova/slimsam-77-uniform';

// transformers.js의 동적 출력은 정적 타입이 느슨해 any 캐스팅을 쓴다.
/* eslint-disable @typescript-eslint/no-explicit-any */
let loadP: Promise<{ model: any; processor: any }> | null = null;
function load() {
  if (!loadP) {
    loadP = (async () => {
      post({ type: 'progress', stage: 'loading-model' });
      const model = await (SamModel as any).from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
      const processor = await (AutoProcessor as any).from_pretrained(MODEL_ID);
      return { model, processor };
    })();
  }
  return loadP;
}

// 한 장의 이미지 임베딩만 캐시(편집기는 한 번에 한 이미지).
let cur: { id: string; emb: any; original_sizes: any; reshaped_input_sizes: any; model: any; processor: any } | null = null;

async function prepare(id: string, blob: Blob) {
  const { model, processor } = await load();
  const image = await (RawImage as any).fromBlob(blob);
  const base = await processor(image);
  const emb = await model.get_image_embeddings(base);
  cur = {
    id,
    emb,
    original_sizes: base.original_sizes,
    reshaped_input_sizes: base.reshaped_input_sizes,
    model,
    processor,
  };
}

async function point(id: string, x: number, y: number): Promise<{ mask: Uint8Array; w: number; h: number }> {
  if (!cur || cur.id !== id) throw new Error('not-prepared');
  const { model, processor, emb, original_sizes, reshaped_input_sizes } = cur;
  const pts = new (Tensor as any)('float32', [x, y], [1, 1, 1, 2]);
  const lbl = new (Tensor as any)('int64', [1n], [1, 1, 1]);
  const out = await model({ ...emb, input_points: pts, input_labels: lbl });
  const masks = await processor.post_process_masks(out.pred_masks, original_sizes, reshaped_input_sizes);
  const m = masks[0]; // dims [1, nM, H, W]
  const dims = m.dims as number[];
  const nM = dims[1], H = dims[2], W = dims[3], per = H * W;
  const md = m.data as Uint8Array | Int8Array;
  const iou: number[] = out.iou_scores?.data ? Array.from(out.iou_scores.data as ArrayLike<number>) : [];
  const cx = Math.min(W - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(H - 1, Math.max(0, Math.round(y)));

  // SAM은 3개 후보(전체 객체 / 부분 / 세부)를 준다. 단순히 '가장 큰 것'을 고르면 작은 객체를
  // 클릭했을 때 이웃 객체까지 포함된 비정상 마스크가 잡힌다(예: 물방울 클릭→해파리 포함).
  // 그래서 **신뢰도(IoU)가 최고에 근접한 후보 중에서만 가장 큰 것**을 고른다.
  //  · 물방울+해파리 같은 비정상 마스크는 IoU가 뚝 떨어져 자연 배제 → 물방울만 선택.
  //  · 지갑처럼 전체가 또렷한 객체는 '전체' 마스크의 IoU가 '패치'와 비슷하므로 전체가 선택.
  // 클릭 점을 포함하고 거의 전체 화면(>92%)이 아닌 후보만 대상으로 한다.
  const CAP = 0.92;
  const areas: number[] = [];
  for (let k = 0; k < nM; k++) { let a = 0; for (let i = 0; i < per; i++) if (md[k * per + i]) a++; areas.push(a); }
  const contains = (k: number) => !!md[k * per + cy * W + cx];
  const cands = [];
  for (let k = 0; k < nM; k++) if (contains(k) && areas[k] / per <= CAP) cands.push(k);
  if (cands.length === 0) for (let k = 0; k < nM; k++) if (areas[k] / per <= CAP) cands.push(k); // 폴백: 포함 후보 없음
  let best = -1;
  if (cands.length > 0) {
    const bestIou = Math.max(...cands.map((k) => iou[k] ?? 0));
    const MARGIN = 0.06; // 최고 IoU에서 이만큼 안쪽이면 '같은 품질'로 보고 더 큰 쪽을 허용
    const strong = cands.filter((k) => (iou[k] ?? 0) >= bestIou - MARGIN);
    let bestArea = -1;
    for (const k of strong) if (areas[k] > bestArea) { bestArea = areas[k]; best = k; }
  }
  if (best < 0) best = 0;

  const mask = new Uint8Array(per);
  for (let i = 0; i < per; i++) mask[i] = md[best * per + i] ? 1 : 0;
  return { mask, w: W, h: H };
}

interface Resp {
  type: 'ready' | 'mask' | 'error' | 'progress';
  id?: string;
  reqId?: string;
  mask?: Uint8Array;
  w?: number;
  h?: number;
  stage?: string;
  message?: string;
}
function post(m: Resp, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(m, transfer);
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data ?? {};
  try {
    if (msg.type === 'prepare') {
      await prepare(msg.id, msg.blob);
      post({ type: 'ready', id: msg.id });
    } else if (msg.type === 'point') {
      const r = await point(msg.id, msg.x, msg.y);
      post({ type: 'mask', id: msg.id, reqId: msg.reqId, mask: r.mask, w: r.w, h: r.h }, [r.mask.buffer]);
    }
  } catch (err: any) {
    post({ type: 'error', id: msg.id, reqId: msg.reqId, message: err?.message ?? String(err) });
  }
};
