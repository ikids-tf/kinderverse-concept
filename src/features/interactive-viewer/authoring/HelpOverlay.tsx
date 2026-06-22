/**
 * 인터렉티브 노드 도움말 — 실전 활용(따라 만들기) 중심. 각 기능을 실제 유아 활동에 매핑한
 * 레시피를 단계별로 제공하고, 아래에 동작·트리거·연결·단축키 참고를 둔다.
 * 저작 크롬 → Milray 토큰. 풀스크린 오버레이 위 모달.
 */
import { Fragment } from 'react';
import { Icon, type IconName } from '@/lib/icons';

interface Props {
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-fg-2 shadow-sm">{children}</kbd>
);

/* 도움말 본문의 이모지를 본 UI와 동일한 심플 아이콘(@/lib/icons)으로 인라인 렌더한다. */
const EMOJI: Record<string, IconName> = {
  '📷': 'gallery', '🗂': 'folder', '⬛': 'square', '○': 'circle', '↩': 'undo', '↪': 'redo',
  '📖': 'book', '🧩': 'copy', '❔': 'help', '▶': 'play', '💬': 'message', '✨': 'sparkle',
  '🔄': 'repeat', '🙈': 'eyeOff', '👁': 'observation', '🌟': 'star', '🔢': 'hash', '🔌': 'toggle',
  '➡': 'arrowRight', '🎞': 'video', '👆': 'cursor', '✋': 'cursor', '🏫': 'present', '✅': 'check',
  '🧭': 'search', '🎒': 'sparkle', '📌': 'board',
};
const EMOJI_RE = new RegExp('(' + Object.keys(EMOJI).join('|') + ')', 'g');

/** 인라인 아이콘 — 글줄 안에서 텍스트와 함께. */
const II = ({ name }: { name: IconName }) => (
  <span className="mx-0.5 inline-flex translate-y-[2px] text-fg-2"><Icon name={name} size={13} /></span>
);

/** 문자열 안의 이모지를 아이콘으로 치환해 렌더(변형 셀렉터 ️ 무시). */
function ri(text: string): React.ReactNode {
  return text
    .replace(/️/g, '')
    .split(EMOJI_RE)
    .map((p, i) => (EMOJI[p] ? <II key={i} name={EMOJI[p]} /> : <Fragment key={i}>{p}</Fragment>));
}

/* ── 도구 위치 안내(레시피 따라가기 전에) ── */
const TOOL_MAP: Array<[string, string]> = [
  ['왼쪽 세로 레일', '📷 사진(파일) · 🗂 보관함 · 가 글자 · ⬛ 도형 · ○ 배경색 — 요소를 추가해요'],
  ['요소를 한 번 탭', '오른쪽에 그 요소 패널이 떠요 — 거기서 동작을 골라요'],
  ['오른쪽 패널', '‘탭하면…’ 동작 버튼들 · 동작을 고른 뒤 위쪽 ‘언제’로 트리거 변경 · ‘실행 조건’'],
  ['요소에 마우스 올리기', '양옆 동그라미(연결) · 그림이면 편집·다운로드·크게보기 버튼'],
  ['상단 막대', '↩↪ 실행취소 · 📖 이야기 · 🧩 묶어서 복제(여러 개 선택 시) · ❔ 도움말 · ▶ 재생'],
];

