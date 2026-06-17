/**
 * PromptEntry.tsx — 프롬프트로 시작(빠른 길) + 추천 카드(고르기 > 고치기).
 * ------------------------------------------------------------------
 * 교사가 한 줄 입력 → Resolver가 추천 카드 2~3장 제시(교사 언어, 기술 부품명 노출 금지).
 * 카드 탭 = 결정론 조립 → 즉시 플레이(빈 캔버스 금지). LLM/생성 없이 동작.
 */
import { useState } from "react";
import { recommendFromPromptAI, type Recommendation } from "../resolver/resolver";
import { useGame } from "../runtime/useGame";

export function PromptEntry() {
  const loadDoc = useGame((s) => s.loadDoc);
  const start = useGame((s) => s.start);
  const [text, setText] = useState("");
  const [cards, setCards] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      // LLM 의도파싱(키 있으면) → 없으면 결정론 폴백. 어느 쪽이든 빈 결과 없음.
      setCards(await recommendFromPromptAI(text));
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
        <button type="submit" disabled={loading}>{loading ? "만드는 중…" : "✨ 만들기"}</button>
      </form>

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
