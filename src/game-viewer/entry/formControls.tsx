/**
 * formControls.tsx — 입구 폼/갤러리 공용 파스텔 컨트롤.
 * 모든 선택은 큰 세그먼트/칩(자유 입력 없이 탭만으로 완성, FORM_DESIGN §5).
 */
import { motion } from "motion/react";
import { Sprite } from "../assets/Sprite";
import { palette, radius, shadow } from "../theme";
import type { FieldValue, FormField } from "../generate/templateForms";

/** 작은 OpenMoji 아이콘(칩/카드용). */
export function OmojiIcon({ refCode, label, size = 30 }: { refCode: string; label?: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, display: "inline-block", flex: "0 0 auto" }}>
      <Sprite refCode={refCode} label={label ?? ""} />
    </span>
  );
}

/** 세그먼트 필드 — 질문 라벨 + 큰 칩 행. value === option.value 로 선택 표시. */
export function Segmented({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: palette.textSoft }}>{field.label}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {field.options.map((opt) => {
          const selected = value === opt.value;
          return (
            <motion.button
              key={String(opt.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 56,
                padding: "8px 18px",
                borderRadius: radius.pill,
                border: `3px solid ${selected ? palette.coral : "transparent"}`,
                background: selected ? palette.outline : "rgba(255,255,255,0.55)",
                boxShadow: selected ? shadow.soft : "none",
                color: palette.textSoft,
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {opt.icon && <OmojiIcon refCode={opt.icon} label={opt.label} size={26} />}
              {opt.label}
            </motion.button>
          );
        })}
      </div>
      {field.help && <div style={{ fontSize: 14, color: palette.textOnPastel, opacity: 0.8 }}>{field.help}</div>}
    </div>
  );
}
