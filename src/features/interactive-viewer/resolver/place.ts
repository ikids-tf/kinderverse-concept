/**
 * Resolver — 조립 + 꼬리 재사용 + 레인 배치(PROMPT 2).
 *
 * 흐름(SKILL.md 꼬리 호출 순서): 레시피 build → fillTokenImages(gen:→실제 그림+누끼) →
 * safeParse(참조무결성) → autoLayout(역할대로 배치) → clamp → 레인 배치 → store.mutate(커밋·undo).
 *
 * 🔴 레인 통합 규칙(CLAUDE.md): 꼬리는 '레인 1개짜리 독립 1280 게임'에만 돈다. 그 뒤 빈/신규
 *   노드는 레인 0(평행이동 0 — 게임이 곧 노드), 기존 멀티레인 노드는 +N*1280 평행이동으로
 *   밴드에 머지한다. 다중 레인 노드 전체에 autoLayout 재실행 금지(캔버스 1280 리셋 → 전 레인 뭉개짐).
 *
 * ⚠ composeInteractiveNode/buildNode 는 호출하지 않는다(LLM 포함 — 롱테일 폴백 전용).
 *   export 된 꼬리 함수(fillTokenImages/autoLayout/safeParse)만 직접 태운다.
 */
import { fillTokenImages, generateCharacterSheet, generateCutoutAsset, generateSceneBackground } from '../authoring/artDirect';
import { urlToAssetRef } from '../runtime/assetIngest';
import { autoLayout } from '../authoring/layout';
import { offsetLane } from '../authoring/extendLane';
import { safeParseInteractiveNode } from '../schema/parse';
import { clampXY } from '../runtime/geometry';
import { saveActorSide } from '../store/actorPoses';
import { useInteractiveStore } from '../store/interactiveStore';
import type { InteractiveNode } from '../schema/interactiveNode';
import { buildRecipe, getRecipe } from './index';
import type { MechanismId, RecipeInput } from './recipeTypes';

const LANE_W = 1280;

/** 액터(이동 캐릭터) id — moveAlongPath 대상이며 tap/sequenceTap 대상이 아닌 순수 이동체.
    composeNode.actorFrontIds 와 동일 규칙(정면+측면 2포즈 생성 대상). */
function actorFrontIds(node: InteractiveNode): Set<string> {
  const moveT = new Set(node.behaviors.filter((b) => b.action === 'moveAlongPath').map((b) => b.target));
  const tapT = new Set(
    node.behaviors.filter((b) => b.trigger === 'tap' || b.trigger === 'sequenceTap').map((b) => b.target),
  );
  return new Set([...moveT].filter((id) => !tapT.has(id)));
}

/**
 * ★ swap.to 누끼 패스(별도) — fillTokenImages 는 elements 만 훑으므로, behavior 의 swap.to.src 에
 *   담긴 'gen:라벨'(memory-flip 카드 앞면·free-create 프리셋 옵션 등)은 채워지지 않는다
 *   (displaySrc InteractiveStage.tsx:1222 가 to.src 를 그대로 렌더 → gen: 문자열이면 깨짐).
 *   여기서 그 라벨만 generateCutoutAsset 로 누끼 이미지 AssetRef 로 치환한다(기존 꼬리 무수정).
 */
async function fillSwapImages(raw: { behaviors?: Array<Record<string, unknown>> }): Promise<void> {
  const behs = Array.isArray(raw.behaviors) ? raw.behaviors : [];
  const targets = behs.filter((b) => {
    const to = b.action === 'swap' ? (b.params as { to?: { src?: unknown } } | undefined)?.to : undefined;
    return typeof to?.src === 'string' && (to.src.startsWith('gen:') || to.src.startsWith('genf:'));
  });
  await Promise.all(
    targets.map(async (b) => {
      const to = (b.params as { to: { src: string } }).to;
      const front = to.src.startsWith('genf:'); // 정면 캐릭터(옷입히기 착장) → CHARACTER_FRONT_STYLE
      const label = to.src.slice(front ? 5 : 4).trim();
      const ref = await generateCutoutAsset(label, true, front);
      (b.params as { to: unknown }).to = ref;
    }),
  );
}

/**
 * ★ 배경 이미지 패스(별도) — src 가 'bggen:라벨' 인 요소(전체 화면 배경 — dress-up '실외' 등)를
 *   generateSceneBackground(누끼 없음·풀블리드)로 채운다. fillTokenImages 는 'gen:'만 누끼 처리하므로
 *   배경은 여기서 따로 채운다(배경을 누끼하면 하늘·바닥이 잘려 깨진다). 실패 시 도형 폴백.
 */
