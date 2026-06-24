import { idbGet, idbSet } from './idb';

/* 웹 링크 보관함 — 유튜브 뷰어/컴포저의 '웹 검색'으로 찾은 자료 링크(제목·URL·도메인)를
   키워드 태그로 IndexedDB에 저장한다. 이미지 보관함(assets.ts)과 같은 방식이라,
   프롬프트바에서 키워드를 입력하면 저장된 이미지처럼 링크들이 추천 스트립에 뜬다.
   보드 스냅샷과 별개 키라 보드를 지워도 보관함은 남는다. */

export interface WebLink {
  /** 원본 키워드(표시용). 키는 정규화된 태그. */
  tag: string;
  title: string;
  url: string;
  domain: string;
  /** 대표 이미지 썸네일(검색 시 받은 주제 이미지). 없으면 UI가 파비콘으로 폴백. */
  thumb?: string;
  /** iframe 임베드 가능(서버 unfurl 확인)? true일 때만 보드에서 웹뷰어로 연다. */
  embeddable?: boolean;
  createdAt: number;
}

const KEY = 'web-links:v1';
const MAX_PER_TAG = 12; // 태그당 최근 N개만 보관(용량 관리)

let cache: Record<string, WebLink[]> | null = null;

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

async function load(): Promise<Record<string, WebLink[]>> {
  if (!cache) cache = (await idbGet<Record<string, WebLink[]>>(KEY)) ?? {};
  return cache;
}

/** 웹 검색으로 찾은 링크들을 키워드 태그로 저장(URL 중복 제거, 태그당 최근 N개 유지). */
export async function saveWebLinks(
  keyword: string,
  links: Array<{ title: string; url: string; domain: string; thumb?: string; embeddable?: boolean }>,
): Promise<void> {
  const kw = keyword.trim();
  if (!kw || links.length === 0) return;
  const lib = await load();
  const k = norm(kw);
  const arr = lib[k] ?? (lib[k] = []);
  const seen = new Set(arr.map((l) => l.url));
  for (const l of links) {
    if (!l.url || seen.has(l.url)) continue;
    seen.add(l.url);
    arr.push({
      tag: kw,
      title: l.title || l.domain || l.url,
      url: l.url,
      domain: l.domain || '',
      ...(l.thumb ? { thumb: l.thumb } : {}),
      ...(l.embeddable ? { embeddable: true } : {}),
      createdAt: Date.now(),
    });
  }
  if (arr.length > MAX_PER_TAG) arr.splice(0, arr.length - MAX_PER_TAG);
  await idbSet(KEY, lib);
}

/** 웹 링크 한 개 삭제(갤러리 호버 삭제) — url 로 식별(모든 태그에서 제거). */
export async function removeWebLink(url: string): Promise<void> {
  const lib = await load();
  let changed = false;
  for (const k of Object.keys(lib)) {
    const next = lib[k].filter((l) => l.url !== url);
    if (next.length !== lib[k].length) {
      changed = true;
      if (next.length) lib[k] = next;
      else delete lib[k];
    }
  }
  if (changed) await idbSet(KEY, lib);
}

/** 저장된 모든 웹 링크를 최신순으로(URL 중복 제거). 갤러리 자동 표시용. */
export async function listWebLinks(): Promise<WebLink[]> {
  const lib = await load();
  const out: WebLink[] = [];
  const seen = new Set<string>();
  for (const arr of Object.values(lib)) {
    for (const it of arr) {
      if (!it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      out.push(it);
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt);
}

/** 질의 → 검색 토큰들. assets.ts와 동일 규칙(공백·구분자 분해 + 끝 조사 제거). */
function queryTokens(query: string): string[] {
  const raw = query
    .split(/[\s,+·/]+|그리고/)
    .map((w) => w.trim())
    .filter(Boolean);
  const tokens = new Set<string>();
  const q = norm(query);
  if (q.length >= 2) tokens.add(q);
  for (const w of raw) {
    const a = norm(w);
    if (a.length >= 2) tokens.add(a);
    const stripped = norm(w.replace(/(이랑|하고|와|과|랑|도|만|은|는|이|가|을|를)$/u, ''));
    if (stripped.length >= 2) tokens.add(stripped);
  }
  return [...tokens];
}

/** 입력 중 추천 검색 — 태그 또는 링크 제목이 질의와 부분 일치하는 저장 링크(URL 중복 제거). */
export async function searchWebLinks(query: string, limit = Infinity): Promise<WebLink[]> {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const lib = await load();
  const out: WebLink[] = [];
  const seenUrl = new Set<string>();
  for (const [k, arr] of Object.entries(lib)) {
    const tagMatch = tokens.some((tok) => k.includes(tok) || tok.includes(k));
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (!it.url || seenUrl.has(it.url)) continue;
      const t = norm(it.title);
      const matched = tagMatch || tokens.some((tok) => t.includes(tok) || tok.includes(t));
      if (matched) {
        seenUrl.add(it.url);
        out.push(it);
      }
    }
  }
  return out.sort((a, z) => z.createdAt - a.createdAt).slice(0, limit);
}
