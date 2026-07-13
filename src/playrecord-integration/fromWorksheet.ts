// kinderverse 활동지(WorksheetCard) → verse 편집기 'half-drawing'(반쪽 그림 그리기) payload 변환 + 편집기 열기.
// 활동지 노드: data.role='worksheet', data.payload = { type:'WorksheetCard', props:{ title, theme?, topic?, instruction?, ... } }.
// 이미지는 AI 생성이 아니라 '주제와 관련된 기존 정적 에셋'(public/generated-assets/…)에서 불러온다.
import { useBoardStore, type BoardNode } from '@/store/boardStore';
import { worksheetTemplateId } from '@/ai/worksheet-reference';
import { spawnEditorCard } from './spawnEditorCard';

interface WorksheetProps { title?: string; theme?: string; topic?: string; instruction?: string; type?: string }
interface WorksheetPayload { type?: string; props?: WorksheetProps }

const isWorksheetNode = (n: BoardNode) =>
  n.data?.role === 'worksheet' || (n.data?.payload as WorksheetPayload | undefined)?.type === 'WorksheetCard';

/** 프레임(또는 그 자신)에서 활동지 노드를 찾는다. */
export function findWorksheetNode(frameOrNodeId: string): BoardNode | undefined {
  const nodes = useBoardStore.getState().nodes;
  const self = nodes[frameOrNodeId];
  if (self && isWorksheetNode(self)) return self;
  return Object.values(nodes).find((n) => n.data?.frameId === frameOrNodeId && isWorksheetNode(n));
}

/** 프레임/노드가 활동지를 담고 있는가(버튼 노출 판단용). */
export function frameHasWorksheet(frameId: string): boolean {
  return !!findWorksheetNode(frameId);
}

// ── 주제(테마)별 '반쪽 그림' 소재 세트 — 기존 정적 에셋 경로. 앞 4개(2×2)를 채운다.
//    미등록 주제는 빈 슬롯(placeholder)으로 두어 교사가 편집기에서 직접 채운다.
//    새 주제 추가 = 여기에 세트 + detectSubjects 매칭만 넣으면 됨(맵 기반, 확장형).
interface SubjectAsset {
  label: string;
  src: string;
  /** 화풍(생성 배치/폴더) 그룹 — 같은 style 끼리 화풍이 일치. 세트 선정 시 같은 style 우선. */
  style: string;
  /** 좌우 대칭 형태(정면형) — '반쪽 그림'에 적합. 반쪽 템플릿이 우선 선정. */
  symmetric?: boolean;
}

const A = '/generated-assets';
// 여름바다: topicweb-record·monthly-summer 는 동일한 3D 귀여운 화풍('sea3d') → 섞어도 화풍 일치.
//  대칭(문어·해파리·꽃게·불가사리) 을 앞에 둔다(반쪽 템플릿이 앞에서부터 고름).
const SUBJECT_SETS: Record<string, SubjectAsset[]> = {
  summer: [
    { label: '문어', src: `${A}/topicweb-record/octopus.png`, style: 'sea3d', symmetric: true },
    { label: '해파리', src: `${A}/monthly-summer/jellyfish.png`, style: 'sea3d', symmetric: true },
    { label: '꽃게', src: `${A}/topicweb-record/crab.png`, style: 'sea3d', symmetric: true },
    { label: '불가사리', src: `${A}/topicweb-record/starfish.png`, style: 'sea3d', symmetric: true },
    { label: '거북이', src: `${A}/topicweb-record/turtle.png`, style: 'sea3d' },
    { label: '해마', src: `${A}/topicweb-record/seahorse.png`, style: 'sea3d' },
    { label: '고래', src: `${A}/monthly-summer/whale.png`, style: 'sea3d' },
    { label: '상어', src: `${A}/monthly-summer/shark.png`, style: 'sea3d' },
  ],
  eco: [
    { label: '지구', src: `${A}/eco/01-earth.png`, style: 'eco', symmetric: true },
    { label: '새싹', src: `${A}/eco/02-kid-plant.png`, style: 'eco' },
    { label: '분리수거', src: `${A}/eco/03-recycle-bin.png`, style: 'eco' },
    { label: '자연', src: `${A}/eco/04-nature.png`, style: 'eco' },
  ],
};

/** 주제 텍스트 → 소재 세트(테마 감지, 미매칭은 빈 세트 → 빈 슬롯). */
function detectSubjects(text: string): SubjectAsset[] {
  if (/여름|바다|물놀이|모래|수박|해양/.test(text)) return SUBJECT_SETS.summer;
  if (/환경|지구|재활용|분리수거|자연보호|식물|텃밭|에너지/.test(text)) return SUBJECT_SETS.eco;
  return [];
}

