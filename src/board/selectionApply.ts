import { useBoardStore, newId, type BoardNode } from '@/store/boardStore';
import { callGateway } from '@/ai/client';
import { buildAgentContext } from '@/ai/context';
import { runStudioWorksheet } from '@/ai/agents/studio';
import { runPlan } from '@/ai/agents/plan';
import { runWriting } from '@/ai/agents/writing';
import { worksheetText, planDocMarkdown, DOC_WIDTH, PLAN_DOC_W } from './workflow';
import { recordSpawnedNodes, captureNodes, pushRedesign } from './commands';
import { relatedWorksheetTheme } from './links';
import type { ReqIntent } from '@/store/promptChoiceStore';

/* Apply a mismatched prompt to the current selection, the way the teacher chose in
   the disambiguation popup (promptChoiceStore). Per selected card we generate the
   REQUESTED artifact (image/활동지/계획안/통신문/메모) from that card's own content +
   the prompt, then either:
     - 'beside'  → add it as a NEW card next to the source (original kept), or
     - 'replace' → transform the source card in place (original's nature changes).
   Reuses the existing Tier-1 agents / gateway — no new model contract. */

/** Fields that define a generated card of the requested type (sans id/x/y). */
type NodeFields = Pick<BoardNode, 'type'> &
  Partial<Pick<BoardNode, 'text' | 'src' | 'color' | 'autoH' | 'w' | 'h' | 'loading' | 'data'>>;

/** The subject for one source card = its own text/caption + the request. */
function topicOf(node: BoardNode, text: string): string {
  const own = (node.text ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
  return [own, text].filter(Boolean).join(' · ').slice(0, 200) || text;
}

async function genMemoText(topic: string, ctx: string): Promise<string> {
  const res = await callGateway({
    task: 'lane_step',
    tier: 'mid',
    provider: 'auto',
    system: `유치원 교사의 보드 메모를 작성한다. 요청에 맞춰 2~5줄의 간결한 한국어 메모만(머리말·인사·마크다운 없이).\n${ctx}`,
    messages: [{ role: 'user', content: topic }],
    meta: { kind: 'memo', title: topic, selected: [] },
    maxTokens: 500,
  });
  return res.ok && res.text ? res.text.trim() : topic;
}

/** Generate the requested-type card fields from one source card's topic.
    worksheet 는 관련 놀이 주제(theme)를 시드로 받아 헤더 '주제'를 그 흐름에 맞춘다. */
async function genFields(intent: ReqIntent, topic: string, theme?: string): Promise<NodeFields> {
  switch (intent) {
    case 'image': {
      const r = await callGateway({ task: 'image', provider: 'auto', messages: [], meta: { prompt: topic, caption: topic } });
      return { type: 'image', src: r.image, text: topic, w: 220, h: 200, loading: false, data: { role: 'image' } };
    }
    case 'worksheet': {
      const r = await runStudioWorksheet(topic, buildAgentContext('studio'), undefined, theme ? { theme } : undefined);
      return { type: 'sticky', text: worksheetText(r.payload), color: 'paper', autoH: true, w: DOC_WIDTH, h: 240, src: undefined, data: { doc: true, role: 'worksheet', payload: r.payload } };
    }
    case 'plan': {
      const r = await runPlan(topic, [], buildAgentContext('plan'));
      return { type: 'sticky', text: planDocMarkdown(r.payload), color: 'paper', autoH: true, w: PLAN_DOC_W, h: 260, src: undefined, data: { doc: true, role: 'plan', payload: r.payload } };
    }
    case 'letter': {
      const r = await runWriting(topic, buildAgentContext('writing'));
      const p = r.payload;
      const body = p.type === 'LetterPreview' ? `✉️ ${p.props.title}\n${p.props.body}` : topic;
      return { type: 'sticky', text: body, color: 'paper', autoH: true, w: DOC_WIDTH, h: 240, src: undefined, data: { doc: true, role: 'letter', payload: p } };
    }
    default: {
      const t = await genMemoText(topic, buildAgentContext('writing'));
      return { type: 'sticky', text: t, color: 'surface-2', autoH: true, w: 280, h: 120, src: undefined, data: {} };
    }
  }
}

const LABEL: Record<'beside' | 'replace', string> = { beside: '그 자리에 생성', replace: '성격 바꿔 생성' };

/** Run the chosen action over the selection. */
export async function applyToSelection(
  ids: string[],
  text: string,
  intent: ReqIntent,
  mode: 'beside' | 'replace',
): Promise<void> {
  const b = useBoardStore.getState();
  const sources = ids.map((id) => b.nodes[id]).filter((n): n is BoardNode => !!n);
  if (sources.length === 0) return;

  // For 'replace' we record a before-snapshot (mutation); for 'beside' we collect new ids.
  const before = mode === 'replace' ? captureNodes(ids) : null;
  const newIds: string[] = [];

  useBoardStore.getState().setGenerating(`✨ 선택한 ${sources.length}개에 ${INTENTING(intent)} 적용 중…`);
  try {
    for (const src of sources) {
      const frameId = src.data?.frameId as string | undefined;
      // 활동지는 이 카드가 잇는 놀이 주제(자기 payload 주제·연결된 이미지 카드 캡션)를 헤더 '주제'로.
      const theme = intent === 'worksheet' ? relatedWorksheetTheme(b.nodes, b.links, src.id) : undefined;
      let fields: NodeFields;
      try {
        fields = await genFields(intent, topicOf(src, text), theme);
      } catch {
        continue; // skip this card on failure, keep going
      }
      const data = { ...(fields.data ?? {}), ...(frameId ? { frameId } : {}) };
      if (mode === 'replace') {
        // Transform the source card in place — keep id + position, swap its nature.
        useBoardStore.getState().updateNodeRaw(src.id, { ...fields, data });
      } else {
        // Add a new card beside the source; original stays.
        const id = newId(fields.type);
        useBoardStore.getState().addNodeRaw({
          id,
          x: Math.round(src.x + src.w + 24),
          y: Math.round(src.y),
          w: fields.w ?? src.w,
          h: fields.h ?? src.h,
          ...fields,
          data,
        } as BoardNode);
        newIds.push(id);
      }
    }
  } finally {
    useBoardStore.getState().setGenerating(null);
  }

  if (mode === 'replace' && before) pushRedesign(ids, before, `${LABEL.replace}`);
  else if (newIds.length) recordSpawnedNodes(newIds, `${LABEL.beside}`);
}

function INTENTING(intent: ReqIntent): string {
  return intent === 'image' ? '이미지' : intent === 'worksheet' ? '활동지' : intent === 'plan' ? '계획안' : intent === 'letter' ? '통신문' : '메모';
}