/* ── 실전 레시피 — 카테고리별 '따라 만들기'. 모든 단계는 실제 버튼·위치 순서대로. ── */
const RECIPE_GROUPS: Array<{ cat: string; note: string; items: Array<{ title: string; age?: string; steps: string[] }> }> = [
  {
    cat: '✨ AI로 한 번에 만들기 (프롬프트)',
    note: '보드 하단 프롬프트바에 한 줄이면 — 장면 배경·그림·배치·완료 버튼까지 갖춘 게임이 자동으로 만들어져요.',
    items: [
      {
        title: '세기·순서 게임',
        age: '수학적 탐구',
        steps: [
          '보드 프롬프트바에 “개구리가 연잎을 순서대로 눌러 숫자 세는 게임 만들어줘”',
          '잠시 기다리면 배경·캐릭터·연잎·숫자판·완료 버튼까지 자동 구성돼요',
          '▶ 재생 → 순서대로 탭하면 캐릭터가 콩콩 이동하며 세어요',
        ],
      },
      {
        title: '고르기(정답 찾기)',
        age: '의사소통·분별',
        steps: [
          '“여러 그림 중에서 과일만 찾아 누르는 게임 만들어줘”',
          '정답(과일)은 누르면 수거되고, 오답은 흔들흔들 — 다 찾으면 완료 화면',
        ],
      },
      {
        title: '분류 · 탐험/소리',
        age: '범주·자연탐구',
        steps: [
          '분류: “쓰레기를 종류별 통에 옮기는 분류 게임 만들어줘”',
          '탐험: “동물을 누르면 이름·소리를 들려주는 게임 만들어줘”',
        ],
      },
      {
        title: '만든 게임 프롬프트로 고치기',
        age: '부분 수정',
        steps: [
          '게임 노드 안에서 고칠 요소를 탭해 선택(없으면 전체) → 하단 프롬프트바',
          '“개구리를 더 크게”, “배경을 밤하늘로”, “토끼 그림 하나 더” 처럼 입력',
          'AI가 그 게임 맥락 안에서 그 부분만 고쳐요(나머지 동작·연결은 그대로)',
        ],
      },
    ],
  },
  {
    cat: '✅ 게임이 끝나면 (완료 화면)',
    note: '세기·순서를 끝내거나 정답을 다 찾으면, 재생 화면 아래에 버튼이 떠요.',
    items: [
      {
        title: '다시하기 · 종료',
        age: '재생 중',
        steps: [
          '다시하기 → 처음부터 다시 놀아요',
          '종료 → 인터랙티브 홈(지금까지 만든 놀이 모음)으로 가요',
        ],
      },
      {
        title: '✨ 확장 활동',
        age: '교사용',
        steps: [
          '확장 활동 → 보드가 오른쪽으로 넓어지면서',
          '이 놀이 주제로 이어갈 교사용 활동 카드(이야기 나누기·함께 해보기·가정 연계)가 자동으로 생겨요',
        ],
      },
    ],
  },
  {
    cat: '👆 탭하면 반응하는 카드',
    note: '가장 기본 — 아이가 탭하면 움직이거나 말해요.',
    items: [
      {
        title: '인사하는 토끼',
        age: '말·언어 · 만 3–5세',
        steps: [
          '왼쪽 레일 🗂 보관함(또는 📷)으로 토끼 그림을 넣어요',
          '토끼를 한 번 탭해 선택 → 오른쪽 ‘탭하면…’ 패널이 떠요',
          '💬 말하기 클릭 → 칸에 “안녕! 난 토끼야” 입력 → 적용',
          '상단 ▶ 재생 → 토끼를 탭하면 말풍선과 소리가 나와요',
        ],
      },
      {
        title: '통통 동물원',
        age: '신체·운동 · 만 3–4세',
        steps: [
          '🗂로 동물 그림 2~3개를 넣어요',
          '동물 하나 선택 → ✨ 반응 → ‘통통 튀기’ 고르기 (동물마다 반복)',
          '▶ 재생 → 동물을 탭할 때마다 깡총 뛰어요',
        ],
      },
      {
        title: '애벌레 → 나비 변신',
        age: '자연탐구 · 만 4–5세',
        steps: [
          '🗂로 애벌레 그림을 넣고 선택',
          '🔄 교체 클릭 → 바뀔 그림에서 나비 고르기',
          '▶ 재생 → 애벌레를 탭하면 나비로 변신!',
        ],
      },
    ],
  },
  {
    cat: '🙈 나타나고 사라지기',
    note: '숨기기/보이기 + ‘시작하면’으로 까꿍·발견 놀이.',
    items: [
      {
        title: '비눗방울 펑!',
        age: '신체·감각 · 만 3세',
        steps: [
          '⬛ 도형(또는 📷)으로 방울을 여러 개 넣어요',
          '방울 하나 선택 → 🙈 숨기기 → 목록에서 ‘자기 자신’ 체크 → 적용 (방울마다 반복)',
          '▶ 재생 → 방울을 탭하면 펑! 하고 사라져요',
        ],
      },
      {
        title: '선물 열기',
        age: '사회·정서 · 만 3–4세',
        steps: [
          '📷로 선물상자와, 그 안에 넣을 그림을 겹쳐 놓아요',
          '속 그림 선택 → 🙈 숨기기 → ‘자기 자신’ → 위 ‘언제’를 시작하면으로 (시작하면 숨어요)',
          '상자 선택 → 👁 보이기 → 속 그림 체크 (탭하면 나타나요)',
          '▶ 재생 → 상자를 탭하면 선물이 짠!',
        ],
      },
      {
        title: '까꿍 놀이',
        age: '영아·애착 · 만 3세',
        steps: [
          '친구 얼굴 그림과, 가릴 손 그림을 겹쳐 놓아요',
          '친구 선택 → 🙈 숨기기(자기) → ‘언제’를 시작하면으로',
          '손 선택 → 👁 보이기 → 친구 체크',
          '▶ 재생 → 손을 탭하면 “까꿍!” 친구가 나타나요',
        ],
      },
    ],
  },
  {
    cat: '🔢 수 세기 놀이',
    note: '탭할 때마다 좌상단 숫자 배지가 올라가요(공용 카운터).',
    items: [
      {
        title: '사과 세기',
        age: '수학적 탐구 · 만 4–5세',
        steps: [
          '🗂로 사과 그림을 5개 넣어요',
          '사과 하나 선택 → 🔢 세기 (사과 5개 모두 반복)',
          '▶ 재생 → 아이가 사과를 하나씩 탭하며 “하나, 둘…” 좌상단 숫자가 올라가요',
        ],
      },
      {
        title: '몇 마리일까?',
        age: '수학적 탐구 · 만 5세',
        steps: [
          '🗂로 동물들을 넣고 각각 선택 → 🔢 세기',
          '가 글자로 정답(예: “5마리!”)을 만들고 선택 → 🙈 숨기기(자기) → ‘언제’ 시작하면',
          '“확인” 글자/도형을 하나 만들어 👁 보이기 → 정답 글자 체크',
          '▶ 재생 → 동물을 다 센 뒤 ‘확인’을 탭하면 정답이 나와요',
        ],
      },
    ],
  },
  {
    cat: '🌟 골라보기 · 집중',
    note: '강조와 말하기로 “이건 무엇?” 활동.',
    items: [
      {
        title: '무슨 색일까',
        age: '예술·감각 · 만 3–4세',
        steps: [
          '⬛ 도형을 색깔별로 여러 개 넣어요 (왼쪽 ○ 배경색으로 캔버스 색도 조절)',
          '색 하나 선택 → 💬 말하기 → “빨강” 입력 (색마다 반복)',
          '▶ 재생 → 색을 탭하면 이름을 들려줘요 (한 번 더 강조하려면 🌟 강조 → 자기 자신)',
        ],
      },
      {
        title: '정답을 찾아요',
        age: '의사소통 · 만 4–5세',
        steps: [
          '🗂로 보기 그림 여러 개를 넣어요',
          '정답 그림만 선택 → ✨ 반응 → ‘통통 튀기’',
          '나머지 그림들 → 💬 말하기 → “다시 골라볼까?”',
          '▶ 재생 → 정답을 탭하면 통통, 오답은 “다시!”',
        ],
      },
    ],
  },
  {
    cat: '🔢 순서·패턴 (연결 + 순서대로 탭)',
    note: '연결로 ①②③ 순서를 정하면, 그 순서대로만 반응해요.',
    items: [
      {
        title: '1·2·3 순서 맞추기',
        age: '수학적 탐구 · 만 4–5세',
        steps: [
          '가 글자로 숫자 카드 1·2·3을 만들어요',
          '1에 마우스 올려 옆 동그라미를 2로 드래그, 다시 2→3 연결 (①②③ 번호가 붙어요)',
          '카드 하나 선택 → ✨ 반응 → 위 ‘언제’를 순서대로 탭으로 (세 카드 모두)',
          '▶ 재생 → 1→2→3 순서로 탭해야 반응(틀리면 흔들흔들)',
        ],
      },
      {
        title: '무지개 만들기',
        age: '예술·자연 · 만 5세',
        steps: [
          '⬛ 도형으로 무지개 색 조각을 만들고 색 순서대로 연결',
          '조각 선택 → 👁 보이기(다음 색) → ‘언제’ 순서대로 탭 (조각마다)',
          '▶ 재생 → 순서대로 탭하며 무지개를 완성해요',
        ],
      },
    ],
  },
  {
    cat: '✋ 끌어서 짝·분류 (연결 + 끌어서 잇기)',
    note: '요소를 연결한 상대 위로 끌어다 놓으면 정답!',
    items: [
      {
        title: '물고기를 어항에',
        age: '신체·인지 · 만 3–4세',
        steps: [
          '🗂로 물고기와 어항을 넣고, 물고기에 마우스 올려 동그라미를 어항으로 드래그(연결)',
          '물고기 선택 → ✨ 반응 → 위 ‘언제’를 끌어서 잇기로',
          '▶ 재생 → 물고기를 어항 위로 끌어다 놓으면 반응해요',
        ],
      },
      {
        title: '엄마와 아기 짝 찾기',
        age: '자연탐구 · 만 4–5세',
        steps: [
          '🗂로 아기동물·엄마동물을 넣고 짝끼리 연결',
          '아기동물 선택 → 💬 말하기 “찾았다!” → ‘언제’ 끌어서 잇기 (짝마다)',
          '▶ 재생 → 아기를 엄마 위로 끌어다 짝 맞추기',
        ],
      },
      {
        title: '분리수거 놀이',
        age: '사회·환경 · 만 5세',
        steps: [
          '🗂로 쓰레기 그림과 분리수거 통을 넣고, 쓰레기를 맞는 통에 연결',
          '쓰레기 선택 → 🙈 숨기기(자기) → ‘언제’ 끌어서 잇기',
          '▶ 재생 → 맞는 통에 끌어 넣으면 쏙 사라져요',
        ],
      },
    ],
  },
  {
    cat: '🔌 스위치·인과 (스위치 + 실행 조건)',
    note: '스위치를 켜야만 다른 게 동작해요 — 잠금·인과 놀이.',
    items: [
      {
        title: '열쇠로 문 열기',
        age: '문제해결 · 만 5세',
        steps: [
          '🗂로 열쇠와 문을 넣어요',
          '열쇠 선택 → 🔌 스위치',
          '문 선택 → ✨ 반응 → 동작 카드의 ‘실행 조건’을 “스위치 켜졌을 때만”으로',
          '▶ 재생 → 열쇠를 먼저 탭해야 문이 열려요',
        ],
      },
      {
        title: '불 켜기',
        age: '자연탐구 · 만 4–5세',
        steps: [
          '🗂로 스위치 그림과 전등(빛) 그림을 넣어요',
          '스위치 선택 → 🔌 스위치',
          '빛 선택 → 🙈 숨기기(자기)+‘언제’ 시작하면 / “켜기” 버튼엔 👁 보이기(빛)+실행 조건 스위치 ON',
          '▶ 재생 → 스위치를 켜야 불이 들어와요',
        ],
      },
    ],
  },
  {
    cat: '➡ 길 따라 이동 (연결 + 연결 따라 이동)',
    note: '연결한 곳까지 요소가 스르륵 이동해요.',
    items: [
      {
        title: '버스 출발!',
        age: '사회·교통 · 만 3–4세',
        steps: ['🗂로 버스와 정류장을 넣고 버스→정류장 연결', '버스 선택 → ➡ 연결 따라 이동', '▶ 재생 → 버스를 탭하면 정류장으로 가요'],
      },
      {
        title: '나비야 꽃으로',
        age: '자연탐구 · 만 3세',
        steps: ['🗂로 나비와 꽃을 넣고 나비→꽃 연결', '나비 선택 → ➡ 연결 따라 이동', '▶ 재생 → 나비를 탭하면 꽃까지 날아가요'],
      },
    ],
  },
  {
    cat: '📖 이야기 들려주기',
    note: '단계별 자막 + 소리로 한 장면씩 — 상단 📖 이야기.',
    items: [
      {
        title: '바다 여행 이야기',
        age: '문학·언어 · 만 4–5세',
        steps: [
          '바다 그림들을 넣어요',
          '상단 📖 이야기 열기 → ‘+ 단계 추가’로 한 줄씩 (“바닷속으로 가요” …)',
          '인트로를 넣고 싶으면 요소에 ✨ 반응 + ‘언제’ 시작하면',
          '▶ 재생 → 하단 자막과 소리로 ‘다음’을 눌러 장면을 넘겨요',
        ],
      },
      {
        title: '하루 일과 이야기',
        age: '생활·사회 · 만 3–5세',
        steps: [
          '아침·점심·저녁 그림을 넣어요',
          '📖 이야기에 장면별 글을 단계로 적어요',
          '강조할 그림은 ✨ 반응 + ‘언제’ 이야기 넘길 때',
          '▶ 재생 → ‘다음’으로 하루를 따라가요',
        ],
      },
    ],
  },
  {
    cat: '🏫 수업에서 바로 쓰기',
    note: '풀스크린 재생·슬라이드 자동 진행·빠른 복제.',
    items: [
      {
        title: '수업 모드로 같이 놀기',
        age: '대·소집단 활동',
        steps: ['보드에서 수업 모드를 켜요', '인터렉티브 카드를 탭하면 전체 화면으로 재생', '아이들과 큰 화면에서 함께 탭하며 놀아요'],
      },
      {
        title: '활동 끝나면 다음 장으로',
        age: '수업 흐름 자동화',
        steps: [
          '슬라이드 뷰어에서 레이아웃 → ‘인터렉티브’ → 만든 노드 고르기',
          '그 슬라이드의 ‘✅ 완료 시 자동 넘김’ 켜기',
          '아이가 이야기·순서 게임을 끝내면 저절로 다음 장으로 넘어가요',
        ],
      },
      {
        title: '같은 놀이 여러 개 빠르게',
        age: '준비 시간 절약',
        steps: ['한 세트(요소+동작+연결)를 완성해요', '여러 요소를 Shift+클릭으로 선택 → 상단 🧩 묶어서 복제', '동작·연결까지 통째로 복제 → 글자만 바꿔 다른 놀이로'],
      },
    ],
  },
];

