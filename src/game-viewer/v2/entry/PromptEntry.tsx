/**
 * PromptEntry.tsx — 프롬프트로 시작(빠른 길) + 노브(난이도·분량·분위기) + 추천 카드.
 * ------------------------------------------------------------------
 * 교사가 한 줄 입력 + 큰 노브 → Resolver가 추천 카드 2~3장 제시(교사 언어).
 * 카드 탭 = 결정론 조립(노브 반영) → 즉시 플레이(빈 캔버스 금지).
 */
import { useState } from "react";
import { recommendFromPromptAI, type Recommendation, type Knobs } from "../resolver/resolver";
import { useGame } from "../runtime/useGame";

/** 작은 세그먼트 노브(라벨 + 옵션 버튼들). */
function Seg<T extends string>(props: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="knob">
      <span className="knob-label">{props.label}</span>
      <div className="knob-opts">
        {props.options.map(([v, t]) => (
          <button
            key={v}
            type="button"
            className={`knob-opt${v === props.value ? " on" : ""}`}
            aria-pressed={v === props.value}
            onClick={() => props.onChange(v)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PromptEntry() {
  const loadDoc = useGame((s) => s.loadDoc);
  const start = useGame((s) => s.start);
  const [text, setText] = useState("");
  const [cards, setCards] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [useImages, setUseImages] = useState(false); // AI 생성 이미지(기본 끔 → 비용 0)
  const [difficulty, setDifficulty] = useState<Knobs["difficulty"]>("toddler");
  const [length, setLength] = useState<Knobs["length"]>("normal");
  const [mood, setMood] = useState<Knobs["mood"]>("lively");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      // LLM 의도파싱(키 있으면) → 없으면 결정론 폴백. 노브가 조립에 반영된다.
      setCards(await recommendFromPromptAI(text, { useImages, knobs: { difficulty, length, mood } }));
    } finally {
      setLoading(false);
    }
  };
  const pick = (c: Recommendation) => {
    const { input } = c.build();
    loadDoc(input);
    start(); // 시드로 즉시 플레이
    setCards([]);
    setText("");
  };

  return (
    <div className="prompt-entry">
      <form className="prompt-bar" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="어떤 놀이를 만들까요?  예) 동물 이름 맞추기 · 과일 짝 맞추기"
          aria-label="놀이 만들기 프롬프트"
        />
        <button
          type="button"
          className={`img-toggle${useImages ? " on" : ""}`}
          aria-pressed={useImages}
          title="AI 그림 — 이모지 대신 생성 이미지(시드→스왑)"
          onClick={() => setUseImages((v) => !v)}
        >
          🖼️ AI 그림
        </button>
        <button type="submit" disabled={loading}>{loading ? "만드는 중…" : "✨ 만들기"}</button>
      </form>

      <div className="knob-row">
        <Seg label="난이도" value={difficulty} onChange={setDifficulty}
          options={[["baby", "아기"], ["toddler", "유아"], ["senior", "형님"]]} />
        <Seg label="분량" value={length} onChange={setLength}
          options={[["short", "짧게"], ["normal", "보통"], ["long", "길게"]]} />
        <Seg label="분위기" value={mood} onChange={setMood}
          options={[["calm", "차분"], ["lively", "신나게"], ["punchy", "깜짝"]]} />
      </div>

      {cards.length > 0 && (
        <div className="rec-cards" role="list" aria-label="추천 놀이">
          {cards.map((c, i) => (
            <button
              key={c.archetype}
              type="button"
              role="listitem"
              className={`rec-card${i === 0 ? " primary" : ""}`}
              onClick={() => pick(c)}
            >
              <span className="rec-emoji" aria-hidden>{c.emoji}</span>
              <span className="rec-title">{c.title}</span>
              {i === 0 && <span className="rec-tag">추천</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
