/**
 * 자료 유입 — 파일/보관함 → ElementNode, assetKind 승계, 온디바이스 배경제거.
 *
 * 외부 파일 드롭/업로드 = origin 'upload'(teacher-upload), 보드 보관함 복사 =
 * origin 'board-copy'(원본은 보관함 유지). 배경제거는 BiRefNet 공유 기능만 사용
 * (@imgly 금지). child-photo 등 민감 자산은 toRemoveBgAssetKind가 온디바이스 강제.
 */
import { newId } from '@/store/boardStore';
import { removeBackground } from '@/shared/background-removal';
import { toRemoveBgAssetKind, type AssetKind } from '@/shared/assetKind';
import type { AssetRef, Behavior, ElementNode, ElementOrigin, InteractiveNode } from '../schema/interactiveNode';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('파일을 읽지 못했어요'));
    r.readAsDataURL(file);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('이미지를 읽지 못했어요'));
    img.src = src;
  });
}

/** 업로드/외부 파일 → AssetRef(dataURL). 기본 분류 teacher-upload. */
export async function fileToAssetRef(file: File, assetKind: AssetKind = 'teacher-upload'): Promise<AssetRef> {
  const src = await readFileAsDataUrl(file);
  let w: number | undefined;
  let h: number | undefined;
  try {
    ({ w, h } = await imageSize(src));
  } catch {
    /* 크기 못 읽어도 src는 유효 */
  }
  return { id: newId('asset'), src, assetKind, width: w, height: h };
}

/** 보관함/URL 자산 → AssetRef(복사본 참조). 원본은 보관함에 그대로 남는다. */
export async function urlToAssetRef(url: string, assetKind: AssetKind = 'teacher-upload'): Promise<AssetRef> {
  let w: number | undefined;
  let h: number | undefined;
  try {
    ({ w, h } = await imageSize(url));
  } catch {
    /* ignore */
  }
  return { id: newId('asset'), src: url, assetKind, width: w, height: h };
}

/** 온디바이스 배경제거(BiRefNet/RMBG). 분류는 그대로 승계, src만 투명 PNG로 교체. */
export async function removeBgFromAssetRef(ref: AssetRef): Promise<AssetRef> {
  const res = await removeBackground(ref.src, { assetKind: toRemoveBgAssetKind(ref.assetKind) });
  return { ...ref, id: newId('asset'), src: res.dataUrl, width: res.width, height: res.height };
}

/** 이미지 요소 — 캔버스의 ~40% 안에 등비로 맞춰 at(논리 좌표) 중심에 배치. */
export function makeImageElement(
  ref: AssetRef,
  origin: ElementOrigin,
  at: { x: number; y: number },
  canvas: { w: number; h: number },
): ElementNode {
  const maxW = canvas.w * 0.4;
  const maxH = canvas.h * 0.4;
  const aw = ref.width ?? 400;
  const ah = ref.height ?? 300;
  const k = Math.min(maxW / aw, maxH / ah, 1);
  const w = Math.max(48, Math.round(aw * k));
  const h = Math.max(48, Math.round(ah * k));
  return {
    id: newId('el'),
    kind: 'image',
    src: ref,
    origin,
    assetKind: ref.assetKind,
    transform: { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, rotation: 0, z: 0 },
  };
}

/** 동영상 요소 — 16:9 박스(자연 크기 못 읽음)로 캔버스 ~40% 폭에 맞춰 중심 배치. */
export function makeVideoElement(
  ref: AssetRef,
  origin: ElementOrigin,
  at: { x: number; y: number },
  canvas: { w: number; h: number },
): ElementNode {
  const w = Math.round(canvas.w * 0.4);
  const h = Math.round(w * (9 / 16));
  return {
    id: newId('el'),
    kind: 'video',
    src: ref,
    origin,
    assetKind: ref.assetKind,
    transform: { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, rotation: 0, z: 0 },
  };
}

/** 글자 요소. */
export function makeTextElement(text: string, at: { x: number; y: number }): ElementNode {
  const w = 360;
  const h = 120;
  return {
    id: newId('el'),
    kind: 'text',
    text,
    origin: 'upload',
    assetKind: 'teacher-upload',
    transform: { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, rotation: 0, z: 0 },
  };
}

/** 도형 요소. */
export function makeShapeElement(at: { x: number; y: number }): ElementNode {
  const w = 200;
  const h = 200;
  return {
    id: newId('el'),
    kind: 'shape',
    origin: 'upload',
    assetKind: 'teacher-upload',
    transform: { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, rotation: 0, z: 0 },
  };
}

/** 요소를 문서에 추가 — z를 맨 위로 올려 새 요소가 앞에 오게. */
export function withElementAdded(doc: InteractiveNode, el: ElementNode): InteractiveNode {
  const topZ = doc.elements.reduce((m, e) => Math.max(m, e.transform.z), 0);
  const placed: ElementNode = { ...el, transform: { ...el.transform, z: topZ + 1 } };
  return { ...doc, elements: [...doc.elements, placed] };
}

/** 요소 교체(transform 유지) — src/배경제거 결과 반영. */
export function withElementReplaced(doc: InteractiveNode, elId: string, patch: Partial<ElementNode>): InteractiveNode {
  return {
    ...doc,
    elements: doc.elements.map((e) => (e.id === elId ? ({ ...e, ...patch } as ElementNode) : e)),
  };
}

/**
 * 삭제 계열 편집 뒤 참조 무결성 청소 — (a) 존재하지 않는 behavior id를 then/after에서 제거,
 * (b) 삭제된 연결을 참조하는 moveAlongPath behavior를 통째로 제거.
 * 잔여 참조를 남기면 저장분이 리로드 때 스키마 검증(superRefine)에서 통째로 무효가 되어
 * 게임이 빈 카드로 증발한다. 정상 문서엔 no-op(같은 참조 반환) — 순수 함수.
 */
export function sanitizeDoc(doc: InteractiveNode): InteractiveNode {
  const connIds = new Set(doc.connections.map((c) => c.id));
  // (b) 경로가 사라진 moveAlongPath 는 실행 불가 — 먼저 걸러내고, 그 id들도 아래 (a)에서 정리된다.
  const alive = doc.behaviors.filter((b) => b.action !== 'moveAlongPath' || connIds.has(b.params.connectionId));
  const behIds = new Set(alive.map((b) => b.id));
  let changed = alive.length !== doc.behaviors.length;
  const behaviors = alive.map((b) => {
    const afterOk = b.after === undefined || behIds.has(b.after);
    const keptThen = b.then?.filter((t) => behIds.has(t));
    const thenOk = !b.then || !keptThen || keptThen.length === b.then.length;
    if (afterOk && thenOk) return b;
    changed = true;
    return {
      ...b,
      after: afterOk ? b.after : undefined,
      then: thenOk ? b.then : keptThen && keptThen.length ? keptThen : undefined,
    } as Behavior;
  });
  return changed ? { ...doc, behaviors } : doc;
}

/** 요소 삭제 + 그 요소를 target/대상으로 쓰는 behavior도 함께 제거(참조 무결성).
 *  잔여 then/after·경로 참조는 sanitizeDoc이 마저 청소한다. */
export function withElementRemoved(doc: InteractiveNode, elId: string): InteractiveNode {
  return sanitizeDoc({
    ...doc,
    elements: doc.elements.filter((e) => e.id !== elId),
    behaviors: doc.behaviors.filter((b) => b.target !== elId),
    connections: doc.connections.filter((c) => c.from !== elId && c.to !== elId),
  });
}
