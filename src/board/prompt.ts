import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { generateIntoFrame, regenImageCard, genTextCard } from './workflow';
import { composeFromPrompt, decorateDocCard, redesignFrame, worksheetFromNode, planFromNode } from './composer';
import { usePromptChoiceStore, type ReqIntent, type SelKind } from '@/store/promptChoiceStore';
import {
  contentIntentFast,
  WORKSHEET_RE,
  PLAN_RE,
  DESIGN_CMD_RE,
  DECORATE_RE,
  type ContentIntent,
} from '@/ai/intent-lexicon';

/** Map the lexicon's rich intent onto the popup's ReqIntent vocabulary.
    coloring is generated through the image path (도안 스타일은 프롬프트에 실림);
    mindmap/record don't apply "onto a selection" — treated as text until the
    router fallback (P1-4) refines them. */
function toReqIntent(ci: ContentIntent | null): ReqIntent {
  switch (ci) {
    case 'worksheet': return 'worksheet';
    case 'plan': return 'plan';
    case 'letter': return 'letter';
    case 'image':
    case 'coloring': return 'image';
    default: return 'text';
  }
}

function openMismatch(sel: BoardNode[], text: string, intent: ReqIntent, selKind: SelKind): void {
  usePromptChoiceStore.getState().open({ ids: sel.map((n) => n.id), text, intent, selKind });
}

/* Prompt-in-place on My Board: a board prompt ALWAYS acts on the board (never
   navigates to chat).
   - nothing selected → Frame Composer: classify → seed a frame → fill it
   - selection matches the request → act on it in place:
       image card(s)  + image/style → regenerate each
       memo/text(s)   + text        → (re)write each
       doc + 꾸미기      → parent newsletter
       idea/branch + 활동지/계획안   → connected doc
       frame          → generate into it / redesign
   - selection does NOT match the request (e.g. images + "활동지", a shape, or a
     mixed selection) → raise the disambiguation popup (promptChoiceStore) so the
     teacher chooses: 그 자리에 생성 / 성격 바꿔 생성 / 새 프레임.
   Returns true (handled on the board). */
export function handleBoardPrompt(text: string): boolean {
  const b = useBoardStore.getState();
  const sel = b.selection.map((id) => b.nodes[id]).filter(Boolean);

  // Nothing selected → Frame Composer (a new frame is the right behavior here).
  if (sel.length === 0) {
    void composeFromPrompt(text);
    return true;
  }

  const intent = toReqIntent(contentIntentFast(text));

  // ── specialized single-target cases (unchanged) ──
  // Single document card + a "decorate / share with parents" prompt → newsletter.
  if (sel.length === 1 && sel[0].type === 'sticky' && sel[0].data?.doc && DECORATE_RE.test(text)) {
    void decorateDocCard(sel[0].id, text);
    return true;
  }
  // Idea / mind-map branch (primary selection) + "활동지/계획안 만들기" → connected doc.
  const primary = sel[0];
  const isActivityCard =
    primary && primary.type === 'sticky' && (primary.data?.role === 'mm-branch' || primary.data?.role === 'idea');
  if (isActivityCard && WORKSHEET_RE.test(text)) {
    void worksheetFromNode(primary.id);
    return true;
  }
  if (isActivityCard && PLAN_RE.test(text)) {
    void planFromNode(primary.id);
    return true;
  }

  // A frame is selected → generate into it (or redesign on a design command).
  const frame = sel.find((n) => n.type === 'frame');
  if (frame) {
    if (frame.data?.composer && DESIGN_CMD_RE.test(text)) void redesignFrame(frame.id, text);
    else void generateIntoFrame(frame.id, text);
    return true;
  }

  // ── homogeneous content selection: match → act in place; mismatch → popup ──
  const allImages = sel.every((n) => n.type === 'image');
  const allTextLike = sel.every((n) => n.type === 'sticky' || n.type === 'text');

  if (allImages) {
    // image card(s) + an image or generic-style request → regenerate EACH in place.
    if (intent === 'image' || intent === 'text') {
      sel.forEach((n) => void regenImageCard(n.id, text));
      return true;
    }
    openMismatch(sel, text, intent, 'image'); // images + a doc request → ask
    return true;
  }
  if (allTextLike) {
    // memo/text card(s) + a text request → (re)write EACH in place.
    if (intent === 'text') {
      sel.forEach((n) => void genTextCard(n.id, text));
      return true;
    }
    openMismatch(sel, text, intent, 'text'); // memos + an image/doc request → ask
    return true;
  }

  // Mixed types / shapes / anything else with a selection → popup.
  openMismatch(sel, text, intent, 'mixed');
  return true;
}
