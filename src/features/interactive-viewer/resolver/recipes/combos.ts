/**
 * Resolver — 조합 메커니즘(기존 프리미티브 배선, PROMPT 3).
 * 청사진: docs/resolver-handoff/SKILL.md (청사진 C + 유추표).
 *
 *  - tap-select   : 연결 없음. 정답 item tap → count + animate(grow) + 칭찬, 오답 shake + 교정 한마디.
 *                   완료 when counter>=K. 정답마다 found_k flag 가드(연타 조기 승리 차단 — memory-flip 패턴).
 *  - branch-choose: tap → setFlag + (정답)reveal 결과 + animate, (오답)speak. 분기 = flag 조건. goToScene 아님.
 *  - combine      : A pathTraverse→B → hide(B) + reveal(C) + count. (A+B→C)
 *
 * ★ swap 제약(조사): displaySrc(InteractiveStage.tsx:1222)는 swap.to.src 를 '그대로' 렌더하고
 *   fillTokenImages 는 behavior params 를 안 채운다 → swap.to 에 'gen:' 불가. 그래서 결과 비주얼은
 *   swap 대신 '미리 생성한 숨김 요소를 reveal' 로 만든다(같은 프리미티브, 누끼 이미지 사용 가능).
 *   memory-flip(짝 맞추기)은 페어링 상태가 엔진에 없어 보류(open question A).
 */
import type { Behavior, Connection, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput, RecipeItem } from '../recipeTypes';
import {
  DEFAULT_INTRO,
  assembleNode,
  conn,
  counter,
  flag,
  imageEl,
  onAnimate,
  onCount,
  onHide,
  onMove,
  onReveal,
  onSetFlag,
  onSpeak,
  rowTransforms,
  textEl,
  whenCounter,
  whenFlag,
} from '../assemble';

const CNT = 'cnt';
const WIN = 'win';
const TITLE = 'title';

const winText = (): ElementNode => textEl(WIN, '잘했어요! 🎉', { x: 390, y: 250, w: 500, h: 110, z: 50 });

/** 정답 인덱스 집합 — correct 플래그가 하나라도 있으면 그것만, 없으면 전체(모두 찾기). */
function correctSet(items: RecipeItem[]): Set<number> {
  const flagged = items.map((it, i) => (it.correct ? i : -1)).filter((i) => i >= 0);
  return new Set(flagged.length ? flagged : items.map((_, i) => i));
}

/* ════════════════ 청사진 C — tap-select (정답 고르기 / 찾기) ════════════════ */
function buildTapSelect(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('tap-select: items 2개 이상 필요');
  const correct = correctSet(items);
  const K = correct.size;
  const itemId = (k: number) => `item_${k}`;
  const itemTfs = rowTransforms(items.length);

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 360, y: 40, w: 560, h: 90, z: 20 }),
    ...items.map((it, i) => imageEl(itemId(i + 1), it.label, itemTfs[i])),
    winText(),
  ];

  const behaviors: Behavior[] = [
    onHide('hidewin', WIN, 'sceneEnter', [WIN]),
    // 도입 안내 — 놀이가 '어떻게 하는지'로 시작(대사 계약 introText, 없으면 결정론 기본).
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['tap-select'], { delay: 600 }),
  ];
  const flags: NonNullable<InteractiveNode['flags']> = [];
  items.forEach((it, i) => {
    const k = i + 1;
    if (correct.has(i)) {
      // 정답 — found 가드(memory-flip 패턴 복제): 아직 안 찾은 것만 세고 곧장 가드를 잠근다
      // (같은 정답 연타로 counter 가 부풀어 조기 승리하던 버그 차단. 재탭은 fireBehavior 의
      //  when 평가에서 무해하게 무시된다).
      flags.push(flag(`found_${k}`));
      behaviors.push(onCount(`tap_${k}`, itemId(k), 'tap', CNT, 1, { when: whenFlag(`found_${k}`, false), then: [`mark_${k}`] }));
      behaviors.push(onSetFlag(`mark_${k}`, itemId(k), 'afterComplete', `found_${k}`, true, { then: [`grow_${k}`] }));
      // 키우기(피드백) → 칭찬 한마디(항목 speak=칭찬 대사) → 완료 체크.
      behaviors.push(onAnimate(`grow_${k}`, itemId(k), 'afterComplete', 'grow', { then: [`good_${k}`] }));
      behaviors.push(onSpeak(`good_${k}`, itemId(k), 'afterComplete', it.speak ?? '딩동댕! 잘 찾았어요!', { then: ['showwin'] }));
    } else {
      // 오답 — 흔들기(세지 않음) 뒤 교정 한마디로 다독인다(항목 speak > 공통 wrongText > 기본).
      behaviors.push(onAnimate(`no_${k}`, itemId(k), 'tap', 'shake', { then: [`sayno_${k}`] }));
      behaviors.push(onSpeak(`sayno_${k}`, itemId(k), 'afterComplete', it.speak ?? input.wrongText ?? '앗, 그건 아니에요. 다시 잘 보고 찾아볼까요?'));
    }
  });
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, K), then: ['winsay'] }));
  // 완료 축하 — when 미충족이면 showwin 이 멈춰 winsay 도 안 나온다(fireBehavior 가 체인 중단).
  behaviors.push(onSpeak('winsay', WIN, 'afterComplete', input.winText ?? `와, ${K}개를 모두 찾았어요! 참 잘했어요!`));

  return assembleNode(input, {
    elements,
    behaviors,
    counters: [counter(CNT, `찾았어요 · 모두 ${K}개`, { x: 600, y: 36 })],
    flags,
  });
}

