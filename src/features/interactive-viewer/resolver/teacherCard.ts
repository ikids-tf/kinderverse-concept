/**
 * 결정론 교사 카드 — '모든 게임은 항상 교사 카드를 갖는다'를 보장하는 폴백 생성기(LLM 없음).
 *
 * 에이전트(designGame)가 만든 풍부한 카드가 있으면 그걸 쓰되, 없거나(룰 기반 resolver·compose 경로)
 * 발문이 비어 있으면 이 생성기가 메커니즘×주제에 맞춰 채운다. 핵심 추가 = ★발문(prompts):
 * 교사가 '이 게임을 아이들과 함께 보며' 던지는 열린 질문 — 교사가 가장 원하는 부분.
 *
 * 누리과정 5영역 연계 + 메커니즘별 목표·진행·확장·평가. dress-up 은 fillSlots.dressUpTeacherCard 가
 * 더 풍부하게 만들지만, 백필 등에서 이 표도 dress-up 항목을 갖는다(어떤 메커니즘이든 카드 보장).
 */
import type { MechanismId } from './recipeTypes';
import type { TeacherCard } from './designAgent';

/** 메커니즘별 카드 조각(주제 t 를 받아 문장 생성). 발문이 핵심. */
interface CardParts {
  verb: string; // 놀이 동작(진행/평가 문장에 쓰는 명사형)
  domains: string[]; // 누리과정 5영역 중
  objective: (t: string) => string;
  prompts: (t: string) => string[]; // ★발문 — 함께 보며 묻는 열린 질문
  extension: (t: string) => string;
}

const N = (t: string) => (t && t.trim() ? t.trim() : '그림'); // 주제 없으면 '그림'

