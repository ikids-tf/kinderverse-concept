/**
 * 배경 제거 공용 엔진 — 타입/계약. 보드·게임뷰어 등 모든 호출부가 공유한다.
 */

/** 소재 종류 — 안전 티어 분기의 기준(엔진 내부에서 강제). */
export type AssetKind = 'generated' | 'child-photo' | 'object' | 'unknown';

/** 입력 일반화 — 파일/블롭/이미지엘리먼트/URL·dataURL 모두 허용(업로드 불필요). */
export type RBInput = File | Blob | HTMLImageElement | string;

export interface RBProgress {
  stage: string;
  /** 0~1 (모델 다운로드 등). 없을 수 있음. */
  progress?: number;
}

export interface RemoveBgOptions {
  /** 🔴 호출부가 반드시 전달 — child-photo는 무조건 온디바이스. */
  assetKind: AssetKind;
  signal?: AbortSignal;
  onProgress?: (p: RBProgress) => void;
  /** 비민감 소재(generated/object)에 한해 서버 미세경계 티어 허용(기본 false). */
  allowServerTier?: boolean;
  /** true = 단일 피사체 누끼(최대 성분만 유지, 이미지 편집기 등). 기본 false = 다중 객체 보존. */
  mainOnly?: boolean;
}

export type Tier = 'on-device' | 'server';

export interface RemoveBgResult {
  /** 배경이 제거된 투명 PNG. */
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  /** 실제 처리된 티어(검증/로깅용). */
  tier: Tier;
}

/* ── Worker 프로토콜 ───────────────────────────────────────────── */
export type WorkerRequest =
  | { type: 'warmup' }
  | { type: 'run'; id: number; blob: Blob; mainOnly?: boolean };

export type WorkerResponse =
  | { type: 'ready'; device: string }
  | { type: 'progress'; id?: number; stage: string; progress?: number }
  | { type: 'result'; id: number; blob: Blob; width: number; height: number }
  | { type: 'error'; id?: number; message: string };
