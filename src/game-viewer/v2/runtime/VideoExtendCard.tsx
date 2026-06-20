/**
 * VideoExtendCard.tsx — 확장활동 '동물 영상' 카드(type: "watch-video").
 * ------------------------------------------------------------------
 * 게임에 나온 동물(subjects)을 각각 타일로 보여주고, 교사가 '영상 만들기'를 누르면
 * 그 동물의 생성 이미지를 첫 프레임으로 Veo 이미지→영상을 만들어 인라인 재생한다.
 * 🔴 자동 생성 없음(고비용·수 분) — 온디맨드 + 세션 캐시(animalVideo.ts).
 */
import { Icon } from "@/lib/icons";
import type { ExtendActivity } from "../schema/interactiveDoc";
import { useAssetUrl } from "./assetStore";
import { useVideoStore, useVideoEntry } from "../generate/animalVideo";

function VideoTile({ label }: { label: string }) {
  const seed = useAssetUrl(label); // 게임에서 생성된 그 동물 이미지(첫 프레임 시드)
  const entry = useVideoEntry(label);
  const generate = useVideoStore((s) => s.generate);

  return (
    <div className="kv-vid-tile">
      {entry.status === "ready" && entry.url ? (
        <video className="kv-vid-el" src={entry.url} autoPlay loop muted playsInline controls />
      ) : (
        <>
          {seed ? (
            <img className="kv-vid-poster" src={seed} alt={label} />
          ) : (
            <div className="kv-vid-poster kv-vid-noimg" aria-hidden>🎬</div>
          )}
          {entry.status === "pending" ? (
            <div className="kv-vid-busy">
              <span className="kv-vid-spin" aria-hidden />
              <span>{entry.step || "만드는 중…"}</span>
            </div>
          ) : (
            <button type="button" className="kv-vid-play" onClick={() => generate(label, seed)}>
              <span className="kv-vid-play-ic" aria-hidden>▶</span>
              {entry.status === "error" ? "다시 시도" : "영상 만들기"}
            </button>
          )}
          {entry.status === "error" && entry.step ? <div className="kv-vid-err">{entry.step}</div> : null}
        </>
      )}
      <span className="kv-vid-label">{label}</span>
    </div>
  );
}

export function VideoExtendCard({
  act,
  index,
  total,
  ttsEnabled,
  say,
  meta,
  nuriLabel,
}: {
  act: ExtendActivity;
  index: number;
  total: number;
  ttsEnabled: boolean;
  say: (t: string) => void;
  meta: { emoji: string; label: string };
  nuriLabel: Record<string, string>;
}) {
  const subjects = act.subjects ?? [];
  return (
    <div className="extend-card" role="group" aria-label="확장활동 · 동물 영상">
      <div className="extend-top">
        <span className="extend-kind">{meta.emoji} {meta.label}</span>
        <span className="extend-step">{index + 1} / {total}</span>
      </div>
      <ul className="extend-prompts">
        {act.prompts.map((p, j) => (<li key={j}>{p}</li>))}
      </ul>
      <div className="kv-vid-grid">
        {subjects.map((label) => (<VideoTile key={label} label={label} />))}
      </div>
      {act.nuri && act.nuri.length > 0 && (
        <div className="extend-nuri" aria-label="누리과정 영역">
          {act.nuri.map((n) => (<span key={n} className="nuri-chip">🌱 {nuriLabel[n] ?? n}</span>))}
        </div>
      )}
      <button type="button" className="extend-listen" onClick={() => { if (ttsEnabled) say(act.prompts.join("  ")); }}>
        <span className="kv-btn-ic"><Icon name="sound" size={15} /> 다시 듣기</span>
      </button>
    </div>
  );
}
