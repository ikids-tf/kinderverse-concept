/**
 * 프롬프트 → 인터랙티브 노드 편집(AI). 풀스크린 프롬프트바 입력을 받아 노드를 고친다.
 *
 * 흐름: 노드 요약+선택 컨텍스트로 게이트웨이(task 'interactive-edit')에 JSON '작업 목록'을
 *   요청 → 화이트리스트 op만 검증해 한 번의 mutate로 적용. 선택 요소가 있으면 그 요소에,
 *   없으면 노드 전체 맥락으로 적용한다. (LangChain 등 프레임워크 없이 직접 게이트웨이 호출.)
 *
 * 규칙(CLAUDE §2): 새 요소·동작은 스키마 그대로(Behavior.parse 검증). 그림 생성은 task 'image'
 *   (assetKind 'generated' — 외부 전송 허용). 교사 입력만 모델로 보낸다(아동 매체 미전송).
 */
import { callGateway } from '@/ai/client';
import { extractJson } from '@/ai/json';
import { newId } from '@/store/boardStore';
import { useInteractiveStore } from '../store/interactiveStore';
import {
  makeImageElement,
  makeShapeElement,
  makeTextElement,
  urlToAssetRef,
  withElementAdded,
} from '../runtime/assetIngest';
import { ANIMATE_PRESETS } from '../runtime/behaviors';
import { Behavior, type ElementNode, type InteractiveNode } from '../schema/interactiveNode';

export interface ApplyResult {
  ok: boolean;
  addedIds: string[];
  /** 사용자에게 보여줄 짧은 결과 메시지(토스트). */
  message: string;
}

type RawOp = Record<string, unknown>;

const ANIM = new Set<string>(ANIMATE_PRESETS as readonly string[]);

const SYSTEM = `너는 유아용 '인터랙티브 노드'를 편집하는 도우미다.
교사의 한국어 명령을 받아, 아래 작업(op) 목록 형식의 JSON만 출력한다. 설명·마크다운 금지.

쓸 수 있는 작업:
- {"op":"addText","text":"글자"}                       새 글자 추가
- {"op":"addShape"}                                     새 도형(네모) 추가
- {"op":"addImage","prompt":"강아지"}                   그림을 AI로 만들어 추가(아이 친화 일러스트)
- {"op":"setText","id":"<요소id>","text":"새 글자"}      글자 요소 내용 바꾸기
- {"op":"setBackground","color":"pastel.sky"}           배경색(pastel.cream/peach/mint/sky 또는 #rrggbb)
- {"op":"behavior","target":"<요소id>","action":"animate","preset":"bounce"}   탭하면 반응
       preset: bounce|jump|wiggle|grow|spin|shake|float|fadeIn|fadeOut
- {"op":"behavior","target":"<요소id>","action":"speak","text":"안녕!"}         탭하면 말하기(말풍선)
- {"op":"behavior","target":"<요소id>","action":"reveal"|"hide"|"highlight","targets":["<요소id>"]}
- {"op":"addStoryStep","text":"옛날 옛적에…"}            이야기(나레이션) 한 단계 추가
- {"op":"remove","id":"<요소id>"}                        요소 삭제

규칙:
- 선택된 요소가 있으면 그 요소(id)에 setText/behavior/remove를 우선 적용한다.
- 선택이 없으면 새 요소 추가·배경·이야기 등 노드 전체 작업을 한다.
- 반드시 '현재 요소'에 있는 id만 참조한다. 없으면 새로 추가한다.
- 한 번에 너무 많이 만들지 말고 명령에 필요한 만큼만.
- 출력은 {"ops":[ ... ]} 형식의 JSON 하나.`;

function nodeSummary(doc: InteractiveNode): string {
  const els = doc.elements.map((e) => ({
    id: e.id,
    kind: e.kind,
    text: e.kind === 'text' ? (e.text ?? '') : undefined,
  }));
  const bg = typeof doc.canvas.background === 'string' ? doc.canvas.background : '이미지';
  return `현재 요소(id·종류·글자):\n${JSON.stringify(els)}\n배경: ${bg}`;
}

