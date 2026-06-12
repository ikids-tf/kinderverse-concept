import { useBoardStore, presentationVisibleSet } from '@/store/boardStore';

/* 지난 수업 기록 — 수업 모드 진입 시 자동으로 한 건 저장(localStorage).
   카드 원본(이미지 데이터)은 저장하지 않고 노드 id·캡션만 기록한다 — 썸네일은
   리스트가 열릴 때 살아있는 노드에서 찾아 그린다(노드가 지워졌으면 아이콘 폴백). */

export interface LessonItem {
  id: string;
  type: string;
  caption: string;
}

export interface LessonRecord {
  id: string;
  /** epoch ms — 수업 모드에 들어간 시각. */
  at: number;
  title: string;
  items: LessonItem[];
}

const KEY = 'kv:lessons:v1';
const MAX = 50;

export function listLessons(): LessonRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LessonRecord[]) : [];
  } catch {
    return [];
  }
}

function save(list: LessonRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* 저장 실패(쿼터 등)는 조용히 — 수업 진행을 막지 않는다 */
  }
}

export function removeLesson(id: string): void {
  save(listLessons().filter((l) => l.id !== id));
  // 서버 미러(DB)에서도 삭제 — 실패해도 로컬 동작은 막지 않는다.
  void fetch(`/api/lessons?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
}

/** 서버 미러(DB) 저장 — 파일 DB(개념 단계) → Supabase 테이블(프로덕션) 동일 계약.
    네트워크/서버 실패는 조용히 넘긴다(로컬 기록이 항상 우선). */
function pushLessonToDb(rec: LessonRecord): void {
  void fetch('/api/lessons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(rec),
  }).catch(() => {});
}

/** 노드의 표시용 한 줄 이름 — 캡션/제목/타입 라벨 순. */
function itemCaption(id: string): string {
  const n = useBoardStore.getState().nodes[id];
  if (!n) return '';
  const title = (n.data?.title as string | undefined)?.trim();
  const text = (n.text ?? '').split('\n')[0].trim();
  const typeLabels: Partial<Record<typeof n.type, string>> = {
    image: '이미지',
    frame: '프레임',
    sticky: '메모',
    text: '텍스트',
    motion: '애니메이션',
  };
  return (title || text || typeLabels[n.type] || n.type).slice(0, 30);
}

/** 현재 수업 모드의 가시 자료로 기록 한 건을 만든다(없으면 null). */
function buildLessonRecord(): LessonRecord | null {
  const s = useBoardStore.getState();
  if (!s.classroom) return null;
  const vis = presentationVisibleSet(s.nodes, s.classroom, null);
  const ids = vis ? [...vis] : s.classroom.ids;
  const items: LessonItem[] = ids
    .filter((id) => s.nodes[id])
    .map((id) => ({ id, type: s.nodes[id].type, caption: itemCaption(id) }));
  if (!items.length) return null;

  // 제목: 첫 프레임의 주제 > 첫 항목 캡션(+ 외 N개)
  const frame = items.find((it) => it.type === 'frame');
  const first = frame ?? items[0];
  const others = items.filter((it) => it.type !== 'frame').length - (frame ? 0 : 1);
  const title = frame ? first.caption : others > 0 ? `${first.caption} 외 ${others}개` : first.caption;
  return { id: `lesson_${Date.now().toString(36)}`, at: Date.now(), title: title || '수업', items };
}

const itemsKey = (rec: LessonRecord) => rec.items.map((it) => it.id).sort().join(',');

/** 현재 수업 모드 진입 직후 호출 — 보이는 수업자료를 한 건의 기록으로 저장.
    같은 자료 구성으로 연달아 다시 들어가면(10분 안) 중복 기록하지 않는다. */
export function recordCurrentLesson(): void {
  const rec = buildLessonRecord();
  if (!rec) return;
  const list = listLessons();
  const key = itemsKey(rec);
  // 10분 안에 같은 자료 구성으로 재진입(다시 열기 포함) — 사이에 다른 수업이
  // 끼어 있어도 새 기록을 만들지 않는다(최근 몇 건 안에서 검사).
  const dup = list.slice(0, 5).find((p) => Date.now() - p.at < 10 * 60_000 && itemsKey(p) === key);
  if (dup) return;
  save([rec, ...list]);
  pushLessonToDb(rec);
}

/** 수동 저장(저장 버튼) — 항상 기록한다. 1분 안에 같은 구성을 또 누르면 새 항목을
    만들지 않고 그 기록의 시각만 갱신(연타 방지). 저장된 기록을 돌려준다. */
export function saveCurrentLesson(): LessonRecord | null {
  const rec = buildLessonRecord();
  if (!rec) return null;
  const list = listLessons();
  const key = itemsKey(rec);
  const recent = list[0];
  if (recent && Date.now() - recent.at < 60_000 && itemsKey(recent) === key) {
    const bumped = { ...recent, at: Date.now() };
    save([bumped, ...list.slice(1)]);
    pushLessonToDb(bumped);
    return bumped;
  }
  save([rec, ...list]);
  pushLessonToDb(rec);
  return rec;
}
