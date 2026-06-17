/**
 * HomeGallery.tsx — 게임 뷰어 '첫 화면'(추천/전체). 게임 썸네일을 큰 카드(고화질 이미지
 * 자리)로 리스트한다. 지금은 이미지 에셋이 없어 그라데이션+대표 아이콘 플레이스홀더로
 * 레이아웃을 잡는다(추후 def.thumb 이미지 URL로 교체).
 *   - 추천: 바로 해볼 수 있는 예시 게임 → onPlay(spec)
 *   - 전체: 템플릿 4종 → onPick(templateId)  (폼으로 이동)
 */
import { motion } from "motion/react";
import type { GameSpec, TemplateId } from "../schema/gameSpec";
import { EXAMPLE_COUNTING, EXAMPLE_SILHOUETTE } from "../schema/examples";
import { TEMPLATE_FORMS } from "../generate/templateForms";
import { palette, radius, shadow, spring } from "../theme";
import { OmojiIcon } from "./formControls";

const SHIPPED = ["M1", "M2"];

/** 템플릿별 썸네일 그라데이션(플레이스홀더). 추후 실제 이미지로 교체. */
const THUMB_BG: Record<TemplateId, string> = {
  counting: "linear-gradient(135deg, #FFE7C7 0%, #FFC7A0 100%)",
  silhouette: "linear-gradient(135deg, #D7E7FF 0%, #B7CCF7 100%)",
  emotion: "linear-gradient(135deg, #FFDCEB 0%, #FBC2D8 100%)",
  matching: "linear-gradient(135deg, #DCF3DD 0%, #B9E4BE 100%)",
};

const RECOMMENDED: { spec: GameSpec; title: string; sub: string; icon: string; bg: string }[] = [
  { spec: EXAMPLE_COUNTING, title: "동물 세기", sub: "숫자 세기 · 바로 해보기", icon: "1F981", bg: THUMB_BG.counting },
  { spec: EXAMPLE_SILHOUETTE, title: "그림자 맞추기", sub: "실루엣 · 바로 해보기", icon: "2708", bg: THUMB_BG.silhouette },
];

function ThumbCard({
  bg,
  icon,
  title,
  sub,
  badge,
  onClick,
  delay,
}: {
  bg: string;
  icon: string;
  title: string;
  sub: string;
  badge?: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.soft, delay }}
      whileHover={{ scale: 1.03, y: -3 }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: 0,
        borderRadius: radius.card,
        border: "none",
        background: palette.outline,
        boxShadow: shadow.soft,
        cursor: "pointer",
        textAlign: "left",
        overflow: "hidden",
      }}
    >
      {/* 썸네일(이미지 자리) — 그라데이션 + 대표 아이콘 */}
      <div style={{ position: "relative", aspectRatio: "4 / 3", background: bg, display: "grid", placeItems: "center" }}>
        <OmojiIcon refCode={icon} label={title} size={72} />
        {badge && (
          <span
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: "4px 10px",
              borderRadius: radius.pill,
              background: "rgba(255,255,255,0.85)",
              color: palette.textOnPastel,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: palette.textSoft }}>{title}</div>
        <div style={{ fontSize: 14, color: palette.textOnPastel, lineHeight: 1.4 }}>{sub}</div>
      </div>
    </motion.button>
  );
}

export function HomeGallery({
  onPick,
  onPlay,
}: {
  onPick: (id: TemplateId) => void;
  onPlay: (spec: GameSpec) => void;
}) {
  const templates = Object.values(TEMPLATE_FORMS);
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: 16,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: palette.textSoft }}>🌟 추천 놀이</div>
        <div style={grid}>
          {RECOMMENDED.map((r, i) => (
            <ThumbCard key={r.title} bg={r.bg} icon={r.icon} title={r.title} sub={r.sub} onClick={() => onPlay(r.spec)} delay={i * 0.05} />
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: palette.textSoft }}>전체 놀이</div>
        <div style={grid}>
          {templates.map((def, i) => (
            <ThumbCard
              key={def.templateId}
              bg={THUMB_BG[def.templateId]}
              icon={def.icon}
              title={def.title}
              sub={def.description}
              badge={SHIPPED.includes(def.milestone) ? undefined : "준비중"}
              onClick={() => onPick(def.templateId)}
              delay={(RECOMMENDED.length + i) * 0.05}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
