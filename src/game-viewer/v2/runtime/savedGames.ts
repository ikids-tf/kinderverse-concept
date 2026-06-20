/**
 * savedGames.ts — 만든 게임 라이브러리(자동 저장 + 카테고리별 보관). localStorage 영속.
 * ------------------------------------------------------------------
 * 프롬프트/이미지로 게임을 만들면 자동 저장된다. 상단 '놀이' 탭에서 카테고리를 고르면 첫 화면에
 * '기본 게임 + 이전에 만든 게임'이 카드로 떠 골라 플레이한다(GamePicker).
 * - 카테고리 키 = 기본 게임(FIXTURES) 키. 만든 게임은 내용/부품으로 그 키에 매핑(categoryForDoc).
 * - 참조 asset(생성·시드 이미지) URL을 함께 스냅샷 → 다시 열 때 그 그림 그대로 등장.
 * - 용량 초과 시 오래된 것부터 버리며 재시도(실패해도 인메모리 유지 — 플레이 방해 0).
 */
import { create } from "zustand";
import type { InteractiveDocInput } from "../schema/interactiveDoc";
import { FIXTURES } from "./fixtures";
import { useAssetStore } from "./assetStore";
import { isPlaceholderImage } from "../generate/gallery";

const LS_KEY = "kv:games:v1";
const CAP = 24; // 최근 N개만 보관

export interface SavedGame {
  id: string;
  title: string;
  category: string;
  doc: InteractiveDocInput;
  assets: Record<string, string>; // assetId → 이미지 URL(다시 열 때 프라임)
  ts: number;
}

/** 부품(archetype) → 기본 게임 카테고리 키(내용 키를 못 찾을 때 폴백). */
const ARCH_TO_CAT: Record<string, string> = {
  "tap-the-right-one": "animal",
  "match-pair": "match",
  "flip-memory": "flip",
  "binary-choice": "ox",
  "connect": "connect",
  "categorize": "categorize",
  "pattern-next": "pattern",
  "order-sequence": "order",
  "combine": "combine",
};

/** 만든 게임을 어느 놀이 카테고리(기본 게임 키)에 넣을지 — 감정 우선, ID의 내용 키, 그다음 부품. */
export function categoryForDoc(input: InteractiveDocInput): string {
  const id = input.meta?.id ?? "";
  const title = input.meta?.title ?? "";
  if (/emotion|감정|마음|표정|기분|정서/.test(`${id} ${title}`)) return "emotion";
  const m = /^gen_[a-z]+_([a-z]+)/.exec(id); // 예: gen_tap_animal → animal
  if (m && FIXTURES[m[1]]) return m[1];
  const kind = (input.interaction as { kind?: string } | undefined)?.kind ?? "";
  return ARCH_TO_CAT[kind] ?? "animal";
}

/** doc 안 모든 asset 콘텐츠의 assetId 수집(부품 무관, 재귀). 스냅샷할 그림 목록. */
function collectAssetIds(input: InteractiveDocInput): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const o = v as Record<string, unknown>;
    if (o.type === "asset") {
      const a = o.asset as { assetId?: string } | undefined;
      if (a?.assetId) ids.add(a.assetId);
    }
    Object.values(o).forEach(walk);
  };
  walk(input.interaction);
  return [...ids];
}

function load(): SavedGame[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as SavedGame[]) : [];
  } catch {
    return [];
  }
}

function persist(games: SavedGame[]): void {
  let list = games.slice(0, CAP);
  for (let i = 0; i < 6; i++) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
      return;
    } catch {
      if (list.length <= 1) return; // 더 줄일 수 없으면 인메모리만
      list = list.slice(0, Math.max(1, list.length - 4)); // 용량 초과 → 오래된 것부터 버림
    }
  }
}

interface SavedGamesState {
  games: SavedGame[];
  save: (g: SavedGame) => void;
  remove: (id: string) => void;
}

export const useSavedGames = create<SavedGamesState>((set) => ({
  games: load(),
  save: (g) =>
    set((s) => {
      const games = [g, ...s.games.filter((x) => x.id !== g.id)].slice(0, CAP);
      persist(games);
      return { games };
    }),
  remove: (id) =>
    set((s) => {
      const games = s.games.filter((x) => x.id !== id);
      persist(games);
      return { games };
    }),
}));

/** doc 참조 asset(생성/시드 이미지)의 현재 URL을 스냅샷 — 다시 열 때 그 그림 그대로 등장. */
function snapshotAssets(input: InteractiveDocInput): Record<string, string> {
  const map = useAssetStore.getState().map;
  const assets: Record<string, string> = {};
  for (const id of collectAssetIds(input)) {
    const e = map[id];
    // 플레이스홀더(생성 실패 자리표시)는 스냅샷하지 않는다 → 다시 열 때 보관함/생성으로 새로 채운다.
    if (e && e.status === "ready" && e.url && !isPlaceholderImage(e.url)) assets[id] = e.url;
  }
  return assets;
}

