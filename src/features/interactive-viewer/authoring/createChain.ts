/**
 * 게임 '전체 생성 사슬' 단일 진입점 — designGame → assembleAndPlace → resolveIntent 폴백
 * → compose 최후 폴백 → 라이브러리·교사 카드 저장까지 한 함수(runFullCreation)로 묶는다.
 *
 * 왜: 툴바 버튼(board/prompt.ts)·노드/풀스크린 프롬프트(applyPrompt.ts)·패키지(board/composer.ts)
 * 세 경로가 각자 다른 사슬을 타면서 노드/패키지 경로만 designGame(지능층)을 건너뛰어
 * "같은 요청인데 단순한 게임"이 나오고, 교사 카드도 경로에 따라 빠지던 문제의 단일화.
 *
 * ⚠ 단방향 의존: 이 파일은 board/ 를 import 하지 않는다(interactive-viewer 내부 + 공용 lib만).
 *   board/prompt.ts·composer.ts 가 이 함수를 '호출'하는 방향으로만 잇는다(순환 import 방지).
 */
import { useInteractiveStore } from '../store/interactiveStore';
import { composeInteractiveNode } from './composeNode';
import { resolveIntent } from '../resolver/resolveIntent';
import { selectRecipe, type IntentParse } from '../resolver/selectRecipe';
import { dressUpTeacherCard, fillSlots } from '../resolver/fillSlots';
import { designGame, type TeacherCard } from '../resolver/designAgent';
import { buildTeacherCard, ensurePrompts } from '../resolver/teacherCard';
import type { MechanismId } from '../resolver/recipeTypes';
import { assembleAndPlace } from '../resolver/place';
import { saveToLibrary } from '../store/library';
import { saveGameCard } from '../store/gameCards';

export interface CreationResult {
  ok: boolean;
  /** 사용자에게 보여줄 짧은 결과 메시지(토스트). */
  message: string;
}