const MECH_CARD: Record<MechanismId, CardParts> = {
  'sequence-order': {
    verb: '순서대로 세기',
    domains: ['자연탐구', '의사소통'],
    objective: (t) => `${N(t)}을(를) 정해진 순서대로 짚어 세어 보며 수의 순서와 일대일 대응에 관심을 가진다.`,
    prompts: (t) => [
      `지금은 몇 번째 ${N(t)}를 주울 차례일까요?`,
      '다 같이 소리 내어 세어 볼까요? 하나, 둘, 셋…',
      `${N(t)}는 모두 몇 개 있었나요? 어떻게 알았어요?`,
      '다음에 올 숫자는 무엇일까요?',
    ],
    extension: (t) => `교실의 ${N(t)} 같은 물건을 실제로 1부터 순서대로 세어 본다.`,
  },
  'path-trace': {
    verb: '길 따라가기',
    domains: ['자연탐구', '신체운동·건강'],
    objective: (t) => `${N(t)}를 목표까지 길을 따라 데려가 보며 공간·방향과 문제 해결에 관심을 가진다.`,
    prompts: () => [
      '어느 길로 가야 목표에 닿을 수 있을까요?',
      '왜 그 길을 골랐어요?',
      '다른 길로도 갈 수 있을까요? 어떻게요?',
      '가는 길에 무엇을 만날 것 같아요?',
    ],
    extension: () => '교실 바닥에 선을 그려 직접 길을 따라 걸어 본다.',
  },
  'pair-match': {
    verb: '짝 맞추기',
    domains: ['자연탐구', '의사소통'],
    objective: (t) => `${N(t)}와(과) 어울리는 짝을 찾아 이어 보며 관계 짓기와 같고 다름에 관심을 가진다.`,
    prompts: () => [
      '이것과 어울리는 짝은 무엇일까요?',
      '왜 둘이 짝이라고 생각했어요?',
      '짝이 아닌 것은 무엇인가요? 왜요?',
      '또 어떤 것끼리 짝지을 수 있을까요?',
    ],
    extension: () => '실제 사물 카드로 짝 찾기 놀이를 이어 한다(양말·신발 짝 맞추기 등).',
  },
  'tap-select': {
    verb: '골라 찾기',
    domains: ['자연탐구', '의사소통'],
    objective: (t) => `여럿 중에서 ${N(t)}만 찾아 골라 보며 같은 것·다른 것을 구별하고 까닭을 말해 본다.`,
    prompts: (t) => [
      `어떤 게 ${N(t)}일까요? 손가락으로 가리켜 볼까요?`,
      `왜 그게 ${N(t)}라고 생각했어요?`,
      `${N(t)}가 아닌 것은 무엇인가요?`,
      `${N(t)}를 모두 몇 개 찾았나요?`,
    ],
    extension: (t) => `교실·바깥에서 진짜 ${N(t)}를 찾아보는 '보물찾기'로 이어 한다.`,
  },
  'sort-to-bin': {
    verb: '분류하기',
    domains: ['자연탐구', '의사소통'],
    objective: (t) => `${N(t)}을(를) 기준에 따라 무리지어 나눠 보며 분류와 까닭 말하기에 관심을 가진다.`,
    prompts: () => [
      '이건 어디에 넣어야 할까요? 왜 그렇게 생각했어요?',
      '같은 끼리 모으니 어떤 점이 좋아요?',
      '여기 모인 것들은 무엇이 같아요?',
      '또 다른 방법으로도 나눠 볼 수 있을까요?',
    ],
    extension: () => '교실 정리 시간에 장난감·블록을 실제로 종류별로 나눠 담아 본다.',
  },
  'slot-fill': {
    verb: '빈칸 채우기',
    domains: ['의사소통', '자연탐구'],
    objective: (t) => `${N(t)}의 빈자리에 알맞은 것을 넣어 보며 규칙·관계를 찾아본다.`,
    prompts: () => [
      '빈칸에 무엇이 들어가면 좋을까요?',
      '왜 그렇게 생각했어요?',
      '여기에는 왜 그게 안 어울릴까요?',
      '다 채우니 무엇이 완성됐나요?',
    ],
    extension: () => '그림 퍼즐·패턴 블록으로 빈자리 채우기를 이어 한다.',
  },
  'branch-choose': {
    verb: '골라보기',
    domains: ['의사소통', '사회관계'],
    objective: (t) => `${N(t)} 상황에서 스스로 골라 보고 그 까닭을 말하며 생각과 선택을 표현한다.`,
    prompts: () => [
      '너라면 무엇을 고를래요? 왜요?',
      '고르고 나니 어떻게 됐나요?',
      '다른 친구는 어떻게 골랐을까요?',
      '다시 고른다면 무엇을 고르고 싶어요?',
    ],
    extension: () => '"이럴 땐 어떻게 할까?" 상황 그림으로 이야기 나누기를 이어 한다.',
  },
  combine: {
    verb: '합치기',
    domains: ['자연탐구', '예술경험'],
    objective: (t) => `${N(t)}을(를) 둘씩 합쳐 새것을 만들어 보며 변화와 관계에 관심을 가진다.`,
    prompts: () => [
      '이 둘을 합치면 무엇이 될까요?',
      '왜 그렇게 될 거라고 생각했어요?',
      '또 무엇과 무엇을 합쳐 볼까요?',
      '합치니 처음과 무엇이 달라졌나요?',
    ],
    extension: () => '색 물감 섞기·블록 합치기로 「합치면 달라지는」 경험을 이어 한다.',
  },
  'memory-flip': {
    verb: '기억하여 뒤집기',
    domains: ['자연탐구', '의사소통'],
    objective: (t) => `${N(t)} 카드의 자리를 기억해 같은 그림을 찾아보며 기억하기에 관심을 가진다.`,
    prompts: () => [
      '방금 어디에 무엇이 있었는지 기억나요?',
      '같은 그림은 어디에 있었을까요?',
      '어떻게 하면 잘 기억할 수 있을까요?',
      '몇 번 만에 짝을 찾았나요?',
    ],
    extension: () => '실제 그림 카드를 엎어 두고 같은 그림 찾기 기억 놀이를 이어 한다.',
  },
  'free-create': {
    verb: '꾸미기',
    domains: ['예술경험', '의사소통'],
    objective: (t) => `${N(t)}을(를) 자유롭게 꾸며 보며 자기 생각을 표현하고 아름다움을 느낀다.`,
    prompts: () => [
      '어떻게 꾸며 주고 싶어요?',
      '왜 그 색(모양)을 골랐어요?',
      '꾸미고 나니 기분이 어때요?',
      '친구 것과 무엇이 다른가요?',
    ],
    extension: () => '실제 종이·재료로 같은 주제를 직접 꾸며 보는 미술 활동으로 이어 한다.',
  },
  'dress-up': {
    verb: '옷 입히기',
    domains: ['자연탐구', '신체운동·건강'],
    objective: (t) => `날씨에 어울리는 ${N(t)}을(를) 골라 입혀 보며 날씨와 옷차림의 관계에 관심을 가진다.`,
    prompts: () => [
      '오늘 같은 날씨엔 무엇을 입어야 할까요?',
      '왜 그 옷이 어울린다고 생각했어요?',
      '이 옷을 입고 밖에 나가면 어떨까요?',
      '다른 날씨였다면 무엇을 입을까요?',
    ],
    extension: () => '오늘 실제 날씨를 확인하고 등·하원 옷차림을 정해 본다.',
  },
  'shadow-quiz': {
    verb: '그림자 찾기',
    domains: ['자연탐구', '의사소통'],
    objective: (t) => `${N(t)}의 그림자(실루엣)만 보고 누구인지 알아맞혀 보며 형태의 특징에 관심을 가지고 관찰력을 기른다.`,
    prompts: (t) => [
      '이 그림자는 누구의 그림자일까요? 어떻게 알았어요?',
      `그림자를 보니 ${N(t)}의 어떤 부분이 보이나요?(귀·꼬리·목 등)`,
      '왜 다른 것은 아니라고 생각했어요?',
      '우리 몸으로도 그림자를 만들어 볼까요?',
    ],
    extension: (t) => `햇빛이나 손전등으로 실제 ${N(t)} 인형·손의 그림자를 만들어 맞혀 보는 그림자 놀이로 이어 한다.`,
  },
};

