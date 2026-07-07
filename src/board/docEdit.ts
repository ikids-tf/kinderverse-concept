/**
 * 문서 편집 — 프롬프트로 문서(선택 영역)를 AI 수정하는 배관(독립 모듈).
 *
 * 문서 편집 페이지의 하단 프롬프트바(·좌패널 원클릭 도구) 입력을 받아, 선택한 영역(섹션·
 * 표 행)만 지시대로 고쳐 되쓴다. 선택이 없으면 문서 전체를 맥락으로 고친다.
 *  - [수업 설정] 주입: 좌패널의 대상 연령·교육과정(payload)·키워드(node.data.docKeywords)를
 *    프롬프트에 합류 — "왼쪽에 세팅한 값과 함께 반영"(무근거 생성 금지 규칙 준수 지시 포함).
 *  - 표 행 선택(`s{i}#r{j}`): 행은 독립 마크다운이 아니라서 **그 섹션 표 전체**를 보내되
 *    "지정 행만 고치라"는 제약을 건다(열 맥락 보존 + 기존 섹션 치환 로직 재사용).
 *  - payload 역동기화: 놀이계획이면 수정 결과의 표를 다시 파싱해 payload.days 에 반영
 *    (좌패널 편집이 payload 기준 재생성으로 AI 수정을 덮어쓰는 드리프트 완화 — 실패 시 스킵).
 *  - 본문 커밋은 editTextCmd(되돌리기 가능).
 *
 * ⚠ 이 파일은 board/prompt.ts·composer.ts 를 import 하지 않는다(순환 방지). 페이지와는
 *   CustomEvent('kv:doc-edit-prompt')로만 잇는다(직접 import 없음). @/ai·@/store·commands 만 의존.
 */
import { callGateway } from '@/ai/client';
import { useBoardStore } from '@/store/boardStore';
import { editTextCmd } from './commands';
import { splitSections, joinSections, tableRowUnits, type DocSection } from '@/features/doc-edit/sections';
import { ageLabel, type WeeklyPlanGridProps, type PlanDay } from '@/ui-registry/contracts';

/** 코드펜스·머리말 제거(모델이 ```로 감싸는 경우). */
function stripFence(t: string): string {
  return t.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
}

export interface DocPromptResult {
  ok: boolean;
  message: string;
}

/** 선택 id 를 섹션/행으로 분해. */
function parseSelection(selIds: string[]): { secIds: Set<string>; rowsBySec: Map<string, Set<string>> } {
  const secIds = new Set<string>();
  const rowsBySec = new Map<string, Set<string>>();
  for (const id of selIds) {
    const h = id.indexOf('#r');
    if (h === -1) {
      secIds.add(id);
    } else {
      const sec = id.slice(0, h);
      if (!rowsBySec.has(sec)) rowsBySec.set(sec, new Set());
      rowsBySec.get(sec)!.add(id);
    }
  }
  return { secIds, rowsBySec };
}

/** 좌패널 설정(연령·교육과정·키워드) — 프롬프트 [수업 설정] 블록. 없으면 ''. */
function settingsBlock(nodeId: string): string {
  const node = useBoardStore.getState().nodes[nodeId];
  if (!node) return '';
  const payload = node.data?.payload as { type?: string; props?: WeeklyPlanGridProps } | undefined;
  const kwsRaw = node.data?.docKeywords;
  const kws = Array.isArray(kwsRaw) ? (kwsRaw as string[]).filter((k) => typeof k === 'string' && k.trim()) : [];
  const parts: string[] = [];
  if (payload?.type === 'WeeklyPlanGrid' && payload.props) {
    parts.push(`대상: ${ageLabel(payload.props)}`);
    parts.push(`교육과정: ${payload.props.curriculum === 'standard' ? '표준보육과정' : '누리과정'}`);
  }
  if (kws.length) parts.push(`키워드: ${kws.join(', ')}`);
  return parts.length ? `\n\n[수업 설정 — 반영할 것]\n${parts.join(' · ')}` : '';
}

/** 수정 결과 마크다운에서 5열 GFM 표를 다시 파싱해 payload.days 로(역동기화, best-effort).
    파싱 실패(표 소실·열 수 불일치)면 null — 호출부가 스킵(payload 미변경). */
function parseDaysFromMd(md: string): PlanDay[] | null {
  const lines = md.split('\n');
  const days: PlanDay[] = [];
  let headerSeen = false;
  let delimiterSeen = false;
  for (const raw of lines) {
    const l = raw.trim();
    const isPipe = l.startsWith('|') && l.endsWith('|') && l.length > 2;
    if (!isPipe) {
      if (delimiterSeen && days.length) break; // 첫 표만
      headerSeen = false;
      delimiterSeen = false;
      continue;
    }
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    if (!delimiterSeen) {
      if (/^\|[\s:-]+(\|[\s:-]+)+\|$/.test(l)) delimiterSeen = true;
      continue;
    }
    const cells = l.slice(1, -1).split('|').map((c) => c.trim()).map((c) => (c === '—' ? '' : c));
    if (cells.length !== 5) return null; // 열 구성이 깨졌으면 동기화 포기
    days.push({ day: cells[0], area: cells[1], activity: cells[2], materials: cells[3], goal: cells[4] });
  }
  return days.length ? days : null;
}

/** AI 수정 뒤 payload.days 역동기화 — 놀이계획 payload 가 있을 때만, 실패는 조용히 스킵. */
function syncPlanDays(nodeId: string, nextMd: string): void {
  const board = useBoardStore.getState();
  const node = board.nodes[nodeId];
  const payload = node?.data?.payload as { type?: string; props?: WeeklyPlanGridProps } | undefined;
  if (!node || payload?.type !== 'WeeklyPlanGrid' || !payload.props) return;
  const days = parseDaysFromMd(nextMd);
  if (!days) return;
  if (JSON.stringify(days) === JSON.stringify(payload.props.days)) return;
  board.updateNodeRaw(nodeId, {
    data: { ...(node.data ?? {}), payload: { type: 'WeeklyPlanGrid', props: { ...payload.props, days } } },
  });
}