/* ════════════════ branch-choose (상황·표현 선택, 분기=flag) ════════════════
   정답 선택 → flag set → (결과 이미지 reveal) + animate + 승리. 오답 → speak(다시). swap/goToScene 미사용. */
function buildBranchChoose(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2) throw new Error('branch-choose: items(선택지) 2개 이상 필요');
  const correct = items.some((it) => it.correct) ? new Set(items.map((it, i) => (it.correct ? i : -1)).filter((i) => i >= 0)) : new Set([0]);
  const choiceId = (k: number) => `choice_${k}`;
  const hasResult = !!input.goalLabel;
  const FLAG = 'chosen';
  const RESULT = 'result';
  const choiceTfs = rowTransforms(items.length, { y: 520, size: 180 });

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 280, y: 40, w: 720, h: 100, z: 20 }),
    ...items.map((it, i) => imageEl(choiceId(i + 1), it.label, choiceTfs[i])),
    ...(hasResult ? [imageEl(RESULT, input.goalLabel as string, { x: 520, y: 250, w: 240, h: 240, z: 40 })] : []),
    winText(),
  ];

  // 시작 시 숨김 — 승리(+ 결과 이미지).
  const hideTargets = hasResult ? [WIN, RESULT] : [WIN];
  const behaviors: Behavior[] = [
    onHide('hidestart', WIN, 'sceneEnter', hideTargets),
    // 도입 안내 — 무엇을 고르는 놀이인지로 시작.
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['branch-choose'], { delay: 600 }),
  ];

  items.forEach((it, i) => {
    const k = i + 1;
    if (correct.has(i)) {
      behaviors.push(onSetFlag(`pick_${k}`, choiceId(k), 'tap', FLAG, true, { then: [`react_${k}`] }));
      behaviors.push(onAnimate(`react_${k}`, choiceId(k), 'afterComplete', 'bounce', { then: [hasResult ? 'showres' : 'winb'] }));
    } else {
      // 오답 — 항목별 교정 대사 > 공통 wrongText > 기본 문구.
      behaviors.push(onAnimate(`no_${k}`, choiceId(k), 'tap', 'shake', { then: [`say_${k}`] }));
      behaviors.push(onSpeak(`say_${k}`, choiceId(k), 'afterComplete', it.speak ?? input.wrongText ?? '다시 한번 잘 생각해서 골라 볼까요?'));
    }
  });
  if (hasResult) {
    behaviors.push(onReveal('showres', RESULT, 'afterComplete', [RESULT], { when: whenFlag(FLAG, true), then: ['winb'] }));
  }
  behaviors.push(onReveal('winb', WIN, 'afterComplete', [WIN], { when: whenFlag(FLAG, true), then: ['winsay'] }));
  // 완료 축하 — 정답을 골랐을 때만(winb 의 when 이 게이트).
  behaviors.push(onSpeak('winsay', WIN, 'afterComplete', input.winText ?? '참 잘 골랐어요! 멋져요!'));

  return assembleNode(input, { elements, behaviors, flags: [flag(FLAG)] });
}

/* ════════════════ combine (A + B → C) ════════════════
   A를 끌어(pathTraverse) B에 놓으면 → B 숨김 + C(결과) 노출 + 세기. swap 대신 숨김요소 reveal. */
function buildCombine(input: RecipeInput): InteractiveNode {
  const items = input.items ?? [];
  if (items.length < 2 || !input.goalLabel) throw new Error('combine: items 2개(A·B) + goalLabel(C) 필요');
  const A = 'a';
  const B = 'b';
  const C = 'c';

  const elements: ElementNode[] = [
    textEl(TITLE, input.title, { x: 360, y: 40, w: 560, h: 90, z: 20 }),
    imageEl(A, items[0].label, { x: 200, y: 540, w: 200, h: 200, z: 6 }),
    imageEl(B, items[1].label, { x: 820, y: 320, w: 200, h: 200, z: 4 }),
    imageEl(C, input.goalLabel, { x: 820, y: 320, w: 220, h: 220, z: 7 }), // 결과(숨김→노출)
    winText(),
  ];

  const connections: Connection[] = [conn('c_ab', 'path', A, B)];

  const behaviors: Behavior[] = [
    onHide('hidestart', WIN, 'sceneEnter', [WIN, C]),
    // 도입 안내 — 끌어서 합치는 놀이임을 알려 준다.
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO.combine, { delay: 600 }),
    // A를 B로 끌어다 놓으면 → 합쳐진다.
    onMove('moveA', A, 'pathTraverse', 'c_ab', 1, { then: ['merge'] }),
    onHide('merge', B, 'afterComplete', [A, B], { then: ['revealC'] }), // A·B 사라짐
    onReveal('revealC', C, 'afterComplete', [C], { then: ['countb'] }),
    onCount('countb', C, 'afterComplete', CNT, 1, { then: ['showwin'] }),
    onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, 1), then: ['winsay'] }),
    // 완료 축하 — 합쳐진 결과를 함께 기뻐한다.
    onSpeak('winsay', WIN, 'afterComplete', input.winText ?? `우와, 둘이 합쳐져서 ${input.goalLabel}이(가) 되었어요! 참 잘했어요!`),
  ];

  return assembleNode(input, { elements, connections, behaviors, counters: [counter(CNT)] });
}

export const tapSelect: Recipe = { id: 'tap-select', build: buildTapSelect };
export const branchChoose: Recipe = { id: 'branch-choose', build: buildBranchChoose };
export const combine: Recipe = { id: 'combine', build: buildCombine };
