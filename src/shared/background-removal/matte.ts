/**
 * matte.ts — 배경 제거 매트(알파) 다듬기. 순수 함수(모델·DOM 없음) — 워커가 추론 직후 호출.
 *
 * 문제: RMBG-1.4는 사진처럼 배경이 뚜렷하면 배경≈0의 깨끗한 매트를 내지만, 파스텔·일러스트
 * 배경(연한 하늘색·구름·비네트)은 '중간 회색'(알파 0.3~0.7 ≈ raw 77~179)으로 애매하게 남긴다.
 * 이 값을 그대로 알파에 쓰면 피사체 둘레에 뿌연 막(헤이즈)이 통째로 남고, 고정 임계 후처리로는
 * 피사체와 연결된 큰 헤이즈 필드를 못 끊는다(사용자 보고: 배경 제거가 깨끗하지 않음).
 *
 * 해법: 이미지마다 '배경 알파 수준'을 테두리 링에서 추정해(피사체는 보통 테두리 전체를
 * 덮지 않는다 — 하위 분위수 사용) 그 위로 lo/hi 레벨을 잡고 smoothstep으로 당긴다.
 *   · 모델이 확신한 매트(링 알파 ≈0) → lo가 낮아 보정 최소(부드러운 외곽 보존).
 *   · 헤이즈 매트(링 알파 높음) → lo가 그 위로 올라가 배경이 0으로 수렴, 피사체는 255로.
 */

/** refineMatte가 계산한 적응 레벨 — postProcessMatte가 같은 앵커를 공유한다. */
export interface MatteLevels {
  /** 테두리 링 raw 매트의 p25 = 이 이미지의 '배경 raw 수준'(0..255). */
  p25: number;
  lo: number;
  hi: number;
}

/** 매트(0..255, w×h)를 제자리에서 다듬는다(전역 헤이즈 보정 — smoothstep 레벨). */
export function refineMatte(md: Uint8Array, w: number, h: number): MatteLevels {
  const fallback: MatteLevels = { p25: 0, lo: 24, hi: 224 };
  const N = w * h;
  if (N === 0 || md.length < N) return fallback;

  // 1) 테두리 링(두께 = 긴 변의 2%, 최소 2px)의 알파 분포에서 배경 수준을 추정.
  //    p25(하위 사분위) — 피사체가 테두리 일부에 닿아도(상단 꽉 찬 커버 등) 배경 픽셀이
  //    링의 1/4만 되면 올바른 배경 수준을 잡는다. 헤이즈는 링 전체에 균일해 p25로도 충분.
  const ring = Math.max(2, Math.round(Math.max(w, h) * 0.02));
  const border: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < Math.min(ring, w); x++) {
      border.push(md[y * w + x], md[y * w + (w - 1 - x)]);
    }
  }
  for (let x = ring; x < w - ring; x++) {
    for (let y = 0; y < Math.min(ring, h); y++) {
      border.push(md[y * w + x], md[(h - 1 - y) * w + x]);
    }
  }
  if (border.length === 0) return fallback;
  border.sort((a, b) => a - b);
  const p25 = border[Math.min(border.length - 1, (border.length * 0.25) | 0)];

  // 2) 적응 레벨 — 배경 수준 + 여유. lo는 160에 캡(피사체가 테두리 대부분을 덮는 극단에서
  //    피사체 중간톤까지 지우지 않게), hi는 lo에서 충분히 띄워 경계는 부드럽게 남긴다.
  const lo = Math.min(160, p25 + 24);
  const hi = Math.max(lo + 64, 224);
  const span = hi - lo;

  // 3) lo..hi smoothstep — 배경(≤lo)은 0, 피사체(≥hi)는 255, 사이는 부드러운 경계 유지.
  for (let i = 0; i < N; i++) {
    const a = md[i];
    if (a <= lo) md[i] = 0;
    else if (a >= hi) md[i] = 255;
    else {
      const t = (a - lo) / span;
      md[i] = Math.round(t * t * (3 - 2 * t) * 255);
    }
  }
  return { p25, lo, hi };
}