/** 세트에서 count개 선정 — ① 같은 화풍(원소 최다 style) 우선 ② opts.symmetric 이면 대칭 우선(안정 정렬). */
function pickSubjects(text: string, count: number, opts?: { symmetric?: boolean }): SubjectAsset[] {
  const list = detectSubjects(text);
  if (!list.length) return [];
  const styles = [...new Set(list.map((s) => s.style))];
  const domStyle = styles.sort((a, b) => list.filter((s) => s.style === b).length - list.filter((s) => s.style === a).length)[0];
  let pool = list.filter((s) => s.style === domStyle);
  if (opts?.symmetric) pool = [...pool].sort((a, b) => (b.symmetric ? 1 : 0) - (a.symmetric ? 1 : 0)); // 대칭 우선(동점은 원순서)
  if (pool.length < count) pool = [...pool, ...list.filter((s) => s.style !== domStyle)]; // 부족분만 다른 화풍
  return pool.slice(0, count);
}

// ── 편집 디자인 템플릿 payload 빌더 레지스트리 (variant id → props→payload) ──
//    유형(reference)의 template 필드가 이 variant id 를 가리킨다(단일 진실원은 worksheet-reference).
//    새 유형 템플릿 추가 = 여기 빌더 1개 + worksheet-reference template 필드 + layouts.js 빌더/등록.
type TemplatePayloadBuilder = (props: WorksheetProps) => Record<string, unknown>;

/** '반쪽 그림 그리기'(half-drawing) — 2×2 카드 + 주제 에셋 이미지(반쪽 마스크). 대칭 이미지 우선. */
function buildHalfDrawingPayload(props: WorksheetProps): Record<string, unknown> {
  const themeText = `${props.theme || ''} ${props.topic || ''} ${props.title || ''}`;
  const set = pickSubjects(themeText, 4, { symmetric: true });
  const themeLabel = (props.theme || props.topic || '우리 주제').trim();
  const instruction = (props.instruction || '그림을 보고 나머지 반쪽을 상상해서 그려 보세요.').trim();
  const four = [0, 1, 2, 3].map((i) => set[i] || { label: '', src: '' });
  return {
    half_drawing: true,
    // 상단 태그 = "주제-유형". 제목은 활동명(소재 이미지는 주제 적응).
    header: { title: '반쪽 그림 그리기' },
    meta: { theme: themeLabel, tag: `${themeLabel}-반쪽그림` },
    introduction: { text: instruction },
    activities: four.map((s) => ({ title: s.label })),
    photos: four.map((s) => s.src || null),
  };
}

/** '수 세기'(counting, 난이도 상 4-5세) — A4 세로, 3행(라벨·N개 카운트박스·숫자 선택지) + 비교 질문. */
function buildCountingPayload(props: WorksheetProps): Record<string, unknown> {
  const themeText = `${props.theme || ''} ${props.topic || ''} ${props.title || ''}`;
  const picks = pickSubjects(themeText, 3); // 같은 화풍 3종
  const themeLabel = (props.theme || props.topic || '우리 주제').trim();
  const counts = [8, 11, 6]; // 4-5세 난이도 상 — 최소 1문제는 10 이상(11)
  const rows = [0, 1, 2].map((i) => {
    const p = picks[i] || { label: '', src: '' };
    const n = counts[i];
    const opts = [n, Math.max(2, n - 2), n + 1];
    const rot = opts.slice(i % 3).concat(opts.slice(0, i % 3)); // 행마다 순서 회전
    return { label: p.label, src: p.src || null, count: n, options: rot };
  });
  // 문제: picks[0](count 8) < picks[1](count 11) 이므로 '더 적을까요'가 맞다.
  const questions: string[] = [];
  if (picks[0] && picks[1]) questions.push(`${picks[0].label}는 ${picks[1].label}보다 몇 마리 더 적을까요?`);
  questions.push('가장 적은 수의 동물은 무엇일까요?');
  if (picks[1] && picks[2]) questions.push(`${picks[1].label}와 ${picks[2].label}는 모두 몇 마리일까요?`);
  return {
    counting: true,
    // 상단 태그 = "주제-유형". 소재는 주제에 맞춰 바뀐다(미매칭이면 교사가 채움).
    header: { title: '친구들 수세기' },
    meta: { theme: themeLabel, tag: `${themeLabel}-수세기` },
    introduction: { text: (props.instruction || '그림을 세어보고, 알맞은 숫자를 찾아 선으로 연결해요.').trim() },
    rows,
    questions,
  };
}

