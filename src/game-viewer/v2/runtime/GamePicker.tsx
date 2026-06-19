/**
 * GamePicker.tsx — '놀이' 탭에서 카테고리를 고르면 뜨는 첫 화면(게임 고르기).
 * ------------------------------------------------------------------
 * 기본 게임(FIXTURES) + 이전에 만든 게임(savedGames, 같은 카테고리)을 카드로 나란히 보여주고,
 * 하나를 골라 바로 플레이한다. 만든 게임은 스냅샷한 그림을 프라임해 그대로 등장시킨다.
 */
import { FIXTURES } from "./fixtures";
import { useGame } from "./useGame";
import { useSavedGames, primeSavedAssets, type SavedGame } from "./savedGames";

/** 라벨 맨 앞 이모지(있으면) 분리 — 카드 썸네일용. */
function splitLabel(label: string): { emoji: string; text: string } {
  const m = /^(\p{Emoji}️?|\p{Extended_Pictographic})\s*(.*)$/u.exec(label);
  return m ? { emoji: m[1], text: m[2] || label } : { emoji: "🎮", text: label };
}

export function GamePicker({ category, onClose }: { category: string; onClose: () => void }) {
  const fixture = FIXTURES[category];
  const loadExample = useGame((s) => s.loadExample);
  const loadDoc = useGame((s) => s.loadDoc);
  const start = useGame((s) => s.start);
  const mine = useSavedGames((s) => s.games).filter((g) => g.category === category);
  const def = fixture ? splitLabel(fixture.label) : { emoji: "🎮", text: "놀이" };

  const playDefault = () => {
    loadExample(category);
    start();
    onClose();
  };
  const playMine = (g: SavedGame) => {
    primeSavedAssets(g);
    loadDoc(g.doc);
    start();
    onClose();
  };

  return (
    <div className="kv-picker" role="dialog" aria-label="놀이 고르기">
      <button type="button" className="kv-picker-close" aria-label="닫기" onClick={onClose}>✕</button>
      <h2 className="jua">{def.text} 골라서 시작해요</h2>
      <p className="kv-picker-sub">기본 놀이로 하거나, 이전에 만든 놀이를 다시 해요</p>

      <div className="kv-picker-grid">
        {fixture && (
          <button type="button" className="kv-picker-card is-default" onClick={playDefault}>
            <span className="kv-picker-badge">기본</span>
            <span className="kv-picker-thumb" aria-hidden>{def.emoji}</span>
            <span className="kv-picker-title">{def.text}</span>
          </button>
        )}
        {mine.map((g) => {
          const thumb = Object.values(g.assets ?? {})[0];
          return (
            <button key={g.id} type="button" className="kv-picker-card" onClick={() => playMine(g)}>
              <span className="kv-picker-badge mine">내 놀이</span>
              {thumb ? (
                <span className="kv-picker-thumb has-img"><img src={thumb} alt="" /></span>
              ) : (
                <span className="kv-picker-thumb" aria-hidden>{splitLabel(g.title).emoji}</span>
              )}
              <span className="kv-picker-title">{g.title}</span>
            </button>
          );
        })}
      </div>

      {mine.length === 0 && (
        <p className="kv-picker-empty">아직 만든 놀이가 없어요 — 아래 프롬프트로 만들면 여기에 모여요</p>
      )}
    </div>
  );
}
