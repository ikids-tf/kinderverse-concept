/**
 * 문서 꾸밈 이미지 파이프라인 — withImages 스킨 변형이 적용될 때 주제 스티커 이미지를 준비한다.
 *
 * 흐름: (1)보관함 exact 캡션 히트 재사용 → (2)없으면 KV_CUTOUT_STYLE 생성(단색 순백 배경 —
 * 누끼가 깨끗이 떨어지는 조건) + 온디바이스 누끼 → 보관함 저장 → (3)node.data.docDecoImages 에
 * dataURL 기록(coverImage/docImages 선례 — 스냅샷은 IDB 라 용량 무관, 3장 이하 유지).
 *
 * L1 자동(되돌리기 무관한 꾸밈) — 어떤 단계가 실패해도 문서 흐름을 깨지 않는다.
 * 오프라인(mock — 키 없음)에서는 이미지 없이 조용히 끝난다(스킨 색만 적용).
 * ⚠ 기존 data.decorations(이모지 배지)는 계획 문서에서 렌더가 정책 차단돼 있어 쓰지 않고,
 *   전용 키 docDecoImages 를 쓴다(사용자가 '이미지 꾸밈' 변형을 명시적으로 고른 옵트인).
 */
import { useBoardStore } from '@/store/boardStore';
import { findAsset, saveAsset } from '@/board/assets';
import { planStudioImages, renderStudioImage, KV_CUTOUT_STYLE } from '@/ai/agents/studio';
import { buildAgentContext } from '@/ai/context';
import { coreTopic } from '@/ai/intent-lexicon';
import { removeBackground, cleanupBackground, warmupBackgroundRemoval } from '@/shared/background-removal';
import { runImageJobs } from '@/features/interactive-viewer/authoring/artDirect';

/** 이미 투명 PNG인지 — 모서리 4점 알파 검사. 누끼된 이미지에 모델 재실행은 품질 저하라 금지. */
async function isTransparent(dataUri: string): Promise<boolean> {
  if (!dataUri.startsWith('data:image/png')) return false;
  const bmp = await createImageBitmap(await (await fetch(dataUri)).blob());
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d');
  if (!ctx) {
    bmp.close?.();
    return false;
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const a = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3];
  return a(0, 0) === 0 || a(cv.width - 1, 0) === 0 || a(0, cv.height - 1) === 0 || a(cv.width - 1, cv.height - 1) === 0;
}

/** 생성 이미지 → 투명 컷아웃. 단계별 실패는 직전 결과 유지(artDirect cutout 관례). */
async function toCutout(url: string): Promise<string> {
  let out = url;
  try {
    out = (await removeBackground(url, { assetKind: 'generated', mainOnly: true })).dataUrl;
  } catch {
    return url; // 누끼 자체 실패 → 원본(흰 배경) 유지
  }
  try {
    out = (await cleanupBackground(out, { keepMainOnly: true })).dataUrl;
  } catch {
    /* 1차 누끼 결과 유지 */
  }
  return out;
}

/** 진행 중 중복 실행 방지(같은 노드) — 수십 초 걸리는 파이프라인이라 재클릭 이중 생성 차단. */
const inFlight = new Set<string>();

/**
 * 문서 카드(nodeId)에 주제(topic) 스티커 이미지 count장을 보장한다.
 * 반환: 확보된 dataURL 배열(이미 충분하면 그대로 — 멱등).
 */
export async function ensureDocDecoImages(nodeId: string, topic: string, count = 3): Promise<string[]> {
  const node = useBoardStore.getState().nodes[nodeId];
  if (!node || inFlight.has(nodeId)) return [];
  const existing = Array.isArray(node.data?.docDecoImages) ? (node.data.docDecoImages as string[]) : [];
  if (existing.length >= count) return existing;
  inFlight.add(nodeId);
  try {
    // 주제 정리 — 명령 어미 제거 + 문서형 접미(주간 놀이계획안 등) 제거.
    const subject =
      coreTopic(topic).replace(/주간\s*(놀이)?\s*계획안?|프로젝트|\(.*?\)/g, '').trim() || coreTopic(topic) || topic;

    // 1) 주제 → 서로 다른 대상 캡션 N개(예: '바다' → 물고기/불가사리/조개). 오프라인 mock 폴백 내장.
    const plan = await planStudioImages(subject, [], buildAgentContext('studio'), 'image', { count }).catch(
      () => ({ specs: [] as Array<{ caption: string; prompt: string }>, style: '', title: subject }),
    );
    const specs = plan.specs.slice(0, count);
    if (!specs.length) specs.push({ caption: subject, prompt: subject });

    warmupBackgroundRemoval(); // 누끼 모델 선로드(첫 장 대기 단축)
    const urls: (string | null)[] = new Array(specs.length).fill(null);

    const jobs = specs.map((spec, i) => async () => {
      // 2) 보관함 exact 캡션 히트 → 재사용(갤러리 우선 — 생성 비용 0).
      const hit = await findAsset(spec.caption, 'image').catch(() => undefined);
      if (hit?.url && !hit.url.startsWith('data:image/svg')) {
        urls[i] =
          hit.source === 'game' || (await isTransparent(hit.url).catch(() => false))
            ? hit.url // 이미 누끼된 자산 — 재누끼 금지
            : await toCutout(hit.url);
        return;
      }
      // 3) 생성 — mock(키 없음)은 표시·저장 모두 금지(라벨 SVG 가 문서에 박히면 안 됨).
      const img = await renderStudioImage(spec, KV_CUTOUT_STYLE).catch(() => ({ url: undefined, mocked: false }));
      if (!img.url || img.mocked) return;
      const cut = await toCutout(img.url);
      urls[i] = cut;
      void saveAsset(spec.caption, 'image', cut, subject); // 보관함 등록(다음 문서 재사용) — 실패 무시
    });
    await runImageJobs(jobs, 2); // 생성 병렬 2(누끼 워커는 직렬이라 그 이상은 무의미)

    const docDecoImages = [...existing, ...urls.filter((u): u is string => !!u)].slice(0, count);
    // 4) 최신 노드를 '다시' 읽어 병합 — 수십 초 사이의 다른 갱신(coverImage 등)을 덮지 않게.
    const cur = useBoardStore.getState().nodes[nodeId];
    if (cur && docDecoImages.length) {
      useBoardStore.getState().updateNodeRaw(nodeId, {
        data: { ...(cur.data ?? {}), docDecoImages, docDecoTopic: subject },
      });
    }
    return docDecoImages;
  } finally {
    inFlight.delete(nodeId);
  }
}
