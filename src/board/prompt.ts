import { useBoardStore } from '@/store/boardStore';
import { generateIntoFrame, regenImageCard, genTextCard } from './workflow';

/* Prompt-in-place on My Board: when the teacher selects a board target and types
   in the prompt bar, generate ONTO that target (no chat navigation).
   - image card  → regenerate the image from the prompt
   - memo / text → (re)write its text from the prompt
   - frame       → spawn cards into the frame (auto-expands)
   Returns true if handled on the board; false to fall back to the router/chat. */
export function runBoardPrompt(text: string): boolean {
  const b = useBoardStore.getState();
  const sel = b.selection.map((id) => b.nodes[id]).filter(Boolean);
  if (sel.length === 0) return false;

  // Single image selected → regenerate into it.
  if (sel.length === 1 && sel[0].type === 'image') {
    void regenImageCard(sel[0].id, text);
    return true;
  }
  // Single memo/text selected → write into it.
  if (sel.length === 1 && (sel[0].type === 'sticky' || sel[0].type === 'text')) {
    void genTextCard(sel[0].id, text);
    return true;
  }
  // A frame is selected → generate cards into it.
  const frame = sel.find((n) => n.type === 'frame');
  if (frame) {
    void generateIntoFrame(frame.id, text);
    return true;
  }
  return false;
}