const ACTIONS: Array<[string, string]> = [
  ['✨ 반응', '통통·점프·빙글 등 움직임'],
  ['🔄 교체', '탭하면 다른 그림으로(그림)'],
  ['💬 말하기', '말풍선 + 소리'],
  ['👁 보이기 / 🙈 숨기기', '다른(또는 자기) 요소 나타내기/감추기'],
  ['🌟 강조', '테두리로 반짝 강조'],
  ['🔢 세기', '탭마다 +1 (개수)'],
  ['🔌 스위치', '켜고 끄는 상태 — 실행 조건과 함께'],
  ['➡ 연결 따라 이동', '연결한 곳으로 이동'],
  ['🎞 영상 재생', '탭하면 영상 재생(영상)'],
];

const TRIGGERS: Array<[string, string]> = [
  ['탭하면', '탭했을 때(기본)'],
  ['시작하면 (자동)', '재생 시작 시 저절로 — 인트로·초기 숨기기'],
  ['순서대로 탭', '연결 순서(①②③)대로 탭해야'],
  ['끌어서 잇기', '연결한 상대 위로 끌어다 놓으면'],
  ['이야기 넘길 때', '이야기가 다음 장면으로 갈 때마다'],
];

const SHORTCUTS: Array<[React.ReactNode, string]> = [
  [<><Kbd>{MOD}</Kbd>+<Kbd>Z</Kbd></>, '실행취소'],
  [<><Kbd>{MOD}</Kbd>+<Kbd>⇧</Kbd>+<Kbd>Z</Kbd></>, '다시실행'],
  [<><Kbd>{MOD}</Kbd>+<Kbd>A</Kbd></>, '전체 선택'],
  [<><Kbd>{MOD}</Kbd>+<Kbd>C</Kbd>/<Kbd>V</Kbd></>, '복사/붙여넣기'],
  [<><Kbd>{MOD}</Kbd>+<Kbd>D</Kbd></>, '복제'],
  [<><Kbd>Delete</Kbd></>, '삭제'],
  [<><Kbd>방향키</Kbd></>, '이동(⇧ 크게)'],
  [<><Kbd>Esc</Kbd></>, '선택 해제'],
];

