/**
 * Resolver — 그림자 퀴즈(shadow-quiz). "누구의 그림자일까?" 한 문제씩 푸는 시각 퀴즈.
 *
 * 한 화면에 '그림자(질문)' 하나가 가운데 위에 크게 + 아래에 선택지 3개 가로 배치.
 * 그림자와 맞는 선택지를 탭하면 → 칭찬 → 그 라운드 숨김 → 다음 라운드 공개(자동 진행).
 * 마지막 라운드까지 맞히면 완료 축하. 처음엔 1번 문제만 보이고 나머지는 시작 시 숨김.
 *
 * ★ 그림자 매칭: 질문(그림자)은 정답 이미지의 '실루엣'이다 — place.fillShadowImages 가 정답을 한 번
 *   그려 실루엣(그림자)과 원본을 함께 만들어, 그림자와 정답 그림이 정확히 일치한다(정답 선택지는 그림자와
 *   같은 라벨이라 원본을 공유). 그래서 아이가 형태만 보고도 짝을 찾을 수 있다.
 * ★ 엔진 무변경 — hide/reveal/count/animate/speak + when counter>=R 프리미티브 조합(dress-up 라운드 패턴).
 *
 * '선/줄로 연결·이어' 를 명시하면 pair-match(짝 잇기)로 라우팅된다(selectRecipe). 이 레시피는 기본형.
 * manualLayout=true — 그림자·선택지를 정밀 배치(autoLayout 이 역할 분류로 흩뜨리는 것 방지).
 */
import type { Behavior, ElementNode, InteractiveNode } from '../../schema/interactiveNode';
import type { Recipe, RecipeInput, RecipeItem, RecipeRound } from '../recipeTypes';
import {
  DEFAULT_INTRO,
  assembleNode,
  counter,
  imageEl,
  onAnimate,
  onCount,
  onHide,
  onReveal,
  onSpeak,
  rowTransforms,
  shadowImageEl,
  textEl,
  whenCounter,
} from '../assemble';

const CNT = 'cnt';
const WIN = 'win';
const TITLE = 'title';

/** items 풀(라벨 목록)에서 문제들을 파생 — 각 라운드 정답 1 + 오답 2(풀의 다른 항목, 결정론). */
function roundsFromItems(items: RecipeItem[], want: number): RecipeRound[] {
  const uniq = [...new Set(items.map((it) => it.label).filter(Boolean))];
  if (uniq.length < 2) return [];
  const R = Math.min(Math.max(3, want || uniq.length), uniq.length);
  return Array.from({ length: R }, (_, i) => {
    const answer = uniq[i];
    const others = uniq.filter((l) => l !== answer);
    // 오답 2개 — 정답 인덱스를 기준으로 순환 선택(라운드마다 조합이 바뀌게).
    const d1 = others[i % others.length];
    const d2 = others[(i + 1) % others.length];
    const distractors = d1 === d2 ? others.slice(0, 2) : [d1, d2];
    return { answer, distractors };
  });
}

