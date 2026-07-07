/**
 * 문서 편집 — 마크다운 섹션 분할/재조립.
 *
 * 문서 편집 페이지에서 '영역(섹션)을 선택해 프롬프트로 고치기' 위해, 본문 마크다운을 상위 heading
 * (#, ##, ###) 경계로 섹션으로 나눈다. 첫 heading 앞의 서문(제목 h1 + 메타줄 등)은 첫 섹션에 포함.
 * joinSections 은 원본을 무손실 복원한다(라인 사이 '\n' 경계 그대로).
 */
export interface DocSection {
  /** 섹션 id — 배열 인덱스 기반(s0, s1 …). 선택 상태 키. */
  id: string;
  /** 이 섹션의 원본 마크다운(자기 heading 줄 포함). */
  text: string;
  /** 표시용 제목(heading 텍스트, 없으면 '서문'). */
  heading: string;
}

const HEADING_RE = /^#{1,3}\s+(.*)$/;

/** 마크다운을 상위 heading 경계로 섹션 분할. 항상 1개 이상 반환. */
export function splitSections(md: string): DocSection[] {
  const lines = (md ?? '').split('\n');
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (HEADING_RE.test(l) && cur.length) {
      groups.push(cur);
      cur = [l];
    } else {
      cur.push(l);
    }
  }
  if (cur.length) groups.push(cur);
  if (!groups.length) groups.push(['']);
  return groups.map((g, i) => {
    const headLine = g.find((l) => HEADING_RE.test(l));
    const heading = headLine ? (HEADING_RE.exec(headLine)?.[1]?.trim() ?? '서문') : '서문';
    return { id: `s${i}`, text: g.join('\n'), heading: heading || '서문' };
  });
}

/** 섹션들을 원본 마크다운으로 재조립(무손실). */
export function joinSections(secs: Array<{ text: string }>): string {
  return secs.map((s) => s.text).join('\n');
}

/* ── 표 행 단위(주차별 선택) ─────────────────────────────────────────────────
   놀이계획의 '요일별 운영'·'단계별 프로젝트 전개'는 GFM 표 1개 = 섹션 1개라서
   heading 분할로는 주차(행)를 개별 선택할 수 없다. 저장 마크다운은 표 그대로 두고
   (유치원 계획안의 표 양식은 인쇄·결재 관행 — 구조 변경 금지), **렌더 시점에만**
   표의 데이터 행을 하위 선택 단위로 취급한다. id 는 `s{i}#r{j}`(복합 키 — 기존
   selectedIds: string[] 에 그대로 담긴다), 영속되지 않는 UI 상태라 마이그레이션 없음. */

export interface TableRowUnit {
  /** 복합 선택 id — `${sectionId}#r${rowIdx}`. */
  id: string;
  /** 데이터 행 인덱스(0-기반, 헤더·구분선 제외). */
  rowIdx: number;
  /** 표시용 라벨 = 첫 셀 텍스트(예: '1주차 · 준비·도입', '월'). */
  label: string;
  /** 섹션 텍스트 안에서 이 행의 줄 번호(0-기반) — 렌더 좌표(position) 대조용. */
  lineIdx: number;
}

/** 섹션 안 GFM 표의 데이터 행 단위를 뽑는다(표가 없으면 []). 첫 표만 대상. */
export function tableRowUnits(sec: Pick<DocSection, 'id' | 'text'>): TableRowUnit[] {
  const lines = sec.text.split('\n');
  const units: TableRowUnit[] = [];
  let headerSeen = false;
  let delimiterSeen = false;
  let rowIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const isPipe = l.startsWith('|') && l.endsWith('|') && l.length > 2;
    if (!isPipe) {
      if (delimiterSeen && units.length) break; // 첫 표가 끝났으면 종료
      continue;
    }
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    if (!delimiterSeen) {
      // `| --- | --- |` 구분선
      if (/^\|[\s:-]+(\|[\s:-]+)+\|$/.test(l)) {
        delimiterSeen = true;
        continue;
      }
      continue;
    }
    const firstCell = l.split('|').map((c) => c.trim()).filter(Boolean)[0] ?? '';
    units.push({ id: `${sec.id}#r${rowIdx}`, rowIdx, label: firstCell || `${rowIdx + 1}행`, lineIdx: i });
    rowIdx++;
  }
  return units;
}

/** 선택 id 집합에서 사람이 읽을 라벨 목록을 만든다(placeholder·프롬프트용).
    섹션 id → heading, 행 id → 행 첫 셀. 존재하지 않는 id 는 걸러진다(스테일 프루닝용으로도 사용). */
export function labelsForSelection(md: string, selIds: string[]): Array<{ id: string; label: string }> {
  const secs = splitSections(md);
  const byId = new Map(secs.map((s) => [s.id, s]));
  const out: Array<{ id: string; label: string }> = [];
  for (const id of selIds) {
    const hash = id.indexOf('#r');
    if (hash === -1) {
      const s = byId.get(id);
      if (s) out.push({ id, label: s.heading });
    } else {
      const s = byId.get(id.slice(0, hash));
      if (!s) continue;
      const unit = tableRowUnits(s).find((u) => u.id === id);
      if (unit) out.push({ id, label: unit.label });
    }
  }
  return out;
}