/** 진행 표시·교사 카드용 '주제' — 생성 동사·군더더기를 걷어내고 교사가 입력한 핵심만 남긴다(길면 줄임). */
export function cleanGameTopic(text: string): string {
  const t = (text || '')
    // "이 이미지(들)로 / 이 사진으로 / 이걸로" 등 지시어 접두 제거(이미지 선택 게임 제목이 장황해짐).
    .replace(/이\s*(이미지|사진|그림)들?(으)?로|이것?들?(으)?로|이걸로|선택한?\s*(이미지|사진|그림)들?(으)?로/g, ' ')
    .replace(/만들어줘|만들어|만들기|만들|구성해줘|구성|생성해줘|생성|새로|짜줘|짜|해줘|주세요|줘/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const topic = t || (text || '').trim() || '인터랙티브';
  return topic.length > 20 ? topic.slice(0, 20) + '…' : topic;
}

/** 프롬프트 하나로 docId 노드에 게임 '전체'를 만든다(디렉터) — 어느 경로에서 불려도 동일 품질.
    1) 게임 디자인 에이전트(Tier1 지능층) → 결정론 조립  2) 결정론 Resolver 폴백  3) compose 최후 폴백.
    성공하면 라이브러리 등록 + 교사 카드 저장까지 여기서 끝낸다(모든 게임은 항상 교사 카드를 갖는다). */
export async function runFullCreation(
  docId: string,
  text: string,
  onBusy?: (m: string | null) => void,
): Promise<CreationResult> {
  useInteractiveStore.getState().ensure(docId); // 캐시 보장(mutate 대상)
  const topic = cleanGameTopic(text);
  let r: CreationResult | null = null;
  let card: TeacherCard | null = null;
  let mechanism: MechanismId | null = null;

  // 1) 게임 디자인 에이전트(Tier1 지능층) — 메커니즘 선택 + 풍부한 내용 + 교사 활동 카드.
  //    구조는 만들지 않는다 — 받은 '내용'을 결정론 Resolver(assembleAndPlace)가 조립·검증한다.
  //    단, 옷입히기(dress-up)·그림자 퀴즈(shadow-quiz)는 결정론 레시피가 정답이라 에이전트를 건너뛴다
  //    (LLM 변동 회피 — dress-up=날씨 테이블, shadow-quiz=동물 풀+실루엣 파생).
  const forced = selectRecipe(text)?.mechanism;
  const isDressUp = forced === 'dress-up';
  const skipAgent = isDressUp || forced === 'shadow-quiz';
  const designed = skipAgent ? null : await designGame(text, onBusy);
  if (designed?.input) {
    const placed = await assembleAndPlace(docId, designed.mechanism, designed.input, onBusy);
    if (placed.ok) {
      r = { ok: true, message: placed.message };
      card = designed.card;
      mechanism = designed.mechanism;
    }
  }
  // 1.5) P0-2 부분 설계 소비 — 에이전트가 메커니즘·교사 카드는 만들고 '내용'만 미달(input null)이면
  //      카드는 에이전트 것을 보존하고, 내용은 에이전트가 고른 메커니즘 그대로 fillSlots(결정론/narrow LLM)
  //      로 충전한다(카드-게임 정합 유지). 조립 실패 시에도 카드는 남겨 아래 폴백 산출물에 동반시킨다.
  if (!r && designed) {
    card = designed.card;
    if (!designed.input) {
      const base = selectRecipe(text); // 동사 매칭되면 명사·개수 재활용(메커니즘만 에이전트 선택으로 교체)
      const parse: IntentParse = base
        ? { ...base, mechanism: designed.mechanism }
        : {
            mechanism: designed.mechanism,
            themeNoun: topic,
            // selectRecipe.difficulty 기본값과 동일(만3=4 / 만4=6 / 만5=9) — 카드의 연령 설계를 따른다.
            count: designed.card.age === 3 ? 4 : designed.card.age === 5 ? 9 : 6,
            age: designed.card.age,
          };
      const input = await fillSlots(text, parse, onBusy);
      if (input) {
        const placed = await assembleAndPlace(docId, designed.mechanism, input, onBusy);
        if (placed.ok) {
          r = { ok: true, message: placed.message };
          mechanism = designed.mechanism;
        }
      }
    }
  }
  // 2) 결정론 Resolver(규칙 매칭) — 에이전트 실패/한도 시 바닥을 받친다(즉시·안정).
  if (!r) {
    const intent = await resolveIntent(text, onBusy);
    if (intent) {
      const placed = await assembleAndPlace(docId, intent.mechanism, intent.input, onBusy);
      if (placed.ok) {
        r = { ok: true, message: placed.message };
        mechanism = intent.mechanism;
        if (isDressUp) card = dressUpTeacherCard(text); // 옷입히기 교사 카드(결정론·날씨별)
      }
    }
  }
  // 3) compose 폴백(롱테일 — 동사 매칭 실패).
  if (!r) r = await composeInteractiveNode(docId, text, onBusy);

  // 생성 성공 → 갤러리/인터랙티브 홈에 자동 리스트(라이브러리 등록) + 교사 카드 동반 저장.
  if (r.ok) {
    const doc = useInteractiveStore.getState().peek(docId);
    if (doc && doc.elements.length > 0) {
      saveToLibrary(doc);
      // ★ 모든 게임은 항상 교사 카드를 갖는다 — 에이전트 카드가 없으면 결정론 생성, 발문은 늘 채운다.
      if (!card) card = isDressUp ? dressUpTeacherCard(text) : buildTeacherCard(mechanism ?? 'tap-select', topic, doc.title);
      // 폴백이 에이전트와 다른 방식으로 조립됐을 수 있다 — 카드 배지가 실제 놀이 방식과 일치하도록 맞춘다.
      if (mechanism && card.mechanism !== mechanism) card = { ...card, mechanism };
      card = ensurePrompts(card, topic);
      saveGameCard(docId, card);
    }
  }
  return r;
}
