/**
 * 인터렉티브 노드 도움말 — 무엇을·어떻게 만들 수 있는지 아주 쉽게 설명.
 * 동작·트리거·연결·이야기·단축키 + "이렇게 만들어 보세요" 레시피.
 * 저작 크롬 → Milray 토큰. 풀스크린 오버레이 위에 모달로 띄운다.
 */
interface Props {
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-fg-2 shadow-sm">{children}</kbd>
);

const ACTIONS: Array<[string, string, string]> = [
  ['✨', '반응', '통통 튀기·점프·빙글 등 움직임을 줘요.'],
  ['🔄', '교체', '탭하면 다른 그림으로 바뀌어요(그림).'],
  ['💬', '말하기', '말풍선과 소리로 말을 해요.'],
  ['👁', '보이기', '숨어 있던 다른 요소를 나타내요.'],
  ['🙈', '숨기기', '다른 요소를 감춰요(까꿍 놀이).'],
  ['🌟', '강조', '다른 요소를 테두리로 반짝 강조해요.'],
  ['🔢', '세기', '탭할 때마다 숫자가 +1 (개수 세기).'],
  ['🔌', '스위치', '켜고 끄는 스위치 — ‘조건’과 함께 써요.'],
  ['➡', '연결 따라 이동', '연결한 곳으로 요소가 이동해요.'],
  ['🎞', '영상 재생', '탭하면 영상이 재생돼요(영상).'],
];

const TRIGGERS: Array<[string, string]> = [
  ['탭하면', '아이가 그 요소를 탭했을 때 동작해요(기본).'],
  ['시작하면 (자동)', '재생이 시작되면 저절로 동작해요 — 인사·인트로에 좋아요.'],
  ['순서대로 탭', '연결한 순서(①②③)대로 탭해야만 동작해요 — 순서 맞추기 놀이.'],
];

const SHORTCUTS: Array<[React.ReactNode, string]> = [
  [<><Kbd>{MOD}</Kbd> + <Kbd>Z</Kbd></>, '실행취소'],
  [<><Kbd>{MOD}</Kbd> + <Kbd>⇧</Kbd> + <Kbd>Z</Kbd></>, '다시실행'],
  [<><Kbd>{MOD}</Kbd> + <Kbd>A</Kbd></>, '전체 선택'],
  [<><Kbd>{MOD}</Kbd> + <Kbd>C</Kbd> / <Kbd>V</Kbd></>, '복사 / 붙여넣기'],
  [<><Kbd>{MOD}</Kbd> + <Kbd>D</Kbd></>, '복제'],
  [<><Kbd>Delete</Kbd></>, '삭제'],
  [<><Kbd>방향키</Kbd></>, '조금씩 이동 (⇧ 누르면 크게)'],
  [<><Kbd>Esc</Kbd></>, '선택 해제'],
];