/* ═══════════════════════════════════════════════════════════════════════════
   postProcessMatte — '맥락적' 매트 후처리(워커 전용). refineMatte(전역 레벨) 뒤에
   호출한다. 반드시 **워커 안**에서 실행해야 하는 이유: 여기서는 (a) refine 이전의
   raw 매트(모델 확신도)와 (b) 원본 RGB(프리멀티플라이로 소실되기 전)가 살아 있다.
   캔버스를 한 번이라도 거치면 알파=0 픽셀의 RGB가 검정(0,0,0)으로 소실돼(실측 확정:
   putImageData→PNG, drawImage→getImageData 두 지점 모두) '구멍을 메우면 검정 덩어리'가
   된다(사용자 보고 — 우체통 틈 검정 채움).

   ★ 임계는 전부 이미지 적응형이다. RMBG-1.4는 일러스트 배경을 raw 중간값(77~179)으로
   내므로 절대 임계(예: raw≤48=배경)는 이미지 클래스에 따라 체계적으로 빗나간다.
   대신 '바깥 배경의 실제 raw 수준'(outerRawMed)을 재서 그에 상대적으로 판정한다 —
   진짜 틈은 바깥 배경과 같은 raw 분포를 가진다는 상대 판정(적대 리뷰 반영).

   단계:
   1) (mainOnly 전용) 주 피사체 유지 — 견고 알파(≥128, 8연결) 최대 성분에서 md≥32
      경로로 측지 성장(붙어 있는 얇은 디테일·대각 획 보존) + 2px 팽창(AA 링 보존).
      mainOnly=false면 **아무것도 삭제하지 않는다**(아동 단체사진·수세기 게임 소재의
      무단 콘텐츠 삭제 금지 — 하드 룰). 지운 픽셀은 deleted 마스크에 기록해 3단계가
      절대 되살리지 못하게 한다(삭제→재복원 자기모순 차단).
   2) 바깥 배경 flood(4연결 — 전경 8연결과 위상 쌍대) → 배경 raw 수준(outerRawMed)과
      배경색 B(원본 RGB 채널별 히스토그램 중앙값) 추정. B 표본이 부족하면 완화 임계로
      재시도, 그래도 부족하면 B=신뢰불가(색 판정·디프린지 스킵).
   3) 에워싸인 구멍의 맥락 분류 — 각 구멍(내부 픽셀 통계 — 경계 보간 오염 방지):
        · rawMed ≤ outerRawMed+24 → 바깥 배경과 같은 확신도 = **진짜 뚫린 틈** → 투명.
        · rawMed ≥ max(outerRawMed+72, 110) → refine 부수피해 = 오류 구멍 → 원본 RGB로 복원.
        · 사이 → 색 맥락(구멍색 vs B 크로마): 배경 유사→틈. 무채색 대 무채색(판정불능)은
          raw 상대값 폴백. B 신뢰불가면 보수적으로 투명 유지(잘못 채우면 패치가 박혀
          복구 불가, 잘못 뚫으면 '정리' 에스컬레이션으로 구제 가능 — 비대칭 비용).
        · 아주 작은 스펙클(≤48px 절대 크기)은 raw가 배경 수준만 아니면 메움.
   3.5) 물린 자국(경계 노치) 복원 — 에워싸이지 않아도, 견고 이웃에 6면 이상 둘러싸인
        raw 높은 투명 픽셀은 refine 부수피해로 보고 복원(실루엣 가장자리 뚫림 완화).
   4) 디프린지 — 경계 픽셀에서 배경색 오염 제거 F=(C−(1−α)B)/α. α는 물리 혼합비에
      가까운 min(raw,md)를 쓰고(α<0.2 제외 — 저알파 증폭 방지), 배경이 균질할 때만.

   구현 계약: 재귀 금지(명시적 Int32Array 스택), 중앙값은 256빈 히스토그램 O(N),
   1024²에서 전체 <100ms(추론 9~13s 대비 무시 가능).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PostProcessOptions {
  /** true = 단일 피사체 누끼(최대 성분만 유지). false(기본) = **아무 성분도 삭제하지 않음**. */
  mainOnly?: boolean;
  /** refineMatte가 잰 테두리 링 배경 raw 수준(p25) — outer가 비는 극단에서 폴백 앵커. */
  bgLevel?: number;
  /** false = 입력에 이미 투명이 있어 원본 RGB 신뢰 불가(색 판정·디프린지 스킵). 기본 true. */
  colorTrusted?: boolean;
}

