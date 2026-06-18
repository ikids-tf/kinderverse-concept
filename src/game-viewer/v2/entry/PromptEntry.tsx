/**
 * PromptEntry.tsx — 단독 탭 하단 프롬프트바. 한 줄 입력(+드래그 시드) → 게임 생성(orchestrator).
 * ------------------------------------------------------------------
 * 생성 과정은 useGen 채널로 스트리밍되어 바로 위에 한 줄로 표시된다("주제 분석 → 요소 생성/보관함
 * 가져오기 → 배경 제거 → 완성"). '그림 출처' 노브로 보관함 우선/전용/생성을 고른다.
 */
import { useState } from "react";
import type { Knobs } from "../resolver/resolver";
import { generateGame } from "../generate/orchestrator";
import { useGen, latestStep, type SourceMode } from "../runtime/genProgress";

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
  const [text, setText] = useState("");
  const [difficulty, setDifficulty] = useState<Knobs["difficulty"]>("toddler");
  const [length, setLength] = useState<Knobs["length"]>("normal");
  const [mood, setMood] = useState<Knobs["mood"]>("lively");

  const active = useGen((s) => s.active);
  const steps = useGen((s) => s.steps);
  const seeds = useGen((s) => s.seeds);
  const sourceMode = useGen((s) => s.sourceMode);
  const setSourceMode = useGen((s) => s.setSourceMode);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (active) return;
    const t = text.trim();
    if (!t && seeds.length === 0) return;
    setText("");
    await generateGame(t, { seedImages: seeds, knobs: { difficulty, length, mood } });
  };

  return (
    <div className="prompt-entry">
      <form className="prompt-bar" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="어떤 놀이를 만들까요?  예) 동물 이름 맞추기 · 과일 짝 맞추기"
          aria-label="놀이 만들기 프롬프트"
          disabled={active}
        />
        <button type="submit" disabled={active}>{active ? "만드는 중…" : "✨ 만들기"}</button>
      </form>

      {/* 생성 진행 스트리밍 — 단계 메시지를 한 줄로 */}
      {active && (
        <div className="gen-stream" aria-live="polite">
          <span className="gen-spinner" aria-hidden>⏳</span>
          <span className="gen-step">{latestStep(steps) || "준비 중…"}</span>
        </div>
      )}

      <div className="knob-row">
        <Seg label="그림 출처" value={sourceMode} onChange={(v: SourceMode) => setSourceMode(v)}
          options={[["auto", "보관함 우선"], ["gallery", "모두 보관함"], ["generate", "모두 생성"]]} />
        <Seg label="난이도" value={difficulty} onChange={setDifficulty}
          options={[["baby", "아기"], ["toddler", "유아"], ["senior", "형님"]]} />
        <Seg label="분량" value={length} onChange={setLength}
          options={[["short", "짧게"], ["normal", "보통"], ["long", "길게"]]} />
        <Seg label="분위기" value={mood} onChange={setMood}
          options={[["calm", "차분"], ["lively", "신나게"], ["punchy", "깜짝"]]} />
      </div>
    </div>
  );
}