/**
 * 문서(nodeId)의 선택 영역(selIds — 섹션 `s{i}`·표 행 `s{i}#r{j}`)만 프롬프트대로 고친다.
 * 선택이 없으면 전체. onBusy 로 진행 문구를 흘려보낸다(beginGen/endGen 은 호출부 담당).
 */
export async function applyDocPrompt(
  nodeId: string,
  prompt: string,
  selIds: string[],
  onBusy?: (m: string | null) => void,
): Promise<DocPromptResult> {
  const node = useBoardStore.getState().nodes[nodeId];
  if (!node) return { ok: false, message: '문서를 찾지 못했어요' };
  const md = node.text ?? '';
  const secs = splitSections(md);
  const byId = new Map<string, DocSection>(secs.map((s) => [s.id, s]));

  const { secIds, rowsBySec } = parseSelection(selIds);
  // 행 선택은 그 섹션 전체를 스코프에 포함(표는 행 단독으론 의미 소실 — 열 맥락 필요).
  const involved = new Set<string>([...secIds, ...rowsBySec.keys()]);
  const sel = selIds.length ? involved : null; // null = 문서 전체

  let rowNote = '';
  if (rowsBySec.size) {
    const notes: string[] = [];
    for (const [secId, rowIds] of rowsBySec) {
      const s = byId.get(secId);
      if (!s) continue;
      const labels = tableRowUnits(s)
        .filter((u) => rowIds.has(u.id))
        .map((u) => `'${u.label}'`);
      if (labels.length) notes.push(`'${s.heading}' 표에서는 ${labels.join(', ')} 행만 고치고 다른 행은 글자 그대로 유지`);
    }
    if (notes.length) {
      rowNote = `\n\n[행 제한]\n${notes.join('\n')}\n표는 같은 열 구성의 GFM 표로 전체를 다시 쓰세요(행 추가·분할이 필요하면 허용).`;
    }
  }

  const scope = sel
    ? secs.filter((s) => sel.has(s.id)).map((s) => s.text).join('\n\n')
    : md;
  if (sel && !scope.trim()) return { ok: false, message: '고칠 영역을 찾지 못했어요' };

  const settings = settingsBlock(nodeId);

  onBusy?.(sel ? '✏️ 고른 영역을 고치는 중…' : '✏️ 문서를 고치는 중…');
  const ask = (provider: 'auto' | 'gemini') =>
    callGateway({
      task: 'writing',
      tier: 'mid',
      provider,
      fallback: ['high'],
      system:
        '너는 유치원 교사의 교육 문서를 다듬는 문장 에이전트다. 교사의 지시대로 해당 부분만 고친다. ' +
        '사실을 지어내지 말고, 마크다운 구조(제목 #·##, 표, 인용 >, 목록)를 그대로 유지한다. ' +
        '[수업 설정]이 주어지면 그 연령 발달 수준의 어휘와 교육과정 용어를 지키고, 키워드는 방향일 뿐이니 문서에 없는 사실을 새로 지어내지 않는다. ' +
        '설명·인사·머리말 없이 고친 마크다운만 출력한다(코드펜스 금지).',
      messages: [
        {
          role: 'user',
          content: sel
            ? `아래는 어느 교육 문서의 '선택한 영역'입니다. 교사 지시대로 이 부분만 고쳐, 같은 마크다운 구조로 다시 써 주세요.\n\n[교사 지시]\n${prompt}${settings}${rowNote}\n\n[선택 영역]\n${scope.slice(0, 3500)}`
            : `아래 교육 문서를 교사 지시대로 고쳐 전체를 다시 써 주세요. 제목·표·구성을 유지하세요.\n\n[교사 지시]\n${prompt}${settings}\n\n[문서]\n${md.slice(0, 4000)}`,
        },
      ],
      meta: { kind: 'doc_edit', title: (node.text ?? '문서').slice(0, 20), selected: [] },
      maxTokens: 1600,
    });

  let res = await ask('auto');
  if (!res.ok || !res.text) res = await ask('gemini'); // 프로바이더 한도 시 다른 쪽으로
  if (!res.ok || !res.text) return { ok: false, message: '수정에 실패했어요 — 다시 시도해 주세요' };
  const out = stripFence(res.text);
  if (!out) return { ok: false, message: '수정 내용을 받지 못했어요' };

  let next: string;
  if (sel) {
    // 선택 섹션들의 자리에 결과를 되끼운다 — 여러 섹션을 함께 보냈으면 결과 블록을 첫 선택 섹션
    // 자리에 넣고 나머지 선택 섹션은 제거(결과에 통합됨). 비선택 섹션은 그대로.
    const rebuilt: DocSection[] = [];
    let placed = false;
    for (const s of secs) {
      if (sel.has(s.id)) {
        if (!placed) {
          rebuilt.push({ ...s, text: out });
          placed = true;
        }
      } else {
        rebuilt.push(s);
      }
    }
    next = joinSections(rebuilt);
  } else {
    next = out;
  }
  if (next.trim() === md.trim()) return { ok: false, message: '바뀐 내용이 없어요 — 다르게 말씀해 주세요' };

  editTextCmd(nodeId, md, next);
  syncPlanDays(nodeId, next); // 놀이계획이면 표 → payload.days 역반영(드리프트 완화)
  return { ok: true, message: sel ? '고른 영역을 고쳤어요' : '문서를 고쳤어요' };
}