async function fillSceneImages(raw: { elements?: Array<Record<string, unknown>> }): Promise<void> {
  const els = Array.isArray(raw.elements) ? raw.elements : [];
  const srcOf = (e: Record<string, unknown>): string | null => {
    const s = e.src;
    if (typeof s === 'string' && s.startsWith('bggen:')) return s.slice(6).trim();
    if (s && typeof s === 'object' && typeof (s as { src?: unknown }).src === 'string' && (s as { src: string }).src.startsWith('bggen:')) {
      return (s as { src: string }).src.slice(6).trim();
    }
    return null;
  };
  await Promise.all(
    els
      .map((e) => ({ e, label: srcOf(e) }))
      .filter((t): t is { e: Record<string, unknown>; label: string } => !!t.label)
      .map(async ({ e, label }) => {
        const ref = await generateSceneBackground(label);
        if (ref) e.src = ref;
        else { e.kind = 'shape'; delete e.src; }
      }),
  );
}

/**
 * ★ 캐릭터 시트 패스 — src 가 'sheet:라벨' 인 요소들(옷입히기의 맨몸·각 착장 = 모두 같은 아이)을
 *   한 장 시트로 한꺼번에 그려(같은 얼굴 보장) 컷별로 채운다. 시트 실패 시 개별 정면 생성 폴백.
 *   (요소 배열 순서 = 시트 컷 순서 = 라벨 순서. 옷입히기 레시피가 맨몸→착장 순으로 추가.)
 */
async function fillCharacterSheets(raw: { elements?: Array<Record<string, unknown>> }): Promise<void> {
  const els = Array.isArray(raw.elements) ? raw.elements : [];
  const labelOf = (e: Record<string, unknown>): string | null => {
    const s = e.src;
    const v = typeof s === 'string' ? s : s && typeof s === 'object' && typeof (s as { src?: unknown }).src === 'string' ? (s as { src: string }).src : null;
    return typeof v === 'string' && v.startsWith('sheet:') ? v.slice(6).trim() : null;
  };
  const targets = els.map((e) => ({ e, label: labelOf(e) })).filter((t): t is { e: Record<string, unknown>; label: string } => !!t.label);
  if (targets.length < 2) {
    // 1개뿐이면 시트가 의미 없음 — 개별 정면 생성.
    await Promise.all(targets.map(async (t) => { t.e.src = await generateCutoutAsset(t.label, true, true); }));
    return;
  }
  const sheet = await generateCharacterSheet(targets.map((t) => t.label));
  if (sheet && sheet.length === targets.length) {
    await Promise.all(targets.map(async (t, i) => { try { t.e.src = await urlToAssetRef(sheet[i], 'generated'); } catch { t.e.kind = 'shape'; delete t.e.src; } }));
  } else {
    // 시트 생성 실패 → 개별 정면 생성(일관성↓이지만 깨지지 않게).
    await Promise.all(targets.map(async (t) => { t.e.src = await generateCutoutAsset(t.label, true, true); }));
  }
}

/** 좌표 클램프(화면 밖 이탈 방지) — composeNode.clampNode 와 동일. */
function clampNode(node: InteractiveNode): InteractiveNode {
  const { w: cw, h: ch } = node.canvas.size;
  return {
    ...node,
    elements: node.elements.map((e) => {
      const t = e.transform;
      const { x, y } = clampXY(t.x, t.y, t.w, t.h, cw, ch);
      return x === t.x && y === t.y ? e : { ...e, transform: { ...t, x, y } };
    }),
  };
}

/**
 * 꼬리 실행 — 레인 1개짜리 독립 1280 게임에만 돈다.
 * fillTokenImages(gen:→그림+누끼) → safeParse → autoLayout → clamp.
 * 검증 실패(레시피 버그) 시 null.
 */
