import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { generateIntoFrame, regenImageCard, genTextCard } from './workflow';
import { composeFromPrompt, decorateDocCard, redesignFrame, worksheetFromNode, planFromNode } from './composer';
import { usePromptChoiceStore, type ReqIntent, type SelKind } from '@/store/promptChoiceStore';

/** "make a worksheet from this activity" on a selected idea/mind-map branch. */
const WORKSHEET_RE = /활동지|워크시트|학습지/;

/** "make a plan from this activity" on a selected idea/mind-map branch. */
const PLAN_RE = /계획안?|주간\s*계획|주안|수업\s*계획/;

/** "make it pretty / share with parents / add images" intent on a selected doc. */
const DECORATE_RE = /꾸며|꾸미|예쁘게|예쁘|이쁘|소식지|부모|학부모|공유|장식|디자인|이미지\s*(넣|추가|삽입)/;

/** Design/layout command on a selected frame → re-arrange + re-decorate (not add a
    card). e.g. "사진 크게", "겨울 느낌으로", "2열로 정리", "스티커 더 붙여줘". */
const DESIGN_CMD_RE = /정리|정렬|배치|배열|레이아웃|꾸며|꾸미|예쁘게|이쁘게|스티커|장식|디자인|느낌|분위기|테마|크게|작게|강조|위주|중심|열로|컬럼|나란히/;

/** A request that names a media artifact (image/illustration/photo/video). */
const IMAGE_RE = /이미지|그림|그려|그리기|사진|도안|일러스트|캐릭터|배경|삽화|포스터|영상|동영상|비디오/;

/** A request for a parent letter / newsletter / notice. */
const LETTER_RE = /통신문|가정\s*통신|편지|소식지|안내문|공지/;

/** Classify what artifact TYPE the prompt is asking for. A generic edit/modifier
    (no artifact keyword, e.g. "겨울 느낌으로", "더 짧게") → 'text' (means "edit the
    selected thing as it is"). Order matters: doc types before the broad image RE. */
function detectIntent(text: string): ReqIntent {
  if (WORKSHEET_RE.test(text)) return 'worksheet';
  if (PLAN_RE.test(text)) return 'plan';
  if (LETTER_RE.test(text)) return 'letter';
  if (IMAGE_RE.test(text)) return 'image';
  return 'text';
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

  const intent = detectIntent(text);

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
