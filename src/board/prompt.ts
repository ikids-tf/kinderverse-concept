import { useBoardStore } from '@/store/boardStore';
import { generateIntoFrame, regenImageCard, genTextCard } from './workflow';
import { composeFromPrompt, decorateDocCard, redesignFrame, worksheetFromNode } from './composer';

/** "make a worksheet from this activity" on a selected idea/mind-map branch. */
const WORKSHEET_RE = /활동지|워크시트|학습지/;

/** "make it pretty / share with parents / add images" intent on a selected doc. */
const DECORATE_RE = /꾸며|꾸미|예쁘게|예쁘|이쁘|소식지|부모|학부모|공유|장식|디자인|이미지\s*(넣|추가|삽입)/;

/** Design/layout command on a selected frame → re-arrange + re-decorate (not add a
    card). e.g. "사진 크게", "겨울 느낌으로", "2열로 정리", "스티커 더 붙여줘". */
const DESIGN_CMD_RE = /정리|정렬|배치|배열|레이아웃|꾸며|꾸미|예쁘게|이쁘게|스티커|장식|디자인|느낌|분위기|테마|크게|작게|강조|위주|중심|열로|컬럼|나란히/;

/* Prompt-in-place on My Board: a board prompt ALWAYS acts on the board (never
   navigates to chat).
   - a card/frame is selected → generate/modify ONTO that target
   - image card  → regenerate the image from the prompt
   - memo / text → (re)write its text from the prompt
   - frame       → spawn cards into the frame (auto-expands)
   - nothing selected → Frame Composer: classify → seed an appropriate frame →
     fill with the right mix of cards → attach next-step chips
   Returns true (handled on the board). */
export function handleBoardPrompt(text: string): boolean {
  const b = useBoardStore.getState();
  const sel = b.selection.map((id) => b.nodes[id]).filter(Boolean);

  // Single image selected → regenerate into it.
  if (sel.length === 1 && sel[0].type === 'image') {
    void regenImageCard(sel[0].id, text);
    return true;
  }
  // Single document card + a "decorate / share with parents" prompt → build an
  // illustrated parent newsletter from it (instead of overwriting its text).
  if (sel.length === 1 && sel[0].type === 'sticky' && sel[0].data?.doc && DECORATE_RE.test(text)) {
    void decorateDocCard(sel[0].id, text);
    return true;
  }
  // Single idea / mind-map branch + "활동지 만들기" → a worksheet connected to it.
  if (
    sel.length === 1 &&
    sel[0].type === 'sticky' &&
    (sel[0].data?.role === 'mm-branch' || sel[0].data?.role === 'idea') &&
    WORKSHEET_RE.test(text)
  ) {
    void worksheetFromNode(sel[0].id);
    return true;
  }
  // Single memo/text selected → write into it.
  if (sel.length === 1 && (sel[0].type === 'sticky' || sel[0].type === 'text')) {
    void genTextCard(sel[0].id, text);
    return true;
  }
  // A frame is selected.
  const frame = sel.find((n) => n.type === 'frame');
  if (frame) {
    // A design/layout command → re-arrange + re-decorate the frame (Design Director).
    if (frame.data?.composer && DESIGN_CMD_RE.test(text)) {
      void redesignFrame(frame.id, text);
    } else {
      // otherwise generate a new card into it (auto-expands).
      void generateIntoFrame(frame.id, text);
    }
    return true;
  }
  // Nothing usable selected → Frame Composer builds an appropriate frame.
  void composeFromPrompt(text);
  return true;
}