/** 방금 만든 게임을 라이브러리에 자동 저장 — 참조 asset URL을 함께 스냅샷. */
export function saveCreatedGame(input: InteractiveDocInput): void {
  try {
    useSavedGames.getState().save({
      id: `${input.meta?.id ?? "game"}_${Date.now()}`,
      title: input.meta?.title ?? "내 게임",
      category: categoryForDoc(input),
      doc: input,
      assets: snapshotAssets(input),
      ts: Date.now(),
    });
  } catch {
    /* 저장 실패는 무시(플레이 방해 금지) */
  }
}

/** 기존 '내 놀이'를 같은 id로 덮어써 갱신(없으면 추가). 편집 중인 내 놀이를 저장할 때 새 항목을 만들지 않는다. */
export function updateSavedGame(id: string, input: InteractiveDocInput): void {
  try {
    useSavedGames.getState().save({
      id,
      title: input.meta?.title ?? "내 게임",
      category: categoryForDoc(input),
      doc: input,
      assets: snapshotAssets(input),
      ts: Date.now(),
    });
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** asset URL 맵을 assetStore에 프라임(ready) — 저장본을 다시 열 때 그 그림 그대로. */
export function primeAssets(assets?: Record<string, string>): void {
  if (!assets || !Object.keys(assets).length) return;
  useAssetStore.setState((s) => {
    const map = { ...s.map };
    // 플레이스홀더는 프라임하지 않는다 → assetStore가 보관함/생성으로 실제 이미지를 채우게 둔다.
    for (const [k, url] of Object.entries(assets)) if (!isPlaceholderImage(url)) map[k] = { status: "ready", url };
    return { map };
  });
}

/** 저장된 게임을 다시 열기 전 — 스냅샷한 asset URL을 assetStore에 프라임. */
export function primeSavedAssets(game: SavedGame): void {
  primeAssets(game.assets);
}

/* ───────────────── 작업 중 게임(워킹 슬롯) — 저장 버튼이 쓰고, 새로고침 시 자동 복원 ──────────────── */
const WORKING_KEY = "kv:working:v1";

export interface WorkingGame {
  doc: InteractiveDocInput;
  assets: Record<string, string>;
}

/** 현재 게임(편집 포함)을 로컬에 저장 — 새로고침해도 남아 계속 테스트 가능. 실패 시 false. */
export function saveWorkingGame(input: InteractiveDocInput): boolean {
  try {
    localStorage.setItem(WORKING_KEY, JSON.stringify({ doc: input, assets: snapshotAssets(input), ts: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** 저장해 둔 작업 중 게임(있으면) — 단독 탭 로드 시 자동 복원용. */
export function getWorkingGame(): WorkingGame | null {
  try {
    const raw = localStorage.getItem(WORKING_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<WorkingGame>;
    return o && o.doc ? { doc: o.doc, assets: o.assets ?? {} } : null;
  } catch {
    return null;
  }
}

/* ───────────────── 기본 게임 편집본(오버라이드) — 기본 게임을 고쳐 저장하면 '기본도 바뀐다' ──────────────── */
// 기본 게임(FIXTURES)은 코드 상수라 그 자체를 바꿀 수 없다. 대신 키별 편집본을 로컬에 두고,
// loadExample이 기본값 대신 이 편집본을 연다. 새 '내 놀이'를 만들지 않고 그 기본 게임이 바뀐다.
const BASE_KEY = "kv:base:v1";

export interface BaseOverride {
  doc: InteractiveDocInput;
  assets: Record<string, string>;
}
type BaseMap = Record<string, BaseOverride>;

function loadBaseMap(): BaseMap {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? (o as BaseMap) : {};
  } catch {
    return {};
  }
}
function persistBaseMap(map: BaseMap): void {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(map));
  } catch {
    /* 용량 초과 등 — 인메모리 유지(플레이 방해 0) */
  }
}

interface BaseOverridesState {
  map: BaseMap;
  /** 기본 게임(FIXTURES 키)의 편집본을 저장 — 다음에 그 기본 게임을 열면 이게 뜬다. */
  saveOverride: (key: string, input: InteractiveDocInput) => void;
  /** 기본 게임을 원래(코드 기본값)대로 되돌린다. */
  clearOverride: (key: string) => void;
}

export const useBaseOverrides = create<BaseOverridesState>((set) => ({
  map: loadBaseMap(),
  saveOverride: (key, input) =>
    set((s) => {
      const map = { ...s.map, [key]: { doc: input, assets: snapshotAssets(input) } };
      persistBaseMap(map);
      return { map };
    }),
  clearOverride: (key) =>
    set((s) => {
      if (!(key in s.map)) return s;
      const map = { ...s.map };
      delete map[key];
      persistBaseMap(map);
      return { map };
    }),
}));

/** 기본 게임 편집본(있으면) — loadExample이 코드 기본값 대신 이걸 연다. */
export function getBaseOverride(key: string): BaseOverride | null {
  return useBaseOverrides.getState().map[key] ?? null;
}