const RECIPES: Array<[string, string[]]> = [
  ['인사하는 물고기', ['물고기 그림을 넣어요', '선택 → 💬 말하기 → "안녕!" 입력', '▶ 재생에서 물고기를 탭']],
  ['까꿍 숨바꼭질', ['그림 두 개를 넣어요', '하나 선택 → 🙈 숨기기 → 숨길 그림 고르기', '다른 하나 선택 → 👁 보이기 → 같은 그림 고르기']],
  ['순서 맞추기 놀이', ['요소들을 호버해 동그라미를 ①→②→③ 순서로 연결', '각 요소 선택 → 동작 카드의 ‘언제’를 순서대로 탭으로', '▶ 재생에서 순서대로 탭하면 성공']],
  ['이야기 들려주기', ['상단 📖 이야기 열기', '단계마다 한 줄씩 적기', '▶ 재생 → 자막과 소리로 ‘다음’ 넘기기']],
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
      <div
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-base font-extrabold text-fg">❔ 인터렉티브 노드 도움말</span>
          <button onClick={onClose} className="rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-fg-2 hover:border-accent hover:text-accent">
            ✕ 닫기
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          <Section title="① 빠르게 시작하기">
            <ol className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li><b className="text-fg">왼쪽 도구</b>로 사진·글자·도형을 넣어요.</li>
              <li>요소를 <b className="text-fg">탭(클릭)해서 선택</b>하면 오른쪽에 ‘탭하면…’ 동작 카드가 떠요.</li>
              <li>동작을 고르고 <b className="text-fg">▶ 재생</b>으로 확인해요.</li>
            </ol>
          </Section>

          <Section title="② 요소 다루기">
            <ul className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li><b className="text-fg">드래그</b> = 옮기기 · <b className="text-fg">모서리</b> = 크기 · <b className="text-fg">위 동그라미</b> = 회전</li>
              <li><b className="text-fg">글자 더블클릭</b> = 바로 글자 수정 (글자는 칸에 맞춰 자동 크기)</li>
              <li><b className="text-fg">그림에 마우스</b>를 올리면 편집 · 다운로드 · 크게 보기 버튼이 떠요.</li>
            </ul>
          </Section>

          <Section title="③ 동작 — 탭하면 일어나는 일">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ACTIONS.map(([icon, name, desc]) => (
                <div key={name} className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="text-lg leading-none">{icon}</span>
                  <span className="text-sm text-fg-2">
                    <b className="text-fg">{name}</b> — {desc}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="④ 언제 일어날까 (트리거)">
            <div className="flex flex-col gap-1.5">
              {TRIGGERS.map(([name, desc]) => (
                <div key={name} className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-2">
                  <b className="text-fg">{name}</b> — {desc}
                </div>
              ))}
              <p className="px-1 text-[12px] text-fg-muted">스위치(🔌)를 만들면 동작 카드에 ‘실행 조건’이 생겨요 — “스위치 켜졌을 때만” 동작하게 할 수 있어요(잠금·순서 놀이).</p>
            </div>
          </Section>

          <Section title="⑤ 연결하기">
            <ul className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li>요소에 마우스를 올리면 <b className="text-fg">양옆 동그라미(포트)</b>가 떠요. 끌어서 다른 요소에 놓으면 연결!</li>
              <li>연결하면 <b className="text-fg">번호(①②③)</b>가 붙어요 — 순서를 뜻해요.</li>
              <li>연결된 동그라미를 끌어 <b className="text-fg">빈 곳에 놓으면 해제</b>, 다른 요소에 놓으면 옮겨 연결. 선을 클릭해도 해제돼요.</li>
            </ul>
          </Section>

          <Section title="⑥ 이야기 (📖)">
            <p className="text-sm text-fg-2">상단 <b className="text-fg">📖 이야기</b>를 열고 단계마다 한 줄씩 적어요. 재생하면 <b className="text-fg">하단 자막 + 소리</b>로 ‘다음’을 눌러 한 장면씩 들려줘요.</p>
          </Section>

          <Section title="⑦ 단축키">
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

          <Section title="⑧ 수업 모드">
            <ul className="flex flex-col gap-1.5 text-sm text-fg-2">
              <li>보드에서 <b className="text-fg">수업 모드</b>를 켜고 인터렉티브 카드를 탭하면 <b className="text-fg">전체 화면으로 재생</b>돼요.</li>
              <li>슬라이드 덱 레이아웃에서 <b className="text-fg">‘인터렉티브’</b>를 고르면 만든 노드를 한 장으로 넣을 수 있어요.</li>
              <li>그 슬라이드의 <b className="text-fg">‘✅ 완료 시 자동 넘김’</b>을 켜면, 아이가 활동(이야기 끝·순서 맞추기 완료)을 끝냈을 때 <b className="text-fg">저절로 다음 장</b>으로 넘어가요.</li>
            </ul>
          </Section>

          <Section title="🎒 이렇게 만들어 보세요">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RECIPES.map(([title, steps]) => (
                <div key={title} className="flex flex-col gap-1 rounded-xl border border-accent-soft bg-accent-soft/30 px-3 py-2.5">
                  <b className="text-sm text-fg">{title}</b>
                  <ol className="ml-4 list-decimal text-[13px] leading-relaxed text-fg-2">
                    {steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
