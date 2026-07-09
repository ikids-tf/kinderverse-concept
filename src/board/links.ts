import type { BoardLink, BoardNode } from '@/store/boardStore';

/* 요소 연결(links) 헬퍼 — 포트 드래그로 만든 from→to 연결의 '순번 라벨'과
   '연결망'을 계산한다.
   라벨 규칙: 머리(들어오는 선 없음)가 1, 첫 연결을 따라 2, 3… 으로 증가(본선).
   한 노드에서 '추가로' 가지를 치면, 가지는 그 노드의 '다음 단계 번호'에 -k 를 붙인다.
   즉 1번에서 여러 개 연결하면 2, 2-1, 2-2…  2번에서 여러 개 연결하면 3, 3-1, 3-2…
   (부모 라벨이 아니라 다음 단계 번호 기준 — 2단계의 가지는 2-1이 아니라 3-1).
   수업 모드/슬라이드 쇼는 이 라벨의 계층 숫자 순(1, 2, 2-1, 2-2, 3, 3-1…)으로 정렬한다. */

/** '1-1' → [1,1] — 계층 숫자 비교용. */
function segs(label: string): number[] {
  return label.split('-').map(Number);
}

/** 라벨 정렬 비교(1 < 1-1 < 2 < 2-1 < 3). */
export function compareLabels(a: string, b: string): number {
  const A = segs(a);
  const B = segs(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] ?? 0) - (B[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** 마지막 마디 +1 ('1'→'2', '1-1'→'1-2'). */
function incLast(label: string): string {
  const p = label.split('-');
  p[p.length - 1] = String(Number(p[p.length - 1]) + 1);
  return p.join('-');
}

/** 각 노드의 순번 라벨(연결망마다 1부터). 사이클이어도 안전. */
export function linkSequence(links: BoardLink[]): Map<string, string> {
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const seen: string[] = []; // 등장 순서 보존 — 먼저 만든 연결망이 먼저 번호를 받는다
  const note = (id: string) => {
    if (!indeg.has(id)) {
      indeg.set(id, 0);
      seen.push(id);
    }
  };
  for (const l of links) {
    note(l.from);
    note(l.to);
    out.set(l.from, [...(out.get(l.from) ?? []), l.to]);
    indeg.set(l.to, (indeg.get(l.to) ?? 0) + 1);
  }

  const labels = new Map<string, string>();
  const visit = (start: string) => {
    if (labels.has(start)) return;
    const used = new Set<string>(); // 연결망 안에서만 유일하면 된다
    const claim = (want: string): string => {
      let w = want;
      while (used.has(w)) w = incLast(w);
      used.add(w);
      return w;
    };
    labels.set(start, claim('1'));
    const queue = [start];
    while (queue.length) {
      const id = queue.shift()!;
      const L = labels.get(id)!;
      const kids = (out.get(id) ?? []).filter((k) => !labels.has(k));
      const main = incLast(L); // 이 노드에서 이어지는 다음 단계 번호('2'→'3')
      kids.forEach((k, i) => {
        // 첫 연결 = 다음 단계 본선(3), 추가 연결 = 그 단계의 가지(3-1, 3-2…).
        // 가지는 부모 라벨이 아니라 '다음 단계 번호'에 -k 를 붙인다(2단계 가지 = 3-1).
        labels.set(k, claim(i === 0 ? main : `${main}-${i}`));
        queue.push(k);
      });
    }
  };
  for (const id of seen) if ((indeg.get(id) ?? 0) === 0 && (out.get(id)?.length ?? 0) > 0) visit(id);
  for (const id of seen) if (!labels.has(id)) visit(id); // 사이클/잔여 보호
  return labels;
}

/** id가 속한 연결망(방향 무시 도달 가능 집합)을 라벨 순으로. 연결이 없으면 []. */
export function linkedComponent(id: string, links: BoardLink[]): string[] {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const l of links) {
    add(l.from, l.to);
    add(l.to, l.from);
  }
  if (!adj.has(id)) return [];
  const set = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      if (!set.has(nx)) {
        set.add(nx);
        queue.push(nx);
      }
    }
  }
  if (set.size < 2) return [];
  const seq = linkSequence(links);
  return [...set].sort((a, z) => compareLabels(seq.get(a) ?? '999', seq.get(z) ?? '999'));
}

/** 방향 무시 직접 이웃(연결선으로 이어진 노드) id 목록. */
export function neighborIds(links: BoardLink[], id: string): string[] {
  const out: string[] = [];
  for (const l of links) {
    if (l.from === id) out.push(l.to);
    else if (l.to === id) out.push(l.from);
  }
  return out;
}

function firstLine(t?: string): string {
  return (t ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
}

const isImageNode = (n?: BoardNode): boolean => !!n && (n.type === 'image' || n.data?.role === 'image');

/** 이 카드로 활동지를 만들 때 쓸 "관련 놀이 주제"를 찾는다(헤더 '주제' 시드).
    우선순위: (1) 이 카드가 활동지/계획 문서면 그 payload 의 theme/topic 을 이어받고,
    (2) 연결선으로 이어진 이미지 카드의 캡션, (3) 이 카드 자체가 이미지면 그 캡션. 없으면 undefined. */
export function relatedWorksheetTheme(
  nodes: Record<string, BoardNode>,
  links: BoardLink[],
  nodeId: string,
): string | undefined {
  const node = nodes[nodeId];
  if (!node) return undefined;
  const payload = node.data?.payload as { props?: { theme?: string; topic?: string } } | undefined;
  const own = payload?.props?.theme || payload?.props?.topic;
  if (own?.trim()) return own.trim();
  for (const nid of neighborIds(links, nodeId)) {
    if (isImageNode(nodes[nid])) {
      const cap = firstLine(nodes[nid].text);
      if (cap) return cap;
    }
  }
  if (isImageNode(node)) {
    const cap = firstLine(node.text);
    if (cap) return cap;
  }
  return undefined;
}
