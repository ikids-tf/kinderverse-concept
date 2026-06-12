import { idbGet, idbSet } from './idb';

/* 이미지 자산 보관함 — 단일 요소 그림(소방차·펭귄·튤립…)을 캡션 태그로 IndexedDB에
   자동 저장한다. 같은 이름의 요청이 다시 오면 생성하지 않고 즉시 가져다 쓰고,
   프레임에 "보관함 재사용 — 새로 생성" 안내를 띄운다(취소하면 새로 생성).
   스냅샷(보드 영속화)과 별개의 키라 보드를 지워도 보관함은 남는다. */

export interface ImageAsset {
  /** 원본 캡션(표시용). 키는 정규화된 태그. */
  tag: string;
  kind: 'image' | '도안';
  url: string; // data URI
  createdAt: number;
  /** 생성 당시 상위 주제(예: "여러 물고기") — '물고기'처럼 묶음 검색을 가능하게. */
  group?: string;
}

const KEY = 'image-assets:v1';
const MAX_PER_TAG = 3; // 태그당 최근 3장만 보관(용량 관리)

let cache: Record<string, ImageAsset[]> | null = null;

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

async function load(): Promise<Record<string, ImageAsset[]>> {
  if (!cache) cache = (await idbGet<Record<string, ImageAsset[]>>(KEY)) ?? {};
  return cache;
}

/** 캡션과 같은 태그의 최신 자산(종류 일치)을 찾는다 — 없으면 undefined. */
export async function findAsset(caption: string, kind: ImageAsset['kind']): Promise<ImageAsset | undefined> {
  const lib = await load();
  const arr = lib[norm(caption)];
  if (!arr) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].kind === kind && arr[i].url) return arr[i];
  return undefined;
}

/** 생성 성공한 이미지를 태그로 저장(태그당 최근 N장 유지). mock/플레이스홀더는 저장하지 않는다. */
export async function saveAsset(
  caption: string,
  kind: ImageAsset['kind'],
  url: string,
  group?: string,
): Promise<void> {
  if (!url || !caption.trim()) return;
  const lib = await load();
  const k = norm(caption);
  const arr = lib[k] ?? (lib[k] = []);
  arr.push({ tag: caption.trim(), kind, url, createdAt: Date.now(), ...(group?.trim() ? { group: group.trim() } : {}) });
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
  kind: ImageAsset['kind'] = 'image',
  limit = Infinity, // 개수 제한 없음 — 추천 스트립이 줄바꿈+스크롤로 모두 보여준다
): Promise<ImageAsset[]> {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const lib = await load();
  const out: ImageAsset[] = [];
  for (const arr of Object.values(lib)) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (it.kind !== kind || !it.url) continue;
      const t = norm(it.tag);
      const g = norm(it.group ?? '');
      const matched = tokens.some(
        (tok) => t.includes(tok) || tok.includes(t) || (g.length > 0 && (g.includes(tok) || tok.includes(g))),
      );
      if (matched) out.push(it);
      break; // 태그당 최신 1장만
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt).slice(0, limit);
}
