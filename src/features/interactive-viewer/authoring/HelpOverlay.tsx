/**
 * 인터렉티브 노드 도움말 — 실전 활용(따라 만들기) 중심. 각 기능을 실제 유아 활동에 매핑한
 * 레시피를 단계별로 제공하고, 아래에 동작·트리거·연결·단축키 참고를 둔다.
 * 저작 크롬 → Milray 토큰. 풀스크린 오버레이 위 모달.
 */
interface Props {
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-fg-2 shadow-sm">{children}</kbd>
);

/* ── 실전 레시피 — 카테고리별로 '따라 만들기' 단계 ── */
const RECIPE_GROUPS: Array<{ cat: string; note: string; items: Array<{ title: string; steps: string[] }> }> = [
  {
    cat: '👆 탭하면 반응하는 카드',
    note: '가장 기본 — 아이가 탭하면 움직이거나 말해요.',
    items: [
      { title: '인사하는 친구', steps: ['그림(또는 도형)을 넣어요', '선택 → 💬 말하기 → “안녕! 난 토끼야”', '▶ 재생에서 친구를 탭'] },
      { title: '통통 동물원', steps: ['동물 그림 여러 개를 넣어요', '각 동물 선택 → ✨ 반응 → 통통 튀기/점프', '탭할 때마다 깡총!'] },
      { title: '애벌레 → 나비 변신', steps: ['애벌레 그림을 넣어요', '선택 → 🔄 교체 → 나비 그림 고르기', '탭하면 변신해요'] },
    ],
  },
  {
    cat: '🙈 나타나고 사라지기',
    note: '숨기기/보이기 + ‘시작하면’으로 까꿍·발견 놀이.',
    items: [
      { title: '비눗방울 터뜨리기', steps: ['비눗방울 그림 여러 개를 넣어요', '각각 선택 → 🙈 숨기기 → 자기 자신 고르기', '탭하면 펑! 하고 사라져요'] },
      { title: '선물 열기', steps: ['선물상자와 그 안에 들어갈 그림을 겹쳐 놓아요', '속 그림 선택 → ‘언제’를 시작하면 + 🙈 숨기기 → 자기 자신 (시작하면 숨어요)', '상자 선택 → 탭하면 + 👁 보이기 → 속 그림 (상자 탭하면 짠!)'] },
      { title: '까꿍 놀이', steps: ['친구 그림과 가릴 손 그림을 겹쳐요', '친구 선택 → 시작하면 + 🙈 숨기기 → 자기 자신', '손 선택 → 탭하면 + 👁 보이기 → 친구'] },
    ],
  },
  {
    cat: '🔢 수 세기 놀이',
    note: '탭할 때마다 숫자가 올라가요(공용 카운터).',
    items: [
      { title: '사과 세기', steps: ['사과 그림 여러 개를 넣어요', '각 사과 선택 → 🔢 세기', '아이가 사과를 하나씩 탭하며 수를 세요'] },
      { title: '몇 마리일까?', steps: ['동물들을 넣고 각각 🔢 세기', '정답 글자(예: “5마리!”)는 시작하면 + 🙈 숨기기(자기)', '세기 끝나고 정답 글자를 보이게 한 버튼으로 확인'] },
    ],
  },
  {
    cat: '🌟 골라보기 · 집중',
    note: '강조와 말하기로 “이건 무엇?” 활동.',
    items: [
      { title: '무슨 색일까', steps: ['색 도형들을 넣어요', '각 색 선택 → 💬 말하기 → “빨강”/“노랑”…', '탭하면 색 이름을 들려줘요 (강조를 쓰려면 🌟 강조 + 대상=자기)'] },
      { title: '정답을 찾아요', steps: ['보기 그림 여러 개를 넣어요', '정답만 선택 → ✨ 반응(통통)', '나머지는 💬 말하기 → “다시 골라볼까?”'] },
    ],
  },
  {
    cat: '🔢 순서·패턴 (연결 + 순서대로 탭)',
    note: '연결로 ①②③ 순서를 정하고, 그 순서대로만 반응.',
    items: [
      { title: '1·2·3 순서 맞추기', steps: ['숫자 카드(1·2·3)를 넣고 호버 → 동그라미로 1→2→3 연결', '각 카드 선택 → ‘언제’를 순서대로 탭 + ✨ 반응', '▶ 재생에서 순서대로 탭해야 반응(틀리면 흔들)'] },
      { title: '무지개 만들기', steps: ['색 조각을 무지개 순서로 연결', '각 조각 → 순서대로 탭 + 👁 보이기(다음 색)', '순서대로 탭하며 무지개 완성'] },
    ],
  },
  {
    cat: '✋ 끌어서 짝·분류 (연결 + 끌어서 잇기)',
    note: '요소를 연결한 상대 위로 끌어다 놓으면 정답!',
    items: [
      { title: '물고기를 어항에', steps: ['물고기와 어항을 넣고 둘을 연결', '물고기 선택 → ‘언제’를 끌어서 잇기 + ✨ 반응', '▶ 재생에서 물고기를 어항 위로 끌어다 놓기'] },
      { title: '엄마와 아기 짝 찾기', steps: ['아기동물과 엄마동물을 각각 연결', '아기동물 선택 → 끌어서 잇기 + 💬 말하기 → “찾았다!”', '끌어다 짝 맞추기'] },
      { title: '분리수거 놀이', steps: ['쓰레기 그림과 분리수거 통을 연결', '쓰레기 선택 → 끌어서 잇기 + 🙈 숨기기(자기)', '맞는 통에 끌어 넣으면 사라져요'] },
    ],
  },
  {
    cat: '🔌 스위치·인과 (스위치 + 실행 조건)',
    note: '스위치를 켜야만 다른 게 동작 — 잠금·인과 놀이.',
    items: [
      { title: '열쇠로 문 열기', steps: ['열쇠와 문을 넣어요', '열쇠 선택 → 🔌 스위치', '문 선택 → ✨ 반응 + 실행 조건 “스위치 켜졌을 때만” (열쇠를 먼저 눌러야 문이 열려요)'] },
      { title: '불 켜기', steps: ['스위치 그림과 전등(빛) 그림을 넣어요', '스위치 선택 → 🔌 스위치', '빛 선택 → 시작하면 숨기기(자기) + 다른 버튼으로 보이기 조건=스위치 ON'] },
    ],
  },
  {
    cat: '➡ 길 따라 이동 (연결 + 연결 따라 이동)',
    note: '연결한 곳까지 요소가 스르륵 이동.',
    items: [
      { title: '버스 출발!', steps: ['버스와 정류장을 연결', '버스 선택 → ➡ 연결 따라 이동', '탭하면 버스가 정류장으로 가요'] },
      { title: '나비야 꽃으로', steps: ['나비와 꽃을 연결', '나비 선택 → ➡ 연결 따라 이동', '탭하면 나비가 꽃까지 날아가요'] },
    ],
  },
  {
    cat: '📖 이야기 들려주기',
    note: '단계별 자막 + 소리로 한 장면씩.',
    items: [
      { title: '바다 여행 이야기', steps: ['상단 📖 이야기 열기 → 단계마다 한 줄씩 (“바닷속으로 가요” …)', '필요하면 요소에 시작하면 동작으로 인트로 추가', '▶ 재생 → 자막+소리로 ‘다음’ 넘기기'] },
      { title: '하루 일과 이야기', steps: ['아침→점심→저녁 장면 글을 단계로', '각 장면에서 강조하고 싶은 그림은 이야기 넘길 때 트리거로 반응', '‘다음’으로 하루를 따라가요'] },
    ],
  },
  {
    cat: '🏫 수업에서 쓰기',
    note: '슬라이드 덱·자동 진행·빠른 복제.',
    items: [
      { title: '활동 끝나면 다음 장으로', steps: ['슬라이드 뷰어에서 레이아웃 → 인터렉티브 → 만든 노드 고르기', '슬라이드의 ✅ 완료 시 자동 넘김 켜기', '아이가 이야기/순서 게임을 끝내면 저절로 다음 장'] },
      { title: '같은 놀이 여러 개 빠르게', steps: ['한 세트(요소+동작+연결)를 완성', '여러 요소 선택(Shift 클릭) → 🧩 묶어서 복제', '동작·연결까지 통째로 복제돼 살짝 바꿔 재사용'] },
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-extrabold text-fg">{title}</h3>
      {children}
    </section>
  );
}

export function HelpOverlay({ onClose }: Props) {
  return (
    <div className="absolute inset-0 z-[60] grid place-items-center p-4" style={{ background: 'rgba(20,19,17,.5)' }}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-base font-extrabold text-fg">❔ 인터렉티브 노드 — 따라 만들기</span>
          <button onClick={onClose} className="rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-fg-2 hover:border-accent hover:text-accent">
            ✕ 닫기
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          <Section title="빠른 시작 (3단계)">
            <ol className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li>왼쪽 도구로 <b className="text-fg">사진·글자·도형</b>을 넣어요.</li>
              <li>요소를 <b className="text-fg">선택</b>하면 오른쪽 ‘탭하면…’에서 동작을 골라요(‘언제’로 트리거도 바꿔요).</li>
              <li><b className="text-fg">▶ 재생</b>으로 아이처럼 놀아 보며 확인해요.</li>
            </ol>
          </Section>

          {/* ── 실전 활용 레시피(중심) ── */}
          <Section title="🎒 실전 활용 — 이렇게 만들어요">
            <div className="flex flex-col gap-4">
              {RECIPE_GROUPS.map((g) => (
                <div key={g.cat} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2/60 p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-extrabold text-fg">{g.cat}</span>
                    <span className="text-[12px] text-fg-muted">{g.note}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.items.map((it) => (
                      <div key={it.title} className="flex flex-col gap-1 rounded-xl border border-accent-soft bg-accent-soft/25 px-3 py-2.5">
                        <b className="text-[13px] text-fg">{it.title}</b>
                        <ol className="ml-4 list-decimal text-[12.5px] leading-relaxed text-fg-2">
                          {it.steps.map((s, i) => (
                            <li key={i}>{s}</li>
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
          <Section title="📌 동작 한눈에">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ACTIONS.map(([name, desc]) => (
                <div key={name} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] text-fg-2">
                  <b className="text-fg">{name}</b> — {desc}
                </div>
              ))}
            </div>
          </Section>

          <Section title="📌 트리거(언제 일어날까)">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {TRIGGERS.map(([name, desc]) => (
                <div key={name} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] text-fg-2">
                  <b className="text-fg">{name}</b> — {desc}
                </div>
              ))}
            </div>
            <p className="px-1 text-[12px] text-fg-muted">‘완료 후’ 트리거와 실행 조건(스위치)은 동작 카드에서 함께 설정해요.</p>
          </Section>

          <Section title="📌 연결 · 묶어서 복제">
            <ul className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li>요소에 마우스를 올리면 <b className="text-fg">양옆 동그라미(포트)</b> → 끌어서 다른 요소에 놓으면 연결(번호=순서).</li>
              <li>연결 동그라미를 빈 곳에 끌면 해제, 선을 클릭해도 해제.</li>
              <li>여러 개 선택 후 <b className="text-fg">🧩 묶어서 복제</b> = 동작·연결까지 통째 복제.</li>
            </ul>
          </Section>

          <Section title="📌 단축키">
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