async function runTail(
  node: InteractiveNode,
  manualLayout: boolean,
  sceneDesc?: string,
  onBusy?: (m: string | null) => void,
): Promise<InteractiveNode | null> {
  // 장면 배경 생성을 토큰 그림과 '병렬'로 — 색 토큰 배경(pastel.*)일 때만(compose 동일).
  // 설명은 테마 sceneDesc 우선, 없으면 노드 title 폴백.
  const needBg = typeof node.canvas.background === 'string';
  const bgPromise = needBg ? generateSceneBackground(sceneDesc || node.title, node.title) : null;

  // fillTokenImages 는 raw 객체를 in-place 변형 → 깊은 복제본을 넘긴다.
  const raw = JSON.parse(JSON.stringify(node)) as Parameters<typeof fillTokenImages>[0];
  await fillTokenImages(raw, {
    onBusy,
    theme: node.title,
    frontIds: actorFrontIds(node),
    onActorSide: (elId, uri) => saveActorSide(node.id, elId, uri),
  });
  await fillSwapImages(raw as { behaviors?: Array<Record<string, unknown>> }); // behavior swap.to 의 gen: 라벨 채우기
  await fillSceneImages(raw as { elements?: Array<Record<string, unknown>> }); // bggen: 전체화면 배경 채우기(누끼 없음)
  await fillCharacterSheets(raw as { elements?: Array<Record<string, unknown>> }); // sheet: 같은 아이 여러 착장 한 장 시트
  const parsed = safeParseInteractiveNode(raw);
  if (!parsed.success) return null;
  // manualLayout 레시피(드래그 분류 등)는 autoLayout 을 건너뛰고 레시피 좌표를 그대로 쓴다.
  let laid = manualLayout ? parsed.data : autoLayout(parsed.data);
  // 생성된 장면 배경이 있으면 캔버스에 깐다(실패 시 색 토큰 유지).
  if (bgPromise) {
    onBusy?.('🎨 장면 배경을 그리는 중…');
    const bgRef = await bgPromise;
    if (bgRef) laid = { ...laid, canvas: { ...laid.canvas, background: bgRef } };
  }
  return clampNode(laid);
}

export interface PlaceResult {
  ok: boolean;
  /** 배치된 레인 인덱스(0=초기 게임). */
  lane: number;
  message: string;
}

/**
 * 레시피를 조립·생성해 대상 노드의 레인에 배치·커밋한다.
 *  - 빈/신규 노드 → 레인 0(게임이 곧 노드, 평행이동 0).
 *  - 기존 멀티레인 노드 → 다음 밴드(+N*1280)로 평행이동 머지(확장).
 */
export async function assembleAndPlace(
  docId: string,
  mechanism: MechanismId,
  input: Omit<RecipeInput, 'docId'>,
  onBusy?: (m: string | null) => void,
): Promise<PlaceResult> {
  const store = useInteractiveStore.getState();
  const base = store.peek(docId) ?? store.ensure(docId);

  // 1) 결정론 조립 + 참조무결성 검증(독립 1280 게임).
  const built = buildRecipe(mechanism, { ...input, docId });
  if (!built.ok || !built.node) return { ok: false, lane: 0, message: built.errors ?? '레시피 조립 실패' };

  // 2) 꼬리(그림·배치·배경) — 독립 게임에만. manualLayout 레시피는 autoLayout 생략.
  onBusy?.('✏️ 놀이 화면을 짜는 중…');
  const game = await runTail(built.node, !!getRecipe(mechanism)?.manualLayout, input.sceneDesc, onBusy);
  if (!game) return { ok: false, lane: 0, message: '게임 생성에 실패했어요(검증)' };

  // 3) 레인 배치.
  const isEmpty = base.elements.length === 0;
  onBusy?.('✨ 화면에 예쁘게 배치하는 중…');
  if (isEmpty) {
    // 레인 0 — 게임이 곧 노드(평행이동 없음). id 는 docId 로 맞춰져 있음.
    store.mutate(docId, () => game);
    return { ok: true, lane: 0, message: `'${game.title}' 게임을 만들었어요` };
  }
  // 기존 노드 → 다음 밴드로 평행이동 머지(id 전부 재매핑, story 생략).
  const laneIdx = Math.max(1, Math.round(base.canvas.size.w / LANE_W));
  const piece = offsetLane(game, laneIdx * LANE_W);
  store.mutate(docId, (d) => ({
    ...d,
    canvas: { ...d.canvas, size: { ...d.canvas.size, w: d.canvas.size.w + LANE_W } },
    elements: [...d.elements, ...piece.elements],
    behaviors: [...d.behaviors, ...piece.behaviors],
    connections: [...d.connections, ...piece.connections],
    counters: [...(d.counters ?? []), ...piece.counters],
    flags: [...(d.flags ?? []), ...piece.flags],
  }));
  return { ok: true, lane: laneIdx, message: '확장 레인을 추가했어요' };
}
