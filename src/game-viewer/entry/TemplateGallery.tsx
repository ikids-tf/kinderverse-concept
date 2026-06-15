/**
 * TemplateGallery.tsx — 입구① 기본 화면 (STEP 7).
 * TEMPLATE_FORMS 를 돌며 템플릿 카드(파스텔)를 렌더. M2는 "준비중" 뱃지.
 * 카드 클릭 → 폼(TemplateForm)으로.
 */
import { motion } from "motion/react";
import type { TemplateId } from "../schema/gameSpec";
import { TEMPLATE_FORMS } from "../generate/templateForms";
import { palette, radius, shadow, spring } from "../theme";
import { OmojiIcon } from "./formControls";

export function TemplateGallery({ onPick }: { onPick: (id: TemplateId) => void }) {
  const defs = Object.values(TEMPLATE_FORMS);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: palette.textSoft }}>어떤 놀이를 만들까요?</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        {defs.map((def, i) => {
          const soon = def.milestone === "M2";
          return (
            <motion.button
              key={def.templateId}
              type="button"
              onClick={() => onPick(def.templateId)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.soft, delay: i * 0.05 }}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 10,
                padding: "20px 20px 22px",
                borderRadius: radius.card,
                border: "none",
                background: palette.outline,
                boxShadow: shadow.soft,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <OmojiIcon refCode={def.icon} label={def.title} size={48} />
              <div style={{ fontSize: 20, fontWeight: 800, color: palette.textSoft }}>{def.title}</div>
              <div style={{ fontSize: 15, color: palette.textOnPastel, lineHeight: 1.45 }}>{def.description}</div>
              {soon && (
                <span
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    padding: "4px 10px",
                    borderRadius: radius.pill,
                    background: palette.lavender,
                    color: palette.textOnPastel,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  준비중
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
