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
