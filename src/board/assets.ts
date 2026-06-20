import { idbGet, idbSet } from './idb';

/* 이미지 자산 보관함 — 단일 요소 그림(소방차·펭귄·튤립…)을 캡션 태그로 IndexedDB에
   자동 저장한다. 같은 이름의 요청이 다시 오면 생성하지 않고 즉시 가져다 쓰고,
   프레임에 "보관함 재사용 — 새로 생성" 안내를 띄운다(취소하면 새로 생성).
   스냅샷(보드 영속화)과 별개의 키라 보드를 지워도 보관함은 남는다. */

export interface ImageAsset {
  /** 원본 캡션(표시용). 키는 정규화된 태그. */
  tag: string;
  kind: 'image' | '도안' | 'video';
  /** data URI. video는 큰 mp4 대신 '포스터(첫 프레임) 썸네일'을 담아 표시용으로 쓰고,
      실제 영상은 videoAssets(IDB)에 videoAssetId로 따로 보관한다. */
  url: string;
  createdAt: number;
  /** 생성 당시 상위 주제(예: "여러 물고기") — '물고기'처럼 묶음 검색을 가능하게. */
  group?: string;
  /** kind==='video'일 때 — videoAssets 스토어의 영상 id(배치 시 이걸로 로드). */
  videoAssetId?: string;
}

export type AssetKind = ImageAsset['kind'];

const KEY = 'image-assets:v1';
const MAX_PER_TAG = 3; // 태그당 최근 3장만 보관(용량 관리)

let cache: Record<string, ImageAsset[]> | null = null;

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

async function load(): Promise<Record<string, ImageAsset[]>> {
  if (!cache) cache = (await idbGet<Record<string, ImageAsset[]>>(KEY)) ?? {};
  return cache;
}

/** 보관함의 모든 자산을 최신순으로(태그·종류 무관). 갤러리 자동 표시용. */
export async function listAssets(kinds?: ImageAsset['kind'][]): Promise<ImageAsset[]> {
  const lib = await load();
  const out: ImageAsset[] = [];
  for (const arr of Object.values(lib)) {
    for (const it of arr) {
      if (!it.url) continue;
      if (kinds && !kinds.includes(it.kind)) continue;
      out.push(it);
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt);
}

/** 캡션과 같은 태그의 최신 자산(종류 일치)을 찾는다 — 없으면 undefined. */
export async function findAsset(caption: string, kind: ImageAsset['kind']): Promise<ImageAsset | undefined> {
  const lib = await load();
  const arr = lib[norm(caption)];
  if (!arr) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].kind === kind && arr[i].url) return arr[i];
  return undefined;
}

/** 생성 성공한 자산을 태그로 저장(태그당 최근 N장 유지). mock/플레이스홀더는 저장하지 않는다.
    video는 url=포스터 썸네일 + videoAssetId(실제 영상은 videoAssets에 별도 보관). */
export async function saveAsset(
  caption: string,
  kind: ImageAsset['kind'],
  url: string,
  group?: string,
  videoAssetId?: string,
): Promise<void> {
  if (!url || !caption.trim()) return;
  // 플레이스홀더(생성 실패 '개념' SVG 자리표시)는 저장하지 않는다 — 깨진 그림이 보관함에 고착돼
  // 다음 로드마다 재사용되는 것을 막는다. 생성 이미지는 래스터(PNG)라 image의 SVG=플레이스홀더.
  if (kind === 'image' && url.startsWith('data:image/svg')) return;
  const lib = await load();
  const k = norm(caption);
  const arr = lib[k] ?? (lib[k] = []);
  arr.push({
    tag: caption.trim(),
    kind,
    url,
    createdAt: Date.now(),
    ...(group?.trim() ? { group: group.trim() } : {}),
    ...(videoAssetId ? { videoAssetId } : {}),
  });
  if (arr.length > MAX_PER_TAG) arr.splice(0, arr.length - MAX_PER_TAG);
  await idbSet(KEY, lib);
}

/** 질의 → 검색 토큰들. "브라키오와 문어, 사자랑 펭귄"처럼 복수 단어를 공백·구분자로
    나누고 끝의 연결 조사(와/과/랑/이랑/하고…)를 떼어 각 단어를 독립 토큰으로 만든다. */
function queryTokens(query: string): string[] {
  const raw = query
    .split(/[\s,+·/]+|그리고/)
    .map((w) => w.trim())
    .filter(Boolean);
  const tokens = new Set<string>();
  const q = norm(query);
  if (q.length >= 2) tokens.add(q); // 전체 질의(기존 동작)도 유지
  for (const w of raw) {
    const a = norm(w);
    if (a.length >= 2) tokens.add(a);
    const stripped = norm(w.replace(/(이랑|하고|와|과|랑|도|만|은|는|이|가|을|를)$/u, ''));
    if (stripped.length >= 2) tokens.add(stripped);
  }
  return [...tokens];
}

/** 입력 중 추천 검색 — 태그/주제(group)가 질의와 부분 일치하는 자산(태그당 최신 1장).
    "물고기"는 '여러 물고기'(주제)로, "브라키오와 문어"는 단어별로 각각 매칭된다. */
export async function searchAssets(
  query: string,
  kind: ImageAsset['kind'] | ImageAsset['kind'][] = 'image',
  limit = Infinity, // 개수 제한 없음 — 추천 스트립이 줄바꿈+스크롤로 모두 보여준다
): Promise<ImageAsset[]> {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const lib = await load();
  const out: ImageAsset[] = [];
  for (const arr of Object.values(lib)) {
    // 태그당 '종류별 최신 1장' — 같은 캡션에 이미지·영상이 함께 있어도 둘 다 노출되게
    // (한 종류만 보던 기존 동작이 영상을 가리지 않도록).
    const seenKinds = new Set<string>();
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (!kinds.includes(it.kind) || !it.url || seenKinds.has(it.kind)) continue;
      seenKinds.add(it.kind);
      const t = norm(it.tag);
      const g = norm(it.group ?? '');
      const matched = tokens.some(
        (tok) => t.includes(tok) || tok.includes(t) || (g.length > 0 && (g.includes(tok) || tok.includes(g))),
      );
      if (matched) out.push(it);
      if (seenKinds.size >= kinds.length) break; // 요청한 종류를 모두 1장씩 봤으면 종료
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt).slice(0, limit);
}
