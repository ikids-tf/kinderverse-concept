/**
 * 프롬프트 → 인터랙티브 노드 '전체 구성'(AI 게임 디렉터).
 *
 * applyPrompt(증분 편집)와 달리, 한 번의 프롬프트로 요소·연결·행동·카운터·스토리를
 * 갖춘 InteractiveNode '전체'를 만들어 논리 캔버스(1280×800)에 직접 배치한다.
 * 런타임(InteractiveStage/playNode)이 이미 구현한 기능만 조합한다(goToScene 제외).
 *
 * 흐름: 게이트웨이(task 'interactive-compose', mid→high, JSON) → 이미지 채우기(gen: 라벨→실제 그림)
 *   → 정규화(id/캔버스/메타 강제 + 좌표 클램프) → 스키마 검증 → 실패 시 1회 self-repair
 *   → store.mutate 로 교체(undo 가능). 검증/키 실패 시 노드 미변경.
 *
 * 규칙(CLAUDE §2~4): 에이전트는 JSON만 출력 → 스키마 검증 → 렌더. 그림은 task 'image'
 *   (generated, 외부 전송 허용). 교사 입력만 모델로 보낸다(아동 매체 미전송).
 */
import { callGateway } from '@/ai/client';
import { extractJson } from '@/ai/json';
import { useInteractiveStore } from '../store/interactiveStore';
import { safeParseInteractiveNode } from '../schema/parse';
import { clampXY } from '../runtime/geometry';
import { autoLayout } from './layout';
import { fillTokenImages, generateSceneBackground } from './artDirect';
import { saveActorSide } from '../store/actorPoses';
import type { InteractiveNode } from '../schema/interactiveNode';

export interface ComposeResult {
  ok: boolean;
  message: string;
}

const CANVAS = { w: 1280, h: 800 } as const;

/* ──────────────── 시스템 프롬프트(계약 + 규칙 + few-shot) ──────────────── */

const FEWSHOT = JSON.stringify({
  id: 'sample',
  title: '개구리 점프 세기',
  canvas: { background: 'pastel.mint', size: { w: 1280, h: 800 } },
  elements: [
    { id: 'title', kind: 'text', text: '연잎을 순서대로 콩콩 눌러요', origin: 'upload', assetKind: 'teacher-upload', transform: { x: 360, y: 60, w: 560, h: 90, rotation: 0, z: 1 } },
    { id: 'frog', kind: 'image', src: { id: 'a_frog', src: 'gen:귀여운 초록 개구리', assetKind: 'generated' }, origin: 'upload', assetKind: 'generated', transform: { x: 110, y: 300, w: 180, h: 180, rotation: 0, z: 5 } },
    { id: 'pad1', kind: 'image', src: { id: 'a_p1', src: 'gen:연잎', assetKind: 'generated' }, origin: 'upload', assetKind: 'generated', transform: { x: 120, y: 560, w: 170, h: 120, rotation: 0, z: 2 } },
    { id: 'pad2', kind: 'image', src: { id: 'a_p2', src: 'gen:연잎', assetKind: 'generated' }, origin: 'upload', assetKind: 'generated', transform: { x: 340, y: 560, w: 170, h: 120, rotation: 0, z: 2 } },
    { id: 'pad3', kind: 'image', src: { id: 'a_p3', src: 'gen:연잎', assetKind: 'generated' }, origin: 'upload', assetKind: 'generated', transform: { x: 560, y: 560, w: 170, h: 120, rotation: 0, z: 2 } },
    { id: 'pad4', kind: 'image', src: { id: 'a_p4', src: 'gen:연잎', assetKind: 'generated' }, origin: 'upload', assetKind: 'generated', transform: { x: 780, y: 560, w: 170, h: 120, rotation: 0, z: 2 } },
    { id: 'pad5', kind: 'image', src: { id: 'a_p5', src: 'gen:연잎', assetKind: 'generated' }, origin: 'upload', assetKind: 'generated', transform: { x: 1000, y: 560, w: 170, h: 120, rotation: 0, z: 2 } },
    { id: 'win', kind: 'text', text: '잘했어요! 다 셌어요 🎉', origin: 'upload', assetKind: 'teacher-upload', transform: { x: 390, y: 250, w: 500, h: 110, rotation: 0, z: 9 } },
  ],
  // 개구리→각 연잎 연결: 순서(연결 순번 라벨) + 개구리 이동(moveAlongPath)의 경로가 된다.
  connections: [
    { id: 'cf1', kind: 'order', from: 'frog', to: 'pad1' },
    { id: 'cf2', kind: 'order', from: 'frog', to: 'pad2' },
    { id: 'cf3', kind: 'order', from: 'frog', to: 'pad3' },
    { id: 'cf4', kind: 'order', from: 'frog', to: 'pad4' },
    { id: 'cf5', kind: 'order', from: 'frog', to: 'pad5' },
  ],
  behaviors: [
    { id: 'hidewin', target: 'win', trigger: 'sceneEnter', action: 'hide', params: { targets: ['win'] } },
    // 연잎 탭(순서대로) → 숫자 세기 → then 으로 개구리를 그 연잎으로 이동.
    { id: 'b1', target: 'pad1', trigger: 'sequenceTap', action: 'count', params: { counterId: 'cnt', by: 1 }, then: ['move1'] },
    { id: 'b2', target: 'pad2', trigger: 'sequenceTap', action: 'count', params: { counterId: 'cnt', by: 1 }, then: ['move2'] },
    { id: 'b3', target: 'pad3', trigger: 'sequenceTap', action: 'count', params: { counterId: 'cnt', by: 1 }, then: ['move3'] },
    { id: 'b4', target: 'pad4', trigger: 'sequenceTap', action: 'count', params: { counterId: 'cnt', by: 1 }, then: ['move4'] },
    { id: 'b5', target: 'pad5', trigger: 'sequenceTap', action: 'count', params: { counterId: 'cnt', by: 1 }, then: ['move5'] },
    // 개구리 이동(target=frog) — 연결(cfN)을 따라 해당 연잎으로 콩 이동 후, 마지막엔 완료 확인.
    { id: 'move1', target: 'frog', trigger: 'afterComplete', action: 'moveAlongPath', params: { connectionId: 'cf1', speed: 1 }, then: ['showwin'] },
    { id: 'move2', target: 'frog', trigger: 'afterComplete', action: 'moveAlongPath', params: { connectionId: 'cf2', speed: 1 }, then: ['showwin'] },
    { id: 'move3', target: 'frog', trigger: 'afterComplete', action: 'moveAlongPath', params: { connectionId: 'cf3', speed: 1 }, then: ['showwin'] },
    { id: 'move4', target: 'frog', trigger: 'afterComplete', action: 'moveAlongPath', params: { connectionId: 'cf4', speed: 1 }, then: ['showwin'] },
    { id: 'move5', target: 'frog', trigger: 'afterComplete', action: 'moveAlongPath', params: { connectionId: 'cf5', speed: 1 }, then: ['showwin'] },
    { id: 'showwin', target: 'win', trigger: 'afterComplete', action: 'reveal', params: { targets: ['win'] }, when: { kind: 'counter', counterId: 'cnt', op: '>=', value: 5 } },
  ],
  counters: [{ id: 'cnt', initial: 0, label: '세었어요', display: { x: 600, y: 36 } }],
  meta: { createdBy: 'teacher', safety: { containsChildAssets: false, reviewed: false }, version: 1 },
});

