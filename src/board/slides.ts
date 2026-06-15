import { useBoardStore } from '@/store/boardStore';
import { generateDeck, fillDeckImages } from '@/features/slides/agent/generate';
import { showToast } from '@/lib/toast';

/* 슬라이드 뷰어에 한 줄 요청 → 장표 에이전트로 DeckSpec 생성 → 뷰어(iframe)에 로드.
   동영상(generateVideoForViewer)과 같은 패턴: 보드 생성 상태(beginGen/endGen)를 켜고,
   결과는 kv:slides-load 이벤트로 해당 뷰어에 전달한다(NodeView가 iframe.loadDeck 호출).
   덱은 뷰어가 ?id= 키로 localStorage에 영속화하므로 새로고침에도 복원된다. */

/** 같은 뷰어에 대한 동시 생성 방지(중복 클릭·이벤트 중복). */
const inFlight = new Set<string>();

export async function generateSlidesForViewer(viewerId: string, request: string): Promise<void> {
  const b = useBoardStore.getState();
  if (!b.nodes[viewerId]) return;
  if (inFlight.has(viewerId)) {
    showToast('이미 이 뷰어에서 슬라이드를 만들고 있어요…', 'progress');
    return;
  }
  inFlight.add(viewerId);
  b.beginGen();
  b.setGenerating('🖼️ 슬라이드를 구성하고 있어요…');
  try {
    const deck = await generateDeck(request);
    const load = () => window.dispatchEvent(new CustomEvent('kv:slides-load', { detail: { viewerId, deck } }));
    // 1차 — 글(레이아웃)부터 바로 보여 준다(이미지는 자리표시). 체감 속도 ↑.
    load();
    // 카드 헤더 제목 = 덱 제목(새로고침·갤러리 표시와 일관).
    const cur = useBoardStore.getState().nodes[viewerId];
    if (cur) {
      useBoardStore.getState().updateNodeRaw(viewerId, { data: { ...(cur.data ?? {}), title: deck.title } });
    }
    showToast(`🖼️ 슬라이드 ${deck.slides.length}장 — 페이지 이미지를 그리는 중…`, 'progress');
    // 2차 — 페이지 내용에 맞는 삽화를 생성해 채운 뒤 같은 뷰어에 다시 로드(그림이 보임).
    await fillDeckImages(deck, (d, t) =>
      useBoardStore.getState().setGenerating(`🎨 슬라이드 이미지 ${d}/${t} 그리는 중…`),
    );
    load();
    showToast(`🖼️ 슬라이드 ${deck.slides.length}장을 완성했어요`, 'success');
  } catch (e) {
    showToast(`슬라이드 생성에 실패했어요 — ${e instanceof Error ? e.message : String(e)}`, 'error', 4000);
  } finally {
    inFlight.delete(viewerId);
    useBoardStore.getState().endGen();
  }
}
