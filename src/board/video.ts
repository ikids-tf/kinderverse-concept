import { useBoardStore, newId } from '@/store/boardStore';
import { buildVeoPrompt, buildVeoImagePrompt, KV_VIDEO_NEGATIVE } from '@/ai/agents/studio';
import { coreTopic } from '@/ai/intent-lexicon';
import { genSignal } from './workflow';
import { saveVideoAsset } from './videoAssets';
import { saveAsset } from './assets';
import { showToast } from '@/lib/toast';

/* 텍스트→비디오 · 이미지→비디오 (Gemini Veo) — 보드의 동영상 뷰어에서 바로 재생.
   PRD §7.1·§9.5(전용 영상 생성, 게이팅). 게이트웨이의 image 플로우를 미러링하되
   Veo는 장시간 비동기라 start→poll 2단계로 처리한다(server/gateway/video.ts).
   결과 영상은 IDB(videoAssets)에 보관하고 node.data.videoAssetId로 새로고침 복원.
   진행은 공유 정지 시그널(genSignal)을 본다 — 프롬프트바 ■로 폴링을 끊을 수 있다
   (단, 서버 생성은 계속될 수 있어 과금될 수 있다 — 확인 게이트로 오발 방지). */

const POLL_INTERVAL = 4000; // 4초 간격 폴링
const MAX_POLLS = 90; // 최대 ~6분(Veo 지연 11초~6분)

/** 생성 영상의 검색 태그 — 교사가 입력한 프롬프트(있으면) 또는 추출 활동 내용에서
    핵심 주제만 남긴다("사자가 걷는 영상" → "사자"). 보관함 키워드 검색에 쓰인다. */
function videoTag(userPrompt: string | undefined, request: string): string {
  const base = (userPrompt && userPrompt.trim()) || request.trim();
  return (coreTopic(base) || base).trim().slice(0, 40);
}

/** 생성 영상의 첫 프레임을 작은 JPEG 썸네일(포스터)로 캡처 — 보관함 추천 스트립 표시용.
    오프스크린 <video>+canvas. 실패하면(디코드 불가 등) undefined. */
function captureVideoPoster(dataUri: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      let settled = false;
      const done = (out?: string) => {
        if (settled) return;
        settled = true;
        v.removeAttribute('src');
        try { v.load(); } catch { /* noop */ }
        resolve(out);
      };
      v.addEventListener('error', () => done(undefined), { once: true });
      v.addEventListener(
        'loadeddata',
        () => {
          try {
            const vw = v.videoWidth;
            const vh = v.videoHeight;
            if (!vw || !vh) return done(undefined);
            const W = 160;
            const H = Math.max(1, Math.round((W * vh) / vw));
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const ctx = cv.getContext('2d');
            if (!ctx) return done(undefined);
            ctx.drawImage(v, 0, 0, W, H);
            done(cv.toDataURL('image/jpeg', 0.7));
          } catch {
            done(undefined);
          }
        },
        { once: true },
      );
      setTimeout(() => done(undefined), 4000); // 안전 타임아웃
      v.src = dataUri;
    } catch {
      resolve(undefined);
    }
  });
}

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
  /** 완료됐지만 영상 샘플 없음(대개 안전 필터) — 재시도하면 성공할 수 있다. */
  filtered?: boolean;
}

const MOCK_MSG = '동영상 생성은 GEMINI_API_KEY가 설정되면 켜집니다(데모).';

/* 같은 뷰어에 대한 '동시' 생성 방지 — 영상 생성은 고비용(과금)이라 중복 트리거(빠른
   재클릭·이벤트 중복 등)가 두 번째 Veo 작업을 시작해 이중 과금되는 것을 막는다.
   진행 중인 viewerId를 담아두고, 이미 진행 중이면 새 요청을 무시한다. */
const inFlight = new Set<string>();

/** 뷰어 하나에 영상을 생성해 로드한다.
    - request: 계획/텍스트 카드에서 추출한 활동 내용 또는 이미지 제목(자동 추출 폴백).
    - imageSrc: 있으면 이미지→비디오(그 이미지가 첫 프레임), 없으면 텍스트→비디오.
    - opts.userPrompt: 교사가 '직접 입력한' 프롬프트(작성 모드). 이미지→비디오에서
      이 값이 비면 이미지를 그대로 두고 '움직임만' 넣고, 있으면 그 내용만 반영한다
      (자동 추출 제목 request는 이미지 모드의 장면 생성에 쓰지 않는다 — 배경 변형 방지). */
export async function generateVideoForViewer(
  viewerId: string,
  request: string,
  imageSrc?: string,
  opts?: { userPrompt?: string },
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
    // 이미지→비디오: 교사가 직접 입력한 프롬프트만 의미가 있다(없으면 이미지 그대로+움직임만).
    // 텍스트→비디오: 입력 프롬프트 또는 추출 활동 내용(request)으로 장면을 만든다.
    const typed = (opts?.userPrompt ?? '').trim();
    const basePrompt = imageSrc
      ? await buildVeoImagePrompt(typed)
      : await buildVeoPrompt(typed || request);
    if (signal.aborted) return;

    // Veo 안전 필터는 확률적 — 완료됐는데 샘플이 없으면(filtered) 사람 배제를 한 번 더
    // 강조해 1회 재시도한다(대개 두 번째에 성공). 그래도 안 되면 안내한다.
    const MAX_ATTEMPTS = 2;
    let video: string | null = null;
    let lastFilterMsg = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !video; attempt++) {
      if (signal.aborted) return;
      const prompt =
        attempt === 1
          ? basePrompt
          : `${basePrompt} Strictly no people, no children, no human figures or faces — only animals, objects, and nature.`;
      if (attempt > 1) b.setGenerating('🎬 안전 필터에 걸려 다시 시도하고 있어요…');

      const startRes = (await fetch('/api/ai/video/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, imageDataUri: imageSrc, aspectRatio: '16:9', negativePrompt: KV_VIDEO_NEGATIVE }),
        signal,
      }).then((r) => r.json())) as StartResp;

      if (startRes.mocked) {
        showToast(MOCK_MSG, 'error', 3600);
        return;
      }
      if (!startRes.ok || !startRes.op) throw new Error(startRes.error || '영상 생성을 시작하지 못했어요');
      const op = startRes.op;

      let filtered = false;
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
          if (pr.filtered) { filtered = true; lastFilterMsg = pr.error || ''; break; } // 다음 시도
          if (pr.error) throw new Error(pr.error);
          video = pr.video ?? null;
          break;
        }
        const sec = Math.round(((i + 1) * POLL_INTERVAL) / 1000);
        b.setGenerating(`🎬 영상을 만들고 있어요… ${sec}초 경과`);
      }
      if (!filtered) break; // 성공했거나 시간 초과 — 재시도 안 함
    }
    if (!video) throw new Error(lastFilterMsg || '영상 생성이 시간 내에 끝나지 않았어요');
    if (signal.aborted) return;

    // 영속화(IDB) + 뷰어에 로드. data URI는 viewerSrc가 아니라 videoAssetId로 복원.
    const assetId = newId('vid');
    await saveVideoAsset(assetId, video);

    // 보관함 등록 — 이미지처럼 프롬프트 키워드 검색으로 다시 불러올 수 있게(태그 + 포스터
    // 썸네일 + videoAssetId 참조). 실패해도 생성 흐름엔 영향 없게 best-effort.
    const tag = videoTag(opts?.userPrompt, request);
    if (tag) {
      const poster = (await captureVideoPoster(video).catch(() => undefined)) || imageSrc;
      if (poster) void saveAsset(tag, 'video', poster, undefined, assetId);
    }

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