function Section({ icon, title, children }: { icon?: IconName; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="inline-flex items-center gap-1.5 text-sm font-extrabold text-fg">
        {icon && <Icon name={icon} size={15} />}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function HelpOverlay({ onClose }: Props) {
  return (
    <div className="absolute inset-0 z-[60] grid place-items-center p-4" style={{ background: 'rgba(20,19,17,.5)' }}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="inline-flex items-center gap-2 text-base font-extrabold text-fg"><Icon name="help" size={18} /> 인터렉티브 노드 — 따라 만들기</span>
          <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-fg-2 hover:border-accent hover:text-accent">
            <Icon name="x" size={15} /> 닫기
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          <Section title="빠른 시작 (3단계)">
            <p className="-mt-1 inline-flex items-start gap-1.5 rounded-lg bg-accent-soft/40 px-3 py-2 text-[12.5px] text-fg-2">
              <Icon name="sparkle" size={14} />
              <span>가장 빠른 길: 보드 프롬프트바에 <b className="text-fg">“○○ 게임 만들어줘”</b>라고 입력하면 배경·그림·배치까지 자동으로 완성돼요. 직접 만들려면 아래 3단계.</span>
            </p>
            <ol className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li>왼쪽 도구로 <b className="text-fg">사진·글자·도형</b>을 넣어요.</li>
              <li>요소를 <b className="text-fg">선택</b>하면 오른쪽 ‘탭하면…’에서 동작을 골라요(‘언제’로 트리거도 바꿔요).</li>
              <li><b className="inline-flex items-center gap-1 text-fg"><Icon name="play" size={13} /> 재생</b>으로 아이처럼 놀아 보며 확인해요.</li>
            </ol>
          </Section>

          {/* 도구 위치 안내 — 레시피의 버튼이 어디 있는지 먼저. */}
          <Section icon="search" title="도구는 어디에?">
            <div className="flex flex-col gap-1.5">
              {TOOL_MAP.map(([where, what]) => (
                <div key={where} className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[12.5px] text-fg-2 sm:flex-row sm:gap-2">
                  <b className="whitespace-nowrap text-fg">{where}</b>
                  <span>{ri(what)}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 실전 활용 레시피(중심) — 모든 단계가 실제 버튼·순서대로 ── */}
          <Section icon="sparkle" title="실전 활용 — 따라 만들기">
            <p className="-mt-1 text-[12px] text-fg-muted">{ri('맨 위 ✨ AI에게 한 줄로 시키거나, 아래 순서대로 버튼만 따라 눌러 손으로 만들어요. ▶ 재생으로 바로 확인!')}</p>
            <div className="flex flex-col gap-4">
              {RECIPE_GROUPS.map((g) => (
                <div key={g.cat} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2/60 p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-fg">{ri(g.cat)}</span>
                    <span className="text-[12px] text-fg-muted">{ri(g.note)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.items.map((it) => (
                      <div key={it.title} className="flex flex-col gap-1 rounded-xl border border-accent-soft bg-accent-soft/25 px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <b className="text-[13px] text-fg">{it.title}</b>
                          {it.age && <span className="whitespace-nowrap rounded-pill bg-surface px-2 py-0.5 text-[10px] font-semibold text-fg-muted">{it.age}</span>}
                        </div>
                        <ol className="ml-4 list-decimal text-[12.5px] leading-relaxed text-fg-2">
                          {it.steps.map((s, i) => (
                            <li key={i}>{ri(s)}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 기능 참고 ── */}
          <Section icon="sparkle" title="동작 한눈에">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ACTIONS.map(([name, desc]) => (
                <div key={name} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] text-fg-2">
                  <b className="inline-flex items-center gap-1 text-fg">{ri(name)}</b> — {desc}
                </div>
              ))}
            </div>
          </Section>

          <Section icon="cursor" title="트리거(언제 일어날까)">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {TRIGGERS.map(([name, desc]) => (
                <div key={name} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] text-fg-2">
                  <b className="text-fg">{name}</b> — {desc}
                </div>
              ))}
            </div>
            <p className="px-1 text-[12px] text-fg-muted">‘완료 후’ 트리거와 실행 조건(스위치)은 동작 카드에서 함께 설정해요.</p>
          </Section>

          <Section icon="link" title="연결 · 묶어서 복제">
            <ul className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li>요소에 마우스를 올리면 <b className="text-fg">양옆 동그라미(포트)</b> → 끌어서 다른 요소에 놓으면 연결(번호=순서).</li>
              <li>연결 동그라미를 빈 곳에 끌면 해제, 선을 클릭해도 해제.</li>
              <li>여러 개 선택 후 <b className="inline-flex items-center gap-1 text-fg"><Icon name="copy" size={13} /> 묶어서 복제</b> = 동작·연결까지 통째 복제.</li>
            </ul>
          </Section>

          <Section icon="settings" title="단축키">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {SHORTCUTS.map(([keys, desc], i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-fg-2">
                  <span className="flex items-center gap-1">{keys}</span>
                  <span className="text-fg-muted">·</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
