import { useBoardStore } from '@/store/boardStore';
import { pickStickersForTopic } from '@/lib/stickers';

/* Design Director — decorate pillar (rule-based, P1).
   Reads a composed frame's documents and dresses each with theme-matched stickers
   (instant, zero-cost). Stickers are stored on the card as `data.decorations` and
   rendered by NodeView as small "stuck-on" badges at the card corners. The hybrid
   AI die-cut / cover-illustration path layers on top of this in P2–P3. */

export type DecoAnchor = 'tl' | 'tr' | 'bl' | 'br';

export interface StickerDeco {
  emoji: string;
  anchor: DecoAnchor;
  rot: number; // degrees
  size: number; // px (badge diameter)
}

const ANCHORS: DecoAnchor[] = ['tr', 'bl', 'tl', 'br'];
const ROTS = [-12, 11, -8, 14, -15, 9];

/** Document roles that read as "paper" and look good with corner stickers. */
const DOC_ROLES = new Set(['plan', 'letter', 'record', 'worksheet', 'newsletter']);

/** Dress a single card with up to `count` stickers at its corners. `emojis` (from
    the Design Director) wins; otherwise theme stickers are picked by keyword. */
export function decorateDocStickers(nodeId: string, topic: string, count = 4, emojis?: string[]): void {
  const b = useBoardStore.getState();
  const n = b.nodes[nodeId];
  if (!n) return;
  const palette = emojis && emojis.length ? emojis : pickStickersForTopic(topic, count);
  const decorations: StickerDeco[] = palette.slice(0, count).map((emoji, i) => ({
    emoji,
    anchor: ANCHORS[i % ANCHORS.length],
    rot: ROTS[i % ROTS.length],
    size: 36,
  }));
  b.updateNodeRaw(nodeId, { data: { ...(n.data ?? {}), decorations } });
}

/** Decorate every document card in a composed frame with stickers. Pass `emojis`
    (Design Director palette) to override the keyword-based theme pick. */
export function decorateComposedFrame(frameId: string, topic: string, emojis?: string[]): void {
  const b = useBoardStore.getState();
  const docs = Object.values(b.nodes).filter(
    (n) => n.data?.frameId === frameId && DOC_ROLES.has(n.data?.role as string),
  );
  // A newsletter already carries cover art — give it fewer, lighter accents.
  docs.forEach((d) => decorateDocStickers(d.id, topic, d.data?.role === 'newsletter' ? 3 : 4, emojis));
}
