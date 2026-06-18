/**
 * WelcomeScreen.tsx — 게임 없을 때(doc===null) 첫 화면. 데모 대신 환영 + 만들기 안내.
 * 이미지를 끌어다 놓으면 시드 썸네일이 뜨고 안내 문구가 바뀐다(끌어온 그림으로 만들기).
 * 생성 중엔 최신 진행 단계를 한 줄로 보여준다(상세 스트리밍은 프롬프트바).
 */
import { useGen, latestStep } from "./genProgress";

export function WelcomeScreen() {
  const seeds = useGen((s) => s.seeds);
  const removeSeed = useGen((s) => s.removeSeed);
  const active = useGen((s) => s.active);
  const steps = useGen((s) => s.steps);
  const hasSeeds = seeds.length > 0;

  return (
    <div className="kv-welcome" role="group" aria-label="게임 만들기 시작">
      <div className="kv-welcome-emoji" aria-hidden>🎨</div>
      <h2 className="jua">
        {hasSeeds ? "무슨 게임을 만들고 싶나요?" : "선생님, 재미있는 게임을 만들어 봐요"}
      </h2>
      <p>
        {hasSeeds
          ? "프롬프트를 입력해 보세요 — 끌어온 그림으로 게임을 만들어요"
          : "아래에 프롬프트를 입력하거나, 이미지를 끌어다 놓아 게임을 만들어요"}
      </p>

      {hasSeeds && (
        <div className="kv-welcome-seeds" aria-label="끌어온 그림">
          {seeds.map((url) => (
            <div key={url} className="kv-seed-chip">
              <img src={url} alt="끌어온 그림" />
              <button type="button" className="kv-seed-del" aria-label="이 그림 빼기" onClick={() => removeSeed(url)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {active && (
        <div className="kv-welcome-step" aria-live="polite">
          {latestStep(steps) || "만드는 중…"}
        </div>
      )}
    </div>
  );
}