/** '지각 불가능한 스펙클' 절대 크기 상한(px) — 해상도 비례가 아니라 절대값(적대 리뷰 반영).
 *  cleanupBackground(폴백 경로)와 공유한다. */
export const SPECKLE_MAX_PX = 48;

/** 견고 전경 판정 임계(성분분석·구멍 정의 공용). */
const SOLID = 128;
/** 측지 성장 임계 — refine 후 md≥이 값으로 견고 성분에 '붙어 있는' 부위는 유지.
 *  (refine이 배경 헤이즈를 이미 0으로 눌렀으므로, 살아남은 중간알파는 전경 소프트부일 확률이 높다.) */
const RECON_T = 32;

export function postProcessMatte(
  md: Uint8Array,
  raw: Uint8Array,
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  opts: PostProcessOptions = {},
): void {
  const N = w * h;
  if (N === 0 || md.length < N || raw.length < N || rgba.length < N * 4) return;
  const colorTrusted = opts.colorTrusted !== false;

  const stack = new Int32Array(N);
  const deleted = new Uint8Array(N); // 1단계가 지운 픽셀 — 3단계 복원 절대 금지

  // ── 1. (mainOnly 전용) 주 피사체 유지 ──────────────────────────────────
  if (opts.mainOnly) {
    // 견고 성분분석(8연결 — 대각 1px 획이 끊기지 않게).
    const label = new Int32Array(N);
    const sizes: number[] = [0];
    let cur = 0;
    for (let s = 0; s < N; s++) {
      if (md[s] < SOLID || label[s] !== 0) continue;
      cur++;
      sizes[cur] = 0;
      let sp = 0;
      stack[sp++] = s;
      label[s] = cur;
      while (sp > 0) {
        const p = stack[--sp];
        sizes[cur]++;
        const x = p % w;
        const y = (p / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const q = ny * w + nx;
            if (md[q] >= SOLID && label[q] === 0) { label[q] = cur; stack[sp++] = q; }
          }
        }
      }
    }
    if (cur > 0) {
      let maxC = 0;
      let maxS = 0;
      for (let c = 1; c <= cur; c++) if (sizes[c] > maxS) { maxS = sizes[c]; maxC = c; }

      // 측지 성장 — 최대 성분에서 md≥RECON_T 픽셀로 flood(8연결). 견고 몸통에 중간알파로
      // 붙은 얇은 디테일(깃대·수염)은 살고, 떨어진 노이즈 섬·헤이즈 블롭은 못 들어온다.
      // 한계(의도적): 알파≥128짜리 견고한 '다리'로 붙은 노이즈는 여기서 못 끊는다 —
      // 재구성 오프닝도 마커에서 다리를 타고 되살아나므로 해결책이 아니며, 그런 케이스는
      // '정리' 버튼(cleanupBackground 오프닝 경로)이 담당한다.
      let zone = new Uint8Array(N);
      {
        let sp = 0;
        for (let p = 0; p < N; p++) if (label[p] === maxC) { zone[p] = 1; stack[sp++] = p; }
        while (sp > 0) {
          const p = stack[--sp];
          const x = p % w;
          const y = (p / w) | 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              const q = ny * w + nx;
              if (!zone[q] && md[q] >= RECON_T) { zone[q] = 1; stack[sp++] = q; }
            }
          }
        }
      }
      // 2px 팽창 — RECON_T 미만의 안티에일리어스 꼬리(외곽 링) 보존.
      for (let k = 0; k < 2; k++) {
        const o = new Uint8Array(N);
        for (let p = 0; p < N; p++) {
          if (zone[p]) { o[p] = 1; continue; }
          const x = p % w;
          const y = (p / w) | 0;
          if ((x > 0 && zone[p - 1]) || (x < w - 1 && zone[p + 1]) || (y > 0 && zone[p - w]) || (y < h - 1 && zone[p + w])) o[p] = 1;
        }
        zone = o;
      }
      for (let p = 0; p < N; p++) {
        if (!zone[p] && md[p] > 0) { deleted[p] = 1; md[p] = 0; }
      }
    }
  }

  // ── 2. 바깥 배경 flood(4연결) + 배경 raw 수준·배경색 추정 ──────────────
  const outer = new Uint8Array(N);
  {
    let sp = 0;
    const seed = (p: number) => {
      if (!outer[p] && md[p] < SOLID) { outer[p] = 1; stack[sp++] = p; }
    };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + (w - 1)); }
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (y > 0) seed(p - w);
      if (y < h - 1) seed(p + w);
    }
  }
  // 바깥 배경의 raw 수준 — 모든 상대 임계의 앵커. deleted(1단계가 지운 위성 = raw 높음)는
  // 통계를 오염시키므로 제외한다.
  const rawHist = new Uint32Array(256);
  let nOuter = 0;
  for (let p = 0; p < N; p++) {
    if (outer[p] && !deleted[p]) { rawHist[raw[p]]++; nOuter++; }
  }
  const histMedian = (hist: Uint32Array, n: number): number => {
    const target = n / 2;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  };
  const anchor = nOuter >= 64 ? histMedian(rawHist, nOuter) : (opts.bgLevel ?? 0);

  // 배경색 B — outer∧(raw≤anchor+8)의 원본 RGB 채널별 중앙값. 표본 부족 시 완화(+32)
  // 재시도, 그래도 부족하면 신뢰불가(null). 입력에 투명이 있던 경우(colorTrusted=false)는
  // outer의 RGB가 이미 검정으로 소실된 상태라 추정 자체를 포기한다.
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  let bg: [number, number, number] | null = null;
  let bgUniform = false;
  if (colorTrusted) {
    const minSamples = Math.max(256, Math.round(N * 0.002));
    let nBg = 0;
    const collect = (rawMax: number) => {
      histR.fill(0); histG.fill(0); histB.fill(0);
      nBg = 0;
      for (let p = 0; p < N; p++) {
        if (outer[p] && !deleted[p] && raw[p] <= rawMax) {
          histR[rgba[p * 4]]++;
          histG[rgba[p * 4 + 1]]++;
          histB[rgba[p * 4 + 2]]++;
          nBg++;
        }
      }
    };
    collect(Math.min(255, anchor + 8));
    if (nBg < minSamples) collect(Math.min(255, anchor + 32));
    if (nBg >= minSamples) {
      const pctl = (hist: Uint32Array, q: number): number => {
        const target = nBg * q;
        let acc = 0;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
        return 255;
      };
      bg = [pctl(histR, 0.5), pctl(histG, 0.5), pctl(histB, 0.5)];
      // 배경 균질성 — 채널별 IQR이 모두 좁아야 색 판정·디프린지에 안전
      // (그라데이션·다색 배경에서 전역 B는 어느 지점과도 다른 합성색이 된다).
      bgUniform =
        pctl(histR, 0.75) - pctl(histR, 0.25) <= 48 &&
        pctl(histG, 0.75) - pctl(histG, 0.25) <= 48 &&
        pctl(histB, 0.75) - pctl(histB, 0.25) <= 48;
    }
  }

  // ── 3. 에워싸인 구멍의 맥락 분류(구멍 flood 4연결 — 전경 8연결과 쌍대) ──
  const gapT = Math.min(255, anchor + 24); // rawMed ≤ 이 값 → 진짜 틈
  const fillT = Math.max(anchor + 72, 110); // rawMed ≥ 이 값 → 오류 구멍
  {
    const holeSeen = new Uint8Array(N);
    const holeRawHist = new Uint32Array(256);
    const compPixels: number[] = [];
    const inHole = (q: number): boolean => md[q] < SOLID && !outer[q];
    for (let s = 0; s < N; s++) {
      if (!inHole(s) || holeSeen[s]) continue;
      compPixels.length = 0;
      let sp = 0;
      stack[sp++] = s;
      holeSeen[s] = 1;
      while (sp > 0) {
        const p = stack[--sp];
        compPixels.push(p);
        const x = p % w;
        const y = (p / w) | 0;
        if (x > 0 && inHole(p - 1) && !holeSeen[p - 1]) { holeSeen[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && inHole(p + 1) && !holeSeen[p + 1]) { holeSeen[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && inHole(p - w) && !holeSeen[p - w]) { holeSeen[p - w] = 1; stack[sp++] = p - w; }
        if (y < h - 1 && inHole(p + w) && !holeSeen[p + w]) { holeSeen[p + w] = 1; stack[sp++] = p + w; }
      }
      const size = compPixels.length;

      // 통계는 '내부' 픽셀(4이웃이 전부 구멍) 우선 — mask 리사이즈 보간이 구멍 경계 raw를
      // 중간값으로 흐리는 오염을 피한다. 내부가 없으면(1~2px 폭) 전체로 폴백.
      // deleted 픽셀은 통계·복원 모두에서 제외(위성 잔해가 판정을 밀지 못하게).
      holeRawHist.fill(0);
      let nStat = 0;
      let sr = 0; let sg = 0; let sb = 0;
      const pass = (interiorOnly: boolean) => {
        holeRawHist.fill(0);
        nStat = 0; sr = 0; sg = 0; sb = 0;
        for (const p of compPixels) {
          if (deleted[p]) continue;
          if (interiorOnly) {
            const x = p % w;
            const y = (p / w) | 0;
            if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) continue;
            if (!inHole(p - 1) || !inHole(p + 1) || !inHole(p - w) || !inHole(p + w)) continue;
          }
          holeRawHist[raw[p]]++;
          nStat++;
          sr += rgba[p * 4];
          sg += rgba[p * 4 + 1];
          sb += rgba[p * 4 + 2];
        }
      };
      pass(true);
      if (nStat === 0) pass(false);
      if (nStat === 0) continue; // 전부 deleted — 위성 잔해 자리, 투명 유지
      const rawMed = histMedian(holeRawHist, nStat);

      let fill: boolean;
      if (size <= SPECKLE_MAX_PX) {
        // 스펙클 — 단, 모델이 배경 수준으로 확신한 미세 틈(울타리 살 사이)은 존중.
        fill = rawMed > Math.min(255, anchor + 16);
      } else if (rawMed <= gapT) {
        fill = false; // 바깥 배경과 같은 확신도 = 진짜 틈(그림자 색이어도 raw로 판정)
      } else if (rawMed >= fillT) {
        fill = true; // refine 부수피해 = 객체 내부(원본 RGB가 살아 있어 검정 없이 복원)
      } else if (bg && colorTrusted) {
        // 애매 구간 — 색 맥락. 무채색 대 무채색은 크로마 판별력이 0이므로 raw 폴백.
        const cr = sr / nStat;
        const cg = sg / nStat;
        const cb = sb / nStat;
        const holeChroma = Math.max(Math.abs(cr - cg), Math.abs(cg - cb), Math.abs(cr - cb));
        const bgChroma = Math.max(Math.abs(bg[0] - bg[1]), Math.abs(bg[1] - bg[2]), Math.abs(bg[0] - bg[2]));
        if (holeChroma < 20 && bgChroma < 20) fill = rawMed > Math.min(255, anchor + 48);
        else if (bgUniform && chromaMatch(cr, cg, cb, bg[0], bg[1], bg[2])) fill = false;
        else fill = true;
      } else {
        // B 신뢰불가 — 보수적으로 투명 유지: 잘못 채운 패치는 복구 불가, 잘못 남긴 구멍은
        // '정리' 에스컬레이션(fillHoles:'all')으로 구제 가능(비대칭 비용).
        fill = false;
      }
      if (fill) for (const p of compPixels) if (!deleted[p]) md[p] = 255;
    }
  }

  // ── 3.5 물린 자국(경계 노치) 복원 — 에워싸임과 무관 ─────────────────────
  // refine이 실루엣 가장자리 밝은 면을 0으로 문 자국은 outer와 연결돼 3단계 대상이
  // 아니다. 견고 이웃(≥SOLID)에 8방향 중 6면 이상 둘러싸인, raw가 배경 수준을 확실히
  // 웃도는 투명 픽셀만 raw 값으로 소프트 복원한다(2패스 = 2px 깊이 노치까지).
  {
    const notchT = Math.max(anchor + 72, 110);
    for (let pass = 0; pass < 2; pass++) {
      for (let p = 0; p < N; p++) {
        if (deleted[p] || md[p] >= 32 || raw[p] < notchT) continue;
        const x = p % w;
        const y = (p / w) | 0;
        if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) continue;
        let solid = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (md[(y + dy) * w + (x + dx)] >= SOLID) solid++;
          }
        }
        if (solid >= 6) md[p] = raw[p];
      }
    }
  }

  // ── 4. 디프린지(배경색 오염 제거) — 균질 배경 + 신뢰 가능한 원본색일 때만 ──
  if (bg && bgUniform && colorTrusted) {
    // 투명(md<26) 인접 3px 이내의 소프트 에지 밴드만 보정.
    let nearT = new Uint8Array(N);
    for (let p = 0; p < N; p++) if (md[p] < 26) nearT[p] = 1;
    for (let k = 0; k < 3; k++) {
      const o = new Uint8Array(N);
      for (let p = 0; p < N; p++) {
        if (nearT[p]) { o[p] = 1; continue; }
        const x = p % w;
        const y = (p / w) | 0;
        if ((x > 0 && nearT[p - 1]) || (x < w - 1 && nearT[p + 1]) || (y > 0 && nearT[p - w]) || (y < h - 1 && nearT[p + w])) o[p] = 1;
      }
      nearT = o;
    }
    const [br, bgc, bb] = bg;
    for (let p = 0; p < N; p++) {
      if (!nearT[p] || md[p] < 38 || md[p] > 230) continue;
      // α = 물리 혼합비에 가까운 쪽 — refine이 재매핑한 md를 그대로 쓰면 (1−α)를
      // 과소/과대평가해 헤일로 잔존 or 네온 프린지가 난다. min(raw,md)에 하한 0.2
      // (저알파에서 1/α 증폭으로 B 오차가 폭주하는 것을 차단).
      const a = Math.min(raw[p], md[p]);
      if (a < 51) continue;
      const af = a / 255;
      const inv = 1 - af;
      const i4 = p * 4;
      rgba[i4] = clamp255((rgba[i4] - inv * br) / af);
      rgba[i4 + 1] = clamp255((rgba[i4 + 1] - inv * bgc) / af);
      rgba[i4 + 2] = clamp255((rgba[i4 + 2] - inv * bb) / af);
    }
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** 크로마 유사 판정 — 휘도 정규화로 그림자(같은 색, 어두움)를 배경 유사로 인정.
 *  단독 결정자가 아니라 애매 구간의 보조 신호로만 쓴다(무채색 판별력 0 — 호출부가 가드). */
function chromaMatch(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): boolean {
  if (Math.abs(r1 - r2) <= 40 && Math.abs(g1 - g2) <= 40 && Math.abs(b1 - b2) <= 40) return true;
  const l1 = (r1 + g1 + b1) / 3 + 1e-3;
  const l2 = (r2 + g2 + b2) / 3 + 1e-3;
  const ratio = l1 / l2;
  if (ratio < 0.3 || ratio > 2.4) return false;
  const dr = r1 / l1 - r2 / l2;
  const dg = g1 / l1 - g2 / l2;
  const db = b1 / l1 - b2 / l2;
  return Math.sqrt(dr * dr + dg * dg + db * db) < 0.22;
}