function buildShadowQuiz(input: RecipeInput): InteractiveNode {
  const src = input.rounds && input.rounds.length ? input.rounds : roundsFromItems(input.items ?? [], 5);
  const rounds = src.filter((r) => r.answer && r.distractors.length >= 1);
  if (rounds.length < 2) throw new Error('shadow-quiz: 문제 2개 이상 필요(정답+오답 라벨)');
  const R = rounds.length;

  const qId = (r: number) => `q_${r}`; // 그림자(질문)
  const optId = (r: number, k: number) => `opt_${r}_${k}`; // 선택지

  // 질문(그림자) = 가운데 위 크게. 선택지 = 아래 가로줄(라운드마다 같은 자리, 하나만 보임).
  const QBOX = { x: 490, y: 96, w: 300, h: 300, z: 12 };
  const OPT_Y = 476;
  const OPT_SIZE = 200;

  // 라운드별 선택지 순서를 미리 정한다(요소·행동 두 루프가 동일 배열을 쓰게 — 발산 방지).
  const plan = rounds.map((rd, i) => {
    const opts: RecipeItem[] = [{ label: rd.answer, correct: true, speak: rd.speak }, ...rd.distractors.map((l) => ({ label: l }))];
    const n = opts.length;
    const rot = i % n; // 라운드마다 정답 위치를 회전(정답이 늘 첫 칸이 아니게)
    const ordered = Array.from({ length: n }, (_, k) => opts[(k + rot) % n]);
    const tfs = rowTransforms(n, { y: OPT_Y, size: OPT_SIZE, z: 8 });
    const ids = [qId(i + 1), ...ordered.map((_, k) => optId(i + 1, k + 1))];
    return { ordered, tfs, ids };
  });

  const elements: ElementNode[] = [textEl(TITLE, input.title, { x: 280, y: 26, w: 720, h: 64, z: 20 })];
  plan.forEach((p, i) => {
    const r = i + 1;
    elements.push(shadowImageEl(qId(r), rounds[i].answer, QBOX)); // 그림자 = 정답의 실루엣
    p.ordered.forEach((op, k) => elements.push(imageEl(optId(r, k + 1), op.label, p.tfs[k])));
  });
  elements.push(textEl(WIN, '잘했어요! 🎉', { x: 390, y: 250, w: 500, h: 110, z: 50 }));

  // 시작 — 첫 문제만 보이게(2번 이후 문제 + 승리 숨김) + 도입 안내.
  const hideStart = [WIN, ...plan.slice(1).flatMap((p) => p.ids)];
  const behaviors: Behavior[] = [
    onHide('hidestart', TITLE, 'sceneEnter', hideStart),
    onSpeak('intro', TITLE, 'sceneEnter', input.introText ?? DEFAULT_INTRO['shadow-quiz'], { delay: 600 }),
  ];

  plan.forEach((p, i) => {
    const r = i + 1;
    p.ordered.forEach((op, k) => {
      const id = optId(r, k + 1);
      const kk = k + 1;
      if (op.correct) {
        // 정답 — 세기 → 키우기 → 칭찬 → (이 문제 숨기고 다음 공개 / 마지막이면 완료).
        behaviors.push(onCount(`pick_${r}_${kk}`, id, 'tap', CNT, 1, { then: [`grow_${r}`] }));
        behaviors.push(onAnimate(`grow_${r}`, id, 'afterComplete', 'grow', { then: [`say_${r}`] }));
        behaviors.push(onSpeak(`say_${r}`, id, 'afterComplete', op.speak ?? '딩동댕! 바로 이 친구예요!', { then: [`adv_${r}`] }));
        if (r < R) {
          // 자동 진행 — 잠깐(0.8s) 칭찬을 보고 이 문제 숨김 → 다음 문제 공개.
          behaviors.push(onHide(`adv_${r}`, id, 'afterComplete', p.ids, { delay: 800, then: [`next_${r}`] }));
          behaviors.push(onReveal(`next_${r}`, qId(r + 1), 'afterComplete', plan[i + 1].ids));
        } else {
          // 마지막 문제 — 문제 숨김 → 완료 축하.
          behaviors.push(onHide(`adv_${r}`, id, 'afterComplete', p.ids, { delay: 800, then: ['showwin'] }));
        }
      } else {
        // 오답 — 흔들고 교정 한마디(그림자를 다시 잘 보게).
        behaviors.push(onAnimate(`no_${r}_${kk}`, id, 'tap', 'shake', { then: [`sayno_${r}_${kk}`] }));
        behaviors.push(onSpeak(`sayno_${r}_${kk}`, id, 'afterComplete', op.speak ?? input.wrongText ?? '앗, 그림자를 다시 잘 볼까요?'));
      }
    });
  });
  // 완료 — 모든 문제를 맞히면(counter>=R) 승리 노출 + 축하.
  behaviors.push(onReveal('showwin', WIN, 'afterComplete', [WIN], { when: whenCounter(CNT, R), then: ['winsay'] }));
  behaviors.push(onSpeak('winsay', WIN, 'afterComplete', input.winText ?? `우아, ${R}문제를 모두 맞혔어요! 참 잘했어요!`));

  return assembleNode(input, {
    elements,
    behaviors,
    counters: [counter(CNT, `문제 · 모두 ${R}개`, { x: 1070, y: 26 })],
  });
}

export const shadowQuiz: Recipe = { id: 'shadow-quiz', build: buildShadowQuiz, manualLayout: true };
