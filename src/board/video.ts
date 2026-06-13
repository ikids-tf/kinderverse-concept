import { useBoardStore, newId } from '@/store/boardStore';
import { buildVeoPrompt, KV_VIDEO_NEGATIVE } from '@/ai/agents/studio';
import { genSignal } from './workflow';
import { saveVideoAsset } from './videoAssets';
import { showToast } from '@/lib/toast';

/* 텍스트→비디오 · 이미지→비디오 (Gemini Veo) — 보드의 동영상 뷰어에서 바로 재생.
   PRD §7.1·§9.5(전용 영상 생성, 게이팅). 게이트웨이의 image 플로우를 미러링하되
   Veo는 장시간 비동기라 start→poll 2단계로 처리한다(server/gateway/video.ts).
   결과 영상은 IDB(videoAssets)에 보관하고 node.data.videoAssetId로 새로고침 복원.
   진행은 공유 정지 시그널(genSignal)을 본다 — 프롬프트바 ■로 폴링을 끊을 수 있다
   (단, 서버 생성은 계속될 수 있어 과금될 수 있다 — 확인 게이트로 오발 방지). */

const POLL_INTERVAL = 4000; // 4초 간격 폴링
const MAX_POLLS = 90; // 최대 ~6분(Veo 지연 11초~6분)

/** abort 가능한 sleep — 정지 버튼이 폴링 대기 중에도 즉시 끊기게 한다. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

interface StartResp {
  ok: boolean;
  op?: string;
  mocked?: boolean;
  error?: string;
}
interface PollResp {
  ok: boolean;
  done: boolean;
  video?: string;
  mocked?: boolean;
  error?: string;
}

const MOCK_MSG = '동영상 생성은 GEMINI_API_KEY가 설정되면 켜집니다(데모).';

/* 같은 뷰어에 대한 '동시' 생성 방지 — 영상 생성은 고비용(과금)이라 중복 트리거(빠른
   재클릭·이벤트 중복 등)가 두 번째 Veo 작업을 시작해 이중 과금되는 것을 막는다.
   진행 중인 viewerId를 담아두고, 이미 진행 중이면 새 요청을 무시한다. */
const inFlight = new Set<string>();

/** 뷰어 하나에 영상을 생성해 로드한다.
    - request: 교사 프롬프트 또는 계획/텍스트 카드에서 추출한 활동 내용.
    - imageSrc: 있으면 이미지→비디오(그 이미지가 첫 프레임), 없으면 텍스트→비디오. */
export async function generateVideoForViewer(
  viewerId: string,
  request: string,
  imageSrc?: string,
): Promise<void> {
  const b = useBoardStore.getState();
  if (!b.nodes[viewerId]) return;
  // 같은 뷰어에서 이미 생성 중이면 무시(이중 과금 방지).
  if (inFlight.has(viewerId)) {
    showToast('이미 이 뷰어에서 영상을 만들고 있어요…', 'progress');
    return;
  }
  inFlight.add(viewerId);
  const signal = genSignal();
  b.beginGen();
  b.setGenerating('🎬 영상을 만들고 있어요 (수십 초~수 분)…');

  try {
    const prompt = await buildVeoPrompt(request);
    if (signal.aborted) return;

    const startRes = (await fetch('/api/ai/video/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        imageDataUri: imageSrc,
        aspectRatio: '16:9',
        negativePrompt: KV_VIDEO_NEGATIVE,
      }),
      signal,
    }).then((r) => r.json())) as StartResp;

    if (startRes.mocked) {
      showToast(MOCK_MSG, 'error', 3600);
      return;
    }
    if (!startRes.ok || !startRes.op) {
      throw new Error(startRes.error || '영상 생성을 시작하지 못했어요');
    }
    const op = startRes.op;

    let video: string | null = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL, signal); // aborted면 throw → 조용히 종료
      const pr = (await fetch(`/api/ai/video/poll?op=${encodeURIComponent(op)}`, { signal }).then((r) =>
        r.json(),
      )) as PollResp;
      if (pr.done) {
        if (pr.mocked) {
          showToast(MOCK_MSG, 'error', 3600);
          return;
        }
        if (pr.error) throw new Error(pr.error);
        video = pr.video ?? null;
        break;
      }
      const sec = Math.round(((i + 1) * POLL_INTERVAL) / 1000);
      b.setGenerating(`🎬 영상을 만들고 있어요… ${sec}초 경과`);
    }
    if (!video) throw new Error('영상 생성이 시간 내에 끝나지 않았어요');
    if (signal.aborted) return;

    // 영속화(IDB) + 뷰어에 로드. data URI는 viewerSrc가 아니라 videoAssetId로 복원.
    const assetId = newId('vid');
    await saveVideoAsset(assetId, video);
    const cur = useBoardStore.getState().nodes[viewerId];
    if (cur) {
      useBoardStore.getState().updateNodeRaw(viewerId, {
        data: { ...(cur.data ?? {}), videoAssetId: assetId },
      });
    }
    window.dispatchEvent(new CustomEvent('kv:video-load', { detail: { viewerId, src: video } }));
    showToast('🎬 영상을 만들었어요', 'success');
  } catch (e) {
    if (!signal.aborted) {
      showToast(`영상 생성에 실패했어요 — ${e instanceof Error ? e.message : String(e)}`, 'error', 4000);
    }
  } finally {
    inFlight.delete(viewerId);
    useBoardStore.getState().endGen();
  }
}