/** AI에게 작업 목록을 받아 검증된 op 배열로(실패 시 빈 배열). */
async function planOps(doc: InteractiveNode, prompt: string, selectedElIds: string[]): Promise<RawOp[] | null> {
  const sel =
    selectedElIds.length > 0 ? `선택된 요소 id: ${selectedElIds.join(', ')}` : '선택된 요소 없음(노드 전체 맥락)';
  const res = await callGateway({
    task: 'interactive-edit',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${nodeSummary(doc)}\n${sel}\n\n교사 명령: "${prompt}"`,
      },
    ],
    meta: { kind: 'interactive_edit' },
    maxTokens: 1200,
  });
  if (!res.ok || res.mocked || !res.text) return null;
  try {
    const obj = extractJson(res.text) as { ops?: unknown };
    return Array.isArray(obj.ops) ? (obj.ops as RawOp[]) : [];
  } catch {
    return [];
  }
}

/** 한 그림 생성(task 'image') → AssetRef(generated). 실패 시 null. */
async function genImageRef(prompt: string) {
  const res = await callGateway({
    task: 'image',
    provider: 'gemini',
    messages: [{ role: 'user', content: prompt }],
    meta: { prompt: `${prompt}, 유아 친화 일러스트, 밝고 단순, 흰 배경`, caption: prompt },
  });
  if (!res.ok || res.mocked || !res.image) return null;
  try {
    return await urlToAssetRef(res.image, 'generated');
  } catch {
    return null;
  }
}

export async function applyInteractivePrompt(
  docId: string,
  prompt: string,
  selectedElIds: string[],
  onBusy?: (msg: string | null) => void,
): Promise<ApplyResult> {
  const store = useInteractiveStore.getState();
  const doc = store.peek(docId) ?? store.ensure(docId);
  onBusy?.('AI가 노드를 고치는 중…');
  try {
    const ops = await planOps(doc, prompt, selectedElIds);
    if (ops === null) {
      return { ok: false, addedIds: [], message: 'AI를 사용할 수 없어요 (키 설정 필요)' };
    }
    if (ops.length === 0) {
      return { ok: false, addedIds: [], message: '무엇을 할지 알아듣지 못했어요 — 더 구체적으로 적어 보세요' };
    }

    // ── 비동기 선해결: 그림 생성(op 순서대로) ──
    const center = { x: doc.canvas.size.w / 2, y: doc.canvas.size.h / 2 };
    const addEls: ElementNode[] = [];
    const setTextMap = new Map<string, string>();
    const behaviorDrafts: Array<{ target: string; build: (validIds: Set<string>) => Behavior | null }> = [];
    const removeIds = new Set<string>();
    const storyTexts: string[] = [];
    let background: string | null = null;
    let offset = 0;
    const nextAt = () => {
      const at = { x: center.x + offset, y: center.y + offset };
      offset += 28;
      return at;
    };

    let imageBusy = false;
    for (const raw of ops) {
      const op = String(raw.op ?? '');
      if (op === 'addText' && typeof raw.text === 'string' && raw.text.trim()) {
        addEls.push(makeTextElement(raw.text.trim().slice(0, 120), nextAt()));
      } else if (op === 'addShape') {
        addEls.push(makeShapeElement(nextAt()));
      } else if (op === 'addImage' && typeof raw.prompt === 'string' && raw.prompt.trim()) {
        if (!imageBusy) {
          onBusy?.('그림을 만드는 중…');
          imageBusy = true;
        }
        const ref = await genImageRef(raw.prompt.trim());
        if (ref) addEls.push(makeImageElement(ref, 'upload', nextAt(), doc.canvas.size));
      } else if (op === 'setText' && typeof raw.id === 'string' && typeof raw.text === 'string') {
        setTextMap.set(raw.id, raw.text.slice(0, 200));
      } else if (op === 'setBackground' && typeof raw.color === 'string') {
        background = raw.color;
      } else if (op === 'addStoryStep' && typeof raw.text === 'string' && raw.text.trim()) {
        storyTexts.push(raw.text.trim().slice(0, 200));
      } else if (op === 'remove' && typeof raw.id === 'string') {
        removeIds.add(raw.id);
      } else if (op === 'behavior' && typeof raw.target === 'string') {
        const target = raw.target;
        const action = String(raw.action ?? '');
        behaviorDrafts.push({
          target,
          build: (validIds) => {
            if (!validIds.has(target)) return null;
            const base = { id: newId('beh'), target, trigger: 'tap' as const };
            let candidate: unknown = null;
            if (action === 'animate') {
              const preset = ANIM.has(String(raw.preset)) ? String(raw.preset) : 'bounce';
              candidate = { ...base, action: 'animate', params: { preset } };
            } else if (action === 'speak' && typeof raw.text === 'string' && raw.text.trim()) {
              candidate = { ...base, action: 'speak', params: { text: raw.text.trim().slice(0, 120), mode: 'bubble' } };
            } else if ((action === 'reveal' || action === 'hide' || action === 'highlight') && Array.isArray(raw.targets)) {
              const targets = (raw.targets as unknown[]).map(String).filter((id) => validIds.has(id));
              if (targets.length === 0) return null;
              candidate = { ...base, action, params: { targets } };
            }
            if (!candidate) return null;
            const parsed = Behavior.safeParse(candidate);
            return parsed.success ? parsed.data : null;
          },
        });
      }
    }

    if (!addEls.length && !setTextMap.size && !behaviorDrafts.length && !removeIds.size && !storyTexts.length && !background) {
      return { ok: false, addedIds: [], message: '적용할 변경이 없었어요' };
    }

    onBusy?.('적용하는 중…');
    store.mutate(docId, (d) => {
      // 1) 삭제
      let elements = d.elements.filter((e) => !removeIds.has(e.id));
      let behaviors = d.behaviors.filter((b) => !removeIds.has(b.target));
      let connections = d.connections.filter((c) => !removeIds.has(c.from) && !removeIds.has(c.to));
      // 2) 글자 교체
      if (setTextMap.size) {
        elements = elements.map((e) => (setTextMap.has(e.id) ? { ...e, text: setTextMap.get(e.id)! } : e));
      }
      // 3) 새 요소 추가(z 위로)
      let next: InteractiveNode = { ...d, elements, behaviors, connections };
      for (const el of addEls) next = withElementAdded(next, el);
      // 4) 동작(대상별 1개로 교체) — 추가/삭제 반영된 id 집합으로 검증
      const validIds = new Set(next.elements.map((e) => e.id));
      let behs = next.behaviors;
      for (const draft of behaviorDrafts) {
        const beh = draft.build(validIds);
        if (!beh) continue;
        behs = [...behs.filter((b) => b.target !== draft.target), beh];
      }
      next = { ...next, behaviors: behs };
      // 5) 배경
      if (background) next = { ...next, canvas: { ...next.canvas, background } };
      // 6) 이야기 단계
      if (storyTexts.length) {
        const steps = [
          ...(next.story?.steps ?? []),
          ...storyTexts.map((t) => ({ id: newId('step'), speak: { text: t, mode: 'narration' as const } })),
        ];
        next = { ...next, story: { ...(next.story ?? { steps: [] }), steps } };
      }
      return next;
    });

    const parts: string[] = [];
    if (addEls.length) parts.push(`${addEls.length}개 추가`);
    if (setTextMap.size) parts.push('글자 수정');
    if (behaviorDrafts.length) parts.push('동작 적용');
    if (background) parts.push('배경 변경');
    if (storyTexts.length) parts.push(`이야기 ${storyTexts.length}단계`);
    if (removeIds.size) parts.push(`${removeIds.size}개 삭제`);
    return { ok: true, addedIds: addEls.map((e) => e.id), message: parts.join(' · ') || '적용 완료' };
  } finally {
    onBusy?.(null);
  }
}
