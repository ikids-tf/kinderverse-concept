/**
 * PromptBar.tsx — 입구② 자유 프롬프트 (STEP 8). 빠른 길.
 * 입력 + 파스텔 퀵픽 칩. 제출/칩 클릭 → onGenerate(목업 라우터로 게임 생성).
 * (게임 뷰어 전용 — 앱의 Milray 프롬프트바와 별개. 아이 대면 파스텔.)
 */
import { useState } from "react";
import { motion } from "motion/react";
import { palette, radius, shadow } from "../theme";
import { PillButton } from "../engine/GameShell";

const QUICK_PICKS = [
  "동물 세기 놀이",
  "과일 그림자 맞추기",
  "탈것 세기",
  "음식 그림자 맞추기",
  "5살 친구 동물 세기",
];

export function PromptBar({ onGenerate }: { onGenerate: (prompt: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    const p = text.trim();
    if (p) onGenerate(p);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: palette.textSoft }}>무슨 놀이를 만들까요?</div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: 10,
          background: palette.outline,
          borderRadius: radius.pill,
          boxShadow: shadow.soft,
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="예) 동물원 동물 세기 게임 만들어줘"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 18,
            padding: "8px 14px",
            color: palette.textSoft,
          }}
        />
        <PillButton tone="primary" onClick={submit}>만들기</PillButton>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {QUICK_PICKS.map((q) => (
          <motion.button
            key={q}
            type="button"
            onClick={() => onGenerate(q)}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.04 }}
            style={{
              padding: "10px 16px",
              borderRadius: radius.pill,
              border: "none",
              background: "rgba(255,255,255,0.6)",
              boxShadow: shadow.soft,
              fontSize: 15,
              fontWeight: 700,
              color: palette.textSoft,
              cursor: "pointer",
            }}
          >
            {q}
          </motion.button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: palette.textOnPastel, opacity: 0.75 }}>
        지금은 키워드로 알아서 골라줘요(목업). 더 똑똑한 생성은 곧 만나요.
      </div>
    </div>
  );
}