const SYSTEM = `너는 킨더버스 '인터랙티브 노드 디렉터'다. 유아 교사의 한국어 요청을 받아,
아이들이 바로 가지고 놀 수 있는 인터랙티브 게임 '한 개'를 완성된 JSON(InteractiveNode)으로 출력한다.
설명·마크다운 금지. JSON 객체 하나만 출력한다.

[좌표계] 논리 캔버스 1280×800. transform.x,y 는 요소의 '좌상단' 픽셀. 모든 요소는 캔버스 안에 두고
서로 겹치지 않게 배치한다. 가장자리 40px 여백. 또래가 누르기 쉽게 충분히 크게(터치 대상 ≥ 120px).

[요소(elements)] 각 요소는 {id, kind, transform{x,y,w,h,rotation:0,z}, origin:"upload", assetKind} 필수.
- kind:"text" → text:"글자" 추가. (assetKind:"teacher-upload")
- kind:"image" → src:{id, src:"gen:<대상>", assetKind:"generated"} 로 둔다. 실제 그림은 시스템이
  "gen:" 라벨을 보고 자동 생성한다. assetKind 도 "generated". (그림이 필요하면 반드시 이 형식.)
  · 라벨엔 '대상'만 간단히(예: gen:연잎, gen:사과). 그림체·흰배경·그림자 같은 말은 쓰지 마라 —
    시스템이 통일된 스타일과 배경제거(누끼)를 자동 적용한다.
  · 같은 종류 여러 개(연잎 5개 등)는 '모두 같은 라벨'을 쓴다(예: 5개 모두 gen:연잎).
    시스템이 각각 개별 생성하되 통일된 스타일로 일관되게 그린다(대상이 잘리지 않게 전체가 다 보이게).
  · ★ 수 세기·숫자 게임에서 '번호가 매겨진 아이템'은 각 라벨에 그 숫자를 넣어라(예: gen:1 적힌 도토리, gen:2 적힌 도토리 …
    같은 사물에 숫자만 다르게). 그러면 시스템이 그 아이템에 큰 숫자를 또렷이 그려 넣는다(별도 숫자 글자 요소 불필요).
- kind:"shape" → 단색 네모(배경/판). src 없음.
- 그림은 한 게임에 최대 8개.

[연결(connections)] {id, kind:"order"|"path"|"link", from:<요소id>, to:<요소id>}.
- 순서대로 눌러야 하는 게임은 요소들을 체인으로 잇는다(예: pad1→pad2→pad3…). 첫 요소가 1번, 따라가며 2,3…
  이 순번이 sequenceTap 차례가 된다.

[행동(behaviors)] {id, target:<요소id>, trigger, action, params, when?, then?, after?, delay?}. 한 행동 = 한 액션.
- trigger: "tap"(누르면) · "sequenceTap"(순서대로 누르면) · "pathTraverse"(연결 따라 끌면) ·
  "sceneEnter"(시작하자마자) · "storyAdvance"(이야기 넘길 때) · "afterComplete"(다른 행동 끝난 뒤·then으로 호출).
- action 과 params:
  · animate {preset} — preset: bounce|jump|wiggle|grow|spin|shake|float|fadeIn|fadeOut
  · speak {text, mode:"bubble"} — 말풍선+음성
  · count {counterId, by:1} — 카운터 증가(세기)
  · reveal|hide|highlight {targets:[요소id…]} — 보이기/숨기기/강조
  · swap {to:{id,src,assetKind}, mode:"image"} — 그림 바꾸기
  · moveAlongPath {connectionId, speed:1} — target(캐릭터)을 연결의 '상대 요소' 위치로 이동시켜 그대로 머무름
  · setFlag {flagId, value:true}
- when: {kind:"counter", counterId, op:">="|"=="|"<", value} 또는 {kind:"flag", flagId, is:true}. 조건 충족 때만 실행.
- then: 이 행동 직후 이어서 실행할 행동 id 목록(체이닝).
- ⚠ "goToScene" 는 쓰지 마라(미지원). 완료/축하는 'when counter>=N → reveal' 또는 speak 로 표현.

[상태] counters:[{id, initial:0, label?, display:{x,y}}] — display 좌표에 '큰 숫자판'으로 보인다(세기 게임 필수).
flags:[{id, initial:false}].

[스토리(선택)] story:{steps:[{id, speak:{text, mode:"narration"}}]} — 나레이션 단계.

[메타] meta:{createdBy:"teacher", safety:{containsChildAssets:false, reviewed:false}, version:1}.
canvas:{background:"pastel.cream"|"pastel.peach"|"pastel.mint"|"pastel.sky" 또는 "#rrggbb", size:{w:1280,h:800}}.

[배경] canvas.background 를 'pastel.X' 토큰으로 두면 시스템이 주제에 맞는 '장면 배경'을 자동 생성해 깐다.
최상위에 art:{background:"<배경 장면 설명 — 주제·계절 맥락을 살린 구체적이고 풍부한 장면(예: '가을 도토리 줍기'면 햇살 드는 가을 숲길, 바닥엔 낙엽과 나무 밑동의 풀더미·들꽃, 노랑·연두·주황이 어우러진 다양한 나무, 멀리 흐릿한 나무로 깊이감 — 한 색(빨강 등)으로 치우치지 않게), 빛과 그림자가 느껴지게, 밝고 예쁘게(어둡거나 칙칙 금지), 인물·글자 없이, 가운데 놀이 영역은 비움>"} 를 출력해 배경을 지정한다(권장). 배경은 그 위 아이템과 같은 화풍으로.
배경은 시스템이 처리하니 큰 배경 도형(shape)으로 화면을 덮지 마라.

[무결성] behavior.target / when.counterId / count.counterId / then 의 모든 id 는 실제로 존재해야 한다.
연결의 from/to 도 실제 요소여야 한다. id 는 게임 안에서 유일하게.

[캐릭터 이동] 개구리·동물 등 캐릭터가 탭한 대상으로 '이동'하게 하려면:
 1) 캐릭터→각 대상 연결을 만든다(connections, from=캐릭터, to=대상). 이 연결이 순번(순서)도 정한다.
 2) 각 대상의 탭 행동(then)으로 그 캐릭터의 moveAlongPath(connectionId=해당 연결)를 잇는다.
 → 탭하면 캐릭터가 그 대상 위로 콩 이동해 머문다. (연결선은 재생 화면엔 안 보이고 편집에서만 보인다.)

[캐릭터 왕복 이동(다녀오기)] 캐릭터가 탭한 대상으로 갔다가 '집(원위치)으로 돌아오게' 하려면
 (예: 벌이 꽃으로 날아가 꿀을 모으고 꿀단지로 돌아오기 / 다람쥐가 도토리로 갔다 나무로 복귀):
 1) 캐릭터→각 대상 연결에 더해, 캐릭터→'집'(돌아올 곳, 예: 꿀단지·둥지) 연결도 하나 만든다.
 2) 각 대상 tap → moveAlongPath(그 대상 연결) → then(원하면 중간에 speak/count) → then →
    moveAlongPath(집 연결) 로 잇는다.
 → moveAlongPath 는 '현재 위치에서' 다음 목적지로 이어 이동하므로, 두 번째 이동이 대상→집 복귀가 된다
   (돌아온 뒤 다음 대상을 탭하면 또 다녀온다). '집' 요소가 없으면 캐릭터 시작 자리가 곧 집이다.

[좋은 게임 설계] 요청 주제에 맞는 콘텐츠로, 도입(제목)+놀이(탭/순서/짝)+성공 피드백(reveal/speak/카운터)을 갖춘다.

[게임 유형별 패턴] 요청에 맞는 유형을 골라 아래 예시 구조로 만든다(검증된 동작만 사용).
· 세기/순서: sequenceTap+count+counter(display)+캐릭터 moveAlongPath, 승리 reveal(when counter>=N). (아래 예시)
· 고르기(정답 찾기): 정답 요소=tap→count(by:1)→then 자기 hide(수거 느낌). 오답 요소=tap→animate(shake)→then speak("아니야~", bubble).
  승리 텍스트는 sceneEnter로 숨기고, 각 hide의 then 으로 showwin(afterComplete·reveal 승리·when counter>=정답수) 을 호출한다.
· 분류(옮기기): 각 항목→올바른 분류함으로 connection. 항목 tap→moveAlongPath(그 connection)→then count. 다 옮기면 승리 reveal(when counter>=항목수).
· 탐험/소리: 각 요소 tap→speak("이름/소리", bubble)+then animate(bounce). 자유 탐색(원하면 모두 한 번씩 누르면 count로 승리).
· 숨바꼭질/추측(누구의 귀일까?·누굴까?·무슨 물건일까?): 최상위 flags 에 {id:"peek", initial:true} 를 넣는다(숨김 연출 ON).
  배경(art.background)은 풀밭·숲처럼 '숨을 곳'으로. 각 대상은 tap→animate{preset:"jump"}→then 으로 count/speak 등을 잇는다.
  시스템이 재생 때 대상 아랫부분을 풀 속에 잠긴 듯 가리고(윗부분만 보임) 흩어 배치하며, 탭하면 깡총 뛰어 전신이 드러난다.
  '정답 찾기'와 함께면 정답만 count, 다 찾으면 'when counter>=정답수 → reveal 승리'(완료 버튼).
※ 비순서(고르기·분류)도 '승리 reveal'(sceneEnter로 숨김 → when 으로 보이기)을 넣으면 완료로 인식돼 하단 완료 버튼이 뜬다.
※ 한 요소에 효과 두 개(세기+숨기기 등)는 then 으로 잇는다(한 동작=한 액션).

예시(개구리 순서 세기) — 이 구조와 배치를 참고하되, 요청 주제와 유형에 맞게 새로 만든다:
${FEWSHOT}`;