/** '그림자 짝짓기'(shadow-match) — 왼쪽 컬러 그림 ↔ 오른쪽 검은 그림자(실루엣) 잇기. */
function buildShadowMatchPayload(props: WorksheetProps): Record<string, unknown> {
  const themeText = `${props.theme || ''} ${props.topic || ''} ${props.title || ''}`;
  const picks = pickSubjects(themeText, 5); // 같은 화풍 5종
  const themeLabel = (props.theme || props.topic || '우리 주제').trim();
  return {
    shadow_match: true,
    header: { title: '그림자를 찾아요' },
    meta: { theme: themeLabel, tag: `${themeLabel}-그림자 짝짓기` },
    introduction: { text: (props.instruction || '같은 모양의 그림자를 찾아 선으로 이어 보아요.').trim() },
    items: picks.map((s) => ({ label: s.label, src: s.src })),
  };
}

/** '한글 쓰기'(hangul-writing) — 그림 + 낱말(주제 에셋 라벨)을 음절 칸에 따라쓰기. */
function buildHangulWritingPayload(props: WorksheetProps): Record<string, unknown> {
  const themeText = `${props.theme || ''} ${props.topic || ''} ${props.title || ''}`;
  const picks = pickSubjects(themeText, 4);
  const themeLabel = (props.theme || props.topic || '우리 주제').trim();
  return {
    hangul_writing: true,
    header: { title: `${themeLabel} 낱말을 알아요` },
    meta: { theme: themeLabel, tag: `${themeLabel}-한글쓰기` },
    introduction: { text: (props.instruction || '그림을 보고 낱말을 따라 써 보아요.').trim() },
    items: picks.map((s) => ({ label: s.label, src: s.src })),
  };
}

/** '머리띠 만들기'(headband) — 역할놀이 머리띠 도안(캐릭터 앞띠 + 오리는 옆띠). */
function buildHeadbandPayload(props: WorksheetProps): Record<string, unknown> {
  const themeText = `${props.theme || ''} ${props.topic || ''} ${props.title || ''}`;
  const picks = pickSubjects(themeText, 3);
  const themeLabel = (props.theme || props.topic || '우리 주제').trim();
  return {
    headband: true,
    meta: { theme: themeLabel, tag: `${themeLabel}-역할놀이 도안` },
    introduction: { text: (props.instruction || '오려서 머리띠를 만들어 역할놀이를 해요.').trim() },
    items: picks.map((s) => ({ label: s.label, src: s.src })),
  };
}

const TEMPLATE_PAYLOAD_BUILDERS: Record<string, TemplatePayloadBuilder> = {
  'half-drawing': buildHalfDrawingPayload,
  counting: buildCountingPayload,
  'shadow-match': buildShadowMatchPayload,
  'hangul-writing': buildHangulWritingPayload,
  headband: buildHeadbandPayload,
};

/** variant id + 활동지 props → DesignFrame 템플릿 payload (없으면 null).
 *  '생성 시점 편집디자인'(composer)과 '수동 편집디자인 만들기'(openWorksheetInEditor)가 공유한다.
 *  props.theme/topic/title 로 주제 리소스를 매칭한다(미지원 주제는 빈 슬롯 → 교사가 채움). */
export function buildWorksheetEditorPayload(
  variantId: string,
  props: WorksheetProps,
): Record<string, unknown> | null {
  const build = TEMPLATE_PAYLOAD_BUILDERS[variantId];
  return build ? build(props) : null;
}

/** 이 활동지 노드가 열 수 있는 편집 디자인 템플릿 variant id (없으면 undefined). 버튼 노출 판단용. */
export function worksheetVariantForNode(node: BoardNode): string | undefined {
  const props = (node.data?.payload as WorksheetPayload | undefined)?.props ?? {};
  const id = props.type ? worksheetTemplateId(props.type) : undefined;
  return id && TEMPLATE_PAYLOAD_BUILDERS[id] ? id : undefined;
}

/** 활동지 프레임/노드를 그 유형의 편집 디자인 템플릿으로 연다(유형에 template 이 있을 때만). */
export function openWorksheetInEditor(frameOrNodeId: string): void {
  const node = findWorksheetNode(frameOrNodeId);
  if (!node) return;
  const variantId = worksheetVariantForNode(node);
  if (!variantId) return;
  const props = (node.data?.payload as WorksheetPayload | undefined)?.props ?? {};
  spawnEditorCard(variantId, TEMPLATE_PAYLOAD_BUILDERS[variantId](props));
}