/** 어떤 메커니즘·주제든 '발문 포함' 교사 카드를 결정론으로 만든다(폴백·백필 공용). */
export function buildTeacherCard(
  mechanism: MechanismId,
  theme: string,
  title?: string,
  age: 3 | 4 | 5 = 4,
): TeacherCard {
  const p = MECH_CARD[mechanism] ?? MECH_CARD['tap-select'];
  const t = N(theme);
  return {
    title: title || `${t} ${p.verb}`,
    age,
    mechanism,
    objective: p.objective(theme),
    domains: p.domains,
    intro: `놀이 화면을 아이와 함께 보며 "무엇이 보이나요? 어떻게 노는 걸까요?" 하고 자유롭게 이야기를 연다.`,
    steps: [
      `화면을 같이 보며 ${t}와(과) 놀이 방법을 이야기한다.`,
      `아이가 직접 ${p.verb}을(를) 해 보도록 하고, 서두르지 않게 기다린다.`,
      '아래 발문으로 아이의 생각을 묻고 답을 충분히 들어 준다.',
      '다 하면 "어떻게 했는지" 말해 보게 하고 과정을 칭찬한다.',
    ],
    prompts: p.prompts(theme),
    extensions: [p.extension(theme), '오늘 놀이를 실제 사물·교실 활동으로 이어 본다.'],
    assessment: `${p.verb} 과정에서 아이가 스스로 생각하고 까닭을 말하는지, 즐겁게 참여하는지 관찰한다.`,
  };
}

/** 카드에 발문이 비어 있으면 메커니즘×주제 발문으로 채운다(에이전트·dress-up 카드 보강용). */
export function ensurePrompts(card: TeacherCard, theme: string): TeacherCard {
  if (card.prompts && card.prompts.length > 0) return card;
  return { ...card, prompts: (MECH_CARD[card.mechanism] ?? MECH_CARD['tap-select']).prompts(theme) };
}