/* ──────────────── 게이트웨이 호출 ──────────────── */

interface RawNode {
  elements?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

/** 검증 전 강제 보정 — id/캔버스/메타 고정(스토어 키·좌표 규칙 일치 보장). 배경은 문자열(토큰)·객체(에셋) 모두 보존. */
function forceShape(raw: RawNode, docId: string, fallbackTitle: string): void {
  raw.id = docId;
  if (typeof raw.title !== 'string' || !raw.title.trim()) raw.title = (fallbackTitle || '').slice(0, 40) || '인터랙티브';
  const bgVal = raw.canvas && typeof raw.canvas === 'object' ? (raw.canvas as { background?: unknown }).background : undefined;
  let bg: unknown = 'pastel.cream';
  if (typeof bgVal === 'string' && bgVal.trim()) bg = bgVal;
  else if (bgVal && typeof bgVal === 'object') bg = bgVal; // 에셋(데이터 URI·KEEP 마커) 배경 보존
  raw.canvas = { background: bg, size: { w: CANVAS.w, h: CANVAS.h } };
  raw.meta = { createdBy: 'teacher', safety: { containsChildAssets: false, reviewed: false }, version: 1 };
  if (!Array.isArray(raw.elements)) raw.elements = [];
}

/** 배경이 '깨진 문자열'(생성 실패로 남은 "gen:.." 이나 토큰/헥스가 아닌 값)이면 파스텔로 폴백 —
    깨진 img 렌더 방지. 유효 배경: 'pastel.*'/'#hex' 문자열 또는 에셋 객체({src}). */
function normalizeBackground(node: InteractiveNode): InteractiveNode {
  const bg = node.canvas.background;
  if (typeof bg === 'string' && !/^(pastel\.|#)/.test(bg)) {
    return { ...node, canvas: { ...node.canvas, background: 'pastel.cream' } };
  }
  return node;
}

/** 검증 통과 노드 — 좌표를 캔버스 안으로 클램프(겹침은 못 막지만 화면 밖 이탈 방지). */
function clampNode(node: InteractiveNode): InteractiveNode {
  const cw = node.canvas.size.w;
  const ch = node.canvas.size.h;
  return {
    ...node,
    elements: node.elements.map((e) => {
      const t = e.transform;
      const { x, y } = clampXY(t.x, t.y, t.w, t.h, cw, ch);
      return x === t.x && y === t.y ? e : { ...e, transform: { ...t, x, y } };
    }),
  };
}

async function callCompose(
  prompt: string,
  repair?: { prevText: string; errors: string },
): Promise<string | null> {
  const messages = repair
    ? [
        { role: 'user' as const, content: `교사 요청: "${prompt}"` },
        { role: 'assistant' as const, content: repair.prevText },
        { role: 'user' as const, content: `직전 출력이 스키마를 위반했다(${repair.errors}). 설명 없이 올바른 JSON만 다시 출력하라.` },
      ]
    : [{ role: 'user' as const, content: `교사 요청: "${prompt}"\n위 요청에 맞는 인터랙티브 게임을 InteractiveNode JSON 하나로 만들어라.` }];
  const res = await callGateway({
    task: 'interactive-compose',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: SYSTEM,
    messages,
    meta: { kind: 'interactive_compose' },
    maxTokens: 4000,
  });
  if (!res.ok || res.mocked || !res.text) return null;
  return res.text;
}

/** LLM이 선택적으로 출력하는 art.background(배경 장면 설명) — 있으면 문자열, 없으면 null. */
function readArtBackground(raw: RawNode): string | null {
  const art = (raw as { art?: unknown }).art;
  if (art && typeof art === 'object') {
    const b = (art as { background?: unknown }).background;
    if (typeof b === 'string' && b.trim()) return b.trim();
  }
  return null;
}

/** 주인공(액터) 요소 id — moveAlongPath로 '이동'하지만 tap/sequenceTap 대상은 아닌 순수 이동 캐릭터.
    이 요소만 '정면' 자세로 생성한다(시작/끝 정지 상태에서 아이를 바라보게). 분류 게임의 이동 아이템은 제외. */
function actorFrontIds(raw: RawNode): Set<string> {
  const behs = Array.isArray((raw as { behaviors?: unknown }).behaviors)
    ? ((raw as { behaviors: Array<Record<string, unknown>> }).behaviors)
    : [];
  const moveT = new Set(behs.filter((b) => b.action === 'moveAlongPath').map((b) => String(b.target ?? '')));
  const tapT = new Set(
    behs.filter((b) => b.trigger === 'tap' || b.trigger === 'sequenceTap').map((b) => String(b.target ?? '')),
  );
  return new Set([...moveT].filter((id) => id && !tapT.has(id)));
}

/** 배경 요청 프롬프트에서 '장면 설명'을 추린다 — 생성/배경 관련 어휘를 걷어내고 남는 주제어.
    남는 게 없으면 게임 주제(title)로 폴백. 편집에서 LLM이 art.background 를 빠뜨렸을 때의 보조 경로. */
function sceneDescFromPrompt(prompt: string, title: string): string {
  const scene = prompt
    .replace(/배경화면|배경|바탕|이미지|그림|사진|장면|일러스트|으로|로|바꿔줘|바꿔|바꾸|만들어줘|만들어|만들|그려줘|그려|생성|해줘|깔아|넣어|줘|주세요/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return scene.length >= 2 ? scene : title || '장면';
}

/* ──────────────── 공개 진입점 ──────────────── */

export async function composeInteractiveNode(
  docId: string,
  prompt: string,
  onBusy?: (msg: string | null) => void,
): Promise<ComposeResult> {
  const store = useInteractiveStore.getState();
  store.ensure(docId); // 캐시 보장(mutate 대상)
  onBusy?.('AI가 게임을 구성하는 중…');
  try {
    // 1) 1차 생성
    let text = await callCompose(prompt);
    if (text === null) {
      return { ok: false, message: 'AI를 사용할 수 없어요 (키 설정 필요)' };
    }

    // 2) 파싱 → 이미지 채우기 → 강제 보정 → 스키마 검증 (실패 시 1회 self-repair)
    const buildNode = async (rawText: string): Promise<InteractiveNode | null> => {
      let raw: RawNode;
      try {
        raw = extractJson(rawText) as RawNode;
      } catch {
        return null;
      }
      const artBg = readArtBackground(raw);
      delete (raw as { art?: unknown }).art;
      forceShape(raw, docId, prompt);
      const theme = String(raw.title || prompt || '').slice(0, 40); // 라이브러리 태깅(주제축)
      // 배경(장면) 생성은 토큰 그림과 '병렬'로 — 색 토큰 배경이면 끝에서 교체.
      const bgPromise = generateSceneBackground(artBg || theme, theme);
      await fillTokenImages(raw, {
        onBusy,
        theme,
        frontIds: actorFrontIds(raw),
        onActorSide: (elId, uri) => saveActorSide(docId, elId, uri),
      });
      const parsed = safeParseInteractiveNode(raw);
      if (!parsed.success) return null;
      let node = autoLayout(parsed.data);
      if (typeof node.canvas.background === 'string') {
        onBusy?.('배경을 그리는 중…');
        const bgRef = await bgPromise;
        if (bgRef) node = { ...node, canvas: { ...node.canvas, background: bgRef } };
      }
      return node;
    };

    let node = await buildNode(text);
    if (!node) {
      // self-repair: 스키마 오류를 되먹여 1회 재시도
      const raw0 = (() => { try { return extractJson(text!) as RawNode; } catch { return null; } })();
      let errs = '구문/스키마 오류';
      if (raw0) {
        forceShape(raw0, docId, prompt);
        const p = safeParseInteractiveNode(raw0);
        if (!p.success) errs = p.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      }
      onBusy?.('AI가 게임을 다듬는 중…');
      text = await callCompose(prompt, { prevText: text, errors: errs });
      if (text) node = await buildNode(text);
    }

    if (!node) {
      return { ok: false, message: '게임을 만들지 못했어요 — 조금 더 구체적으로 말씀해 주세요' };
    }

    // 3) 좌표 클램프 + 배경 정규화 후 교체(undo 가능)
    const finalNode = clampNode(normalizeBackground(node));
    onBusy?.('적용하는 중…');
    store.mutate(docId, () => finalNode);

    const n = finalNode.elements.length;
    return { ok: true, message: `'${finalNode.title}' 게임을 만들었어요 (요소 ${n}개)` };
  } finally {
    onBusy?.(null);
  }
}

/* ──────────────── 맥락 인지 편집(현재 노드 전체를 보고 지시대로 최소 수정) ──────────────── */

const KEEP = '__KEEP__';
const KEEP_BG = '__KEEP_BG__';

/** LLM에 보낼 안전 버전 — 이미지/영상 data URI를 마커로 치환(토큰 폭주 방지). 구조만 보낸다. */
function toSafeDoc(doc: InteractiveNode): unknown {
  const clone = JSON.parse(JSON.stringify(doc)) as { elements?: Array<Record<string, unknown>>; canvas?: { background?: unknown } };
  for (const el of Array.isArray(clone.elements) ? clone.elements : []) {
    if ((el.kind === 'image' || el.kind === 'video' || el.kind === 'sprite') && el.src && typeof el.src === 'object') {
      const s = el.src as { id?: unknown; assetKind?: unknown };
      el.src = { id: s.id, src: KEEP, assetKind: s.assetKind };
    }
  }
  if (clone.canvas && clone.canvas.background && typeof clone.canvas.background === 'object') {
    clone.canvas.background = { ...(clone.canvas.background as object), src: KEEP_BG };
  }
  return clone;
}

/** 편집 결과의 이미지 복원 — KEEP 마커는 원본 그림 유지("gen:"은 fillImages가 새로 생성). */
function restoreImages(raw: RawNode, orig: InteractiveNode): void {
  const byId = new Map(orig.elements.map((e) => [e.id, e] as const));
  for (const el of Array.isArray(raw.elements) ? raw.elements : []) {
    if (el.kind !== 'image' && el.kind !== 'video' && el.kind !== 'sprite') continue;
    const sv = el.src as unknown;
    const isKeep = sv === KEEP || (!!sv && typeof sv === 'object' && (sv as { src?: unknown }).src === KEEP);
    if (!isKeep) continue;
    const o = byId.get(el.id as string) as { src?: unknown } | undefined;
    if (o && o.src) el.src = o.src; // 원본 그림 복원
    else { el.kind = 'shape'; delete el.src; }
  }
  const canvas = (raw as { canvas?: { background?: unknown } }).canvas;
  const bg = canvas?.background as { src?: unknown } | undefined;
  if (bg && typeof bg === 'object' && bg.src === KEEP_BG && typeof orig.canvas.background === 'object') {
    canvas!.background = orig.canvas.background;
  }
}

const EDIT_SYSTEM = `너는 킨더버스 '인터랙티브 노드 에디터'다. '현재 노드'(InteractiveNode JSON)와 교사의 수정 지시가 주어진다.
지시대로 수정한 '전체 노드'를 JSON 하나로만 출력한다. 설명·마크다운 금지.

[원칙]
- 기존 요소·동작·연결·카운터의 id 를 그대로 유지하고, 지시와 무관한 부분은 절대 바꾸지 않는다(보존). 지시와 무관하면 현재 노드를 거의 그대로 출력한다.
- 선택된 요소가 있으면 그 요소를 우선 대상으로 한다.
- 이미지 요소의 src.src 가 "${KEEP}" 이면 기존 그림 그대로 둔다(절대 바꾸지 마라). 새 그림이 필요할 때만 src.src 를 "gen:<한글 설명>" 으로.
- 좌표는 논리 캔버스 1280×800(좌상단 기준), 요소 겹침 금지, 캔버스 안.

[배경] 교사가 '장면·그림 배경'을 새로(또는 다른 장면으로) 만들어 달라고 하면(예: "배경 이미지 만들어줘", "숲 배경", "바다 배경으로 바꿔줘"):
- canvas.background 는 "${KEEP_BG}" 그대로 두고, 최상위에 art:{background:"<배경 장면 설명 — 주제·계절 맥락을 살린 구체적이고 풍부한 장면(빛·그림자·깊이감, 바닥·환경 디테일까지), 밝고 예쁘게(어둡거나 칙칙·음침 금지), 인물·캐릭터·동물·글자 없이, 가운데를 비운 풀블리드>"} 를 출력하라. 시스템이 그 설명으로 장면 배경을 생성해 깐다(큰 배경 도형으로 화면을 덮지 마라).
- '배경 색'만 바꾸라는 요청(예: "배경 하늘색", "배경 크림색으로")이면 art 를 쓰지 말고 canvas.background 를 'pastel.cream'|'pastel.peach'|'pastel.mint'|'pastel.sky' 또는 '#rrggbb' 로 바꿔라.
- 배경 관련 지시가 없으면 canvas.background 는 "${KEEP_BG}" 그대로 두고 art 는 출력하지 마라(배경 보존).

[동작(behaviors) — 맥락을 이해해 고친다. 기존 체인을 함부로 끊지 마라]
- 한 동작 = 한 액션({id,target,trigger,action,params,when?,then?}). 여러 효과는 then(이어 실행)으로 잇는다.
- trigger: tap·sequenceTap·sceneEnter·afterComplete 등. action: animate{preset}·moveAlongPath{connectionId,speed}·count{counterId,by}·speak{text,mode}·reveal|hide|highlight{targets}·setFlag.
- 캐릭터(개구리 등)가 '이동'하는 게임엔 그 캐릭터 target 의 moveAlongPath 동작들이 있다(연결을 따라 대상으로 이동).
  · moveAlongPath 는 이미 '점프(위로 솟는 호)' 모션으로 이동한다. "점프로 이동" 같은 지시면 moveAlongPath 를 '그대로 두면' 된다 — 지우거나 tap-animate 로 대체하지 마라.
  · 이동을 없애지 말고 속도(speed)·대상 정도만 최소 수정한다.
- 같은 target 의 다른 동작(이동·말하기·세기 등)을 삭제하지 마라. 한 요소를 고치려고 그 요소의 기존 동작을 통째로 지우면 안 된다.
- 왕복 이동(다녀오기) — "탭한 곳으로 갔다가 (집/원위치/꿀단지/둥지 등)로 돌아오게" 같은 요청이면:
  ① 돌아올 '집' 요소(예: 꿀단지)를 고르고, 캐릭터→그 집 연결을 connections 에 추가한다(이미 있으면 재사용).
  ② 각 대상의 이동(moveAlongPath) 동작 뒤에 then 으로 그 '집 연결'의 moveAlongPath 를 한 번 더 잇는다.
  moveAlongPath 는 현재 위치에서 이어 이동하므로 대상→집 복귀가 된다. 기존 이동·동작은 지우지 말고 '복귀 한 단계'만 더한다.
  · 집 역할 요소가 없으면(예: 꿀단지 그림이 없으면) gen:꿀단지 이미지 요소를 하나 추가해 그 자리로 돌아오게 한다.`;

async function callEdit(
  safeDocJson: string,
  prompt: string,
  selInfo: string,
  repair?: { prevText: string; errors: string },
): Promise<string | null> {
  const base = `현재 노드:\n${safeDocJson}\n\n교사 지시: "${prompt}"\n${selInfo}\n위 지시대로 수정한 전체 노드 JSON 하나만 출력.`;
  const messages = repair
    ? [
        { role: 'user' as const, content: base },
        { role: 'assistant' as const, content: repair.prevText },
        { role: 'user' as const, content: `직전 출력이 스키마를 위반했다(${repair.errors}). 설명 없이 올바른 JSON만 다시 출력하라.` },
      ]
    : [{ role: 'user' as const, content: base }];
  const res = await callGateway({
    task: 'interactive-edit',
    tier: 'mid',
    provider: 'auto',
    responseFormat: 'json',
    fallback: ['high'],
    system: EDIT_SYSTEM,
    messages,
    meta: { kind: 'interactive_edit' },
    maxTokens: 6000,
  });
  if (!res.ok || res.mocked || !res.text) return null;
  return res.text;
}

export async function editInteractiveNode(
  docId: string,
  prompt: string,
  selectedElIds: string[],
  onBusy?: (msg: string | null) => void,
): Promise<ComposeResult> {
  const store = useInteractiveStore.getState();
  const doc = store.peek(docId) ?? store.ensure(docId);
  onBusy?.('AI가 노드를 고치는 중…');
  // 교사가 '장면 그림 배경'을 요청했는지(단색 변경이 아니라) — LLM이 art.background 를 빠뜨려도
  // 폴백으로 장면 배경을 생성한다. "배경 하늘색" 같은 단색 변경은 매칭하지 않는다(색 토큰으로 처리).
  const wantsBgImage =
    /배경\s*(이미지|그림|장면|일러스트|사진)|(그림|장면)\s*배경|배경\s*(을|를)?\s*(그려|만들어|만들|생성|꾸며|깔아|바꿔|바꾸)/.test(prompt);
  try {
    const safeJson = JSON.stringify(toSafeDoc(doc));
    const selInfo = selectedElIds.length
      ? `선택된 요소 id: ${selectedElIds.join(', ')}`
      : '선택된 요소 없음(노드 전체 맥락)';

    const build = async (rawText: string): Promise<InteractiveNode | null> => {
      let raw: RawNode;
      try { raw = extractJson(rawText) as RawNode; } catch { return null; }
      // 배경(장면 그림) 생성 — LLM이 art.background 를 줬거나(우선), 교사가 배경 이미지를 요청했을 때.
      // 토큰 그림과 '병렬'로 생성한다. (단색 배경 변경은 canvas.background 토큰으로 처리되어 여기 안 탐.)
      const artBg = readArtBackground(raw);
      delete (raw as { art?: unknown }).art;
      const bgDesc = artBg ?? (wantsBgImage ? sceneDescFromPrompt(prompt, doc.title) : null);
      let bgPromise: ReturnType<typeof generateSceneBackground> | null = null;
      if (bgDesc) bgPromise = generateSceneBackground(bgDesc, doc.title);
      forceShape(raw, docId, doc.title);
      restoreImages(raw, doc);   // KEEP → 원본 그림 복원(배경 포함)
      await fillTokenImages(raw, {
        onBusy,
        theme: doc.title,
        frontIds: actorFrontIds(raw),
        onActorSide: (elId, uri) => saveActorSide(docId, elId, uri),
      }); // "gen:" → 새 그림(주인공=정면+측면 2포즈, 누끼)
      const parsed = safeParseInteractiveNode(raw);
      if (!parsed.success) return null;
      let node = parsed.data;
      if (bgPromise) {
        onBusy?.('배경을 그리는 중…');
        const bgRef = await bgPromise;
        if (bgRef) node = { ...node, canvas: { ...node.canvas, background: bgRef } };
      }
      return node;
    };

    let text = await callEdit(safeJson, prompt, selInfo);
    if (text === null) return { ok: false, message: 'AI를 사용할 수 없어요 (키 설정 필요)' };
    let node = await build(text);
    if (!node) {
      // self-repair: 스키마 오류 되먹여 1회 재시도
      const raw0 = (() => { try { return extractJson(text!) as RawNode; } catch { return null; } })();
      let errs = '구문/스키마 오류';
      if (raw0) {
        forceShape(raw0, docId, doc.title);
        restoreImages(raw0, doc);
        const p = safeParseInteractiveNode(raw0);
        if (!p.success) errs = p.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      }
      onBusy?.('AI가 다시 다듬는 중…');
      text = await callEdit(safeJson, prompt, selInfo, { prevText: text, errors: errs });
      if (text) node = await build(text);
    }
    if (!node) return { ok: false, message: '수정을 적용하지 못했어요 — 더 구체적으로 말씀해 주세요' };

    // 레이아웃 보존 — 위치/크기 지시가 아니면 기존 요소의 transform 을 원래대로 유지(무관한 이동·리사이즈 드리프트 방지).
    const LAYOUT_RE = /크게|작게|크기|사이즈|옮겨|옮길|위치|정렬|배치|줄여|키워|넓게|좁게|move|resize|size|bigger|smaller|position/i;
    let result = node;
    if (!LAYOUT_RE.test(prompt)) {
      const origById = new Map(doc.elements.map((e) => [e.id, e] as const));
      result = {
        ...node,
        elements: node.elements.map((e) => {
          const o = origById.get(e.id);
          return o ? { ...e, transform: o.transform } : e; // 기존 요소는 원래 위치/크기 유지, 새 요소만 LLM 좌표
        }),
      };
    }

    const finalNode = clampNode(normalizeBackground(result));
    onBusy?.('적용하는 중…');
    store.mutate(docId, () => finalNode);
    return { ok: true, message: '수정했어요' };
  } finally {
    onBusy?.(null);
  }
}
