/**
 * 게임 '교사 활동 카드' 동반 저장소 — 게임 문서(kv:inodes:v1)와 1:1, docId 로 참조.
 *
 * 교사 카드(목표·발문·진행·확장·평가)는 '교사 대면' 산출물로, '아이 대면' 게임 노드(InteractiveNode)와
 * 성격이 다르다. FROZEN B 스키마(노드)를 건드리지 않으려고 노드 밖 별도 저장소에 둔다(라이브러리와 같은 패턴).
 * 게임 디자인 에이전트(designAgent)가 생성 시 기록하고, 뷰어/갤러리가 docId 로 읽어 렌더한다.
 */
import type { TeacherCard } from '../resolver/designAgent';

const KEY = 'kv:game-cards:v1';

function readAll(): Record<string, TeacherCard> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, TeacherCard>) : {};
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, TeacherCard>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(all)); // localStorage 미러가 클라우드로 동기화
  } catch {
    /* quota — 무시 */
  }
}

/** 이 게임의 교사 카드(없으면 null). */
export function getGameCard(docId: string): TeacherCard | null {
  return readAll()[docId] ?? null;
}

/** 교사 카드 저장(같은 docId면 갱신). */
export function saveGameCard(docId: string, card: TeacherCard): void {
  const all = readAll();
  all[docId] = card;
  writeAll(all);
  try {
    window.dispatchEvent(new CustomEvent('kv:game-card-saved', { detail: { docId } }));
  } catch {
    /* no-op */
  }
}

/** 교사 카드 제거(게임 삭제 시 동반 정리). */
export function removeGameCard(docId: string): void {
  const all = readAll();
  if (docId in all) {
    delete all[docId];
    writeAll(all);
  }
}
