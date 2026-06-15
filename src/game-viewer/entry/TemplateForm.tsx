/**
 * TemplateForm.tsx — 입구① 폼 (STEP 7).
 * 선택 템플릿의 def.fields 를 큰 세그먼트/칩으로 렌더. ageRange 변경 시 autoFrom
 * 필드 기본값을 AGE_DEFAULTS 로 갱신. "게임 시작" → buildSpecFromForm(LLM 없음).
 * 하단 (옵션) 프롬프트는 M1 비활성(placeholder).
 */
import { useState } from "react";
import { motion } from "motion/react";
import type { AgeRange, GameSpec, TemplateId } from "../schema/gameSpec";
import { AGE_DEFAULTS, TEMPLATE_FORMS, type AgeDefault, type FieldValue } from "../generate/templateForms";
import { buildSpecFromForm } from "../generate/buildSpecFromForm";
import { palette, radius, shadow } from "../theme";
import { Segmented } from "./formControls";
import { PillButton } from "../engine/GameShell";

function initialValues(templateId: TemplateId): Record<string, FieldValue> {
  const def = TEMPLATE_FORMS[templateId];
  const v: Record<string, FieldValue> = {};
  for (const f of def.fields) v[f.id] = f.defaultValue;
  return v;
}

export function TemplateForm({
  templateId,
  onStart,
  onBack,
}: {
  templateId: TemplateId;
  onStart: (spec: GameSpec) => void;
  onBack: () => void;
}) {
  const def = TEMPLATE_FORMS[templateId];
  const [values, setValues] = useState<Record<string, FieldValue>>(() => initialValues(templateId));

  const setField = (id: string, value: FieldValue) => {
    setValues((prev) => {
      const next = { ...prev, [id]: value };
      // 연령 변경 → autoFrom 필드 기본값을 그 연령 기본값으로 자동 갱신.
      if (id === "ageRange") {
        const ad: AgeDefault = AGE_DEFAULTS[value as AgeRange];
        for (const f of def.fields) {
          if (f.autoFrom) {
            const d = ad[f.autoFrom];
            if (typeof d === "number") next[f.id] = d;
          }
        }
      }
      return next;
    });
  };

  const start = () => {
    const spec = buildSpecFromForm({ templateId, values });
    onStart(spec);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <motion.button
          type="button"
          aria-label="뒤로"
          onClick={onBack}
          whileTap={{ scale: 0.9 }}
          style={{
            width: 44, height: 44, borderRadius: radius.pill, border: "none",
            background: palette.outline, boxShadow: shadow.soft, fontSize: 20, cursor: "pointer", color: palette.textSoft,
          }}
        >
          ‹
        </motion.button>
        <div style={{ fontSize: 24, fontWeight: 800, color: palette.textSoft }}>{def.title}</div>
      </div>

      {def.fields.map((f) => (
        <Segmented key={f.id} field={f} value={values[f.id]} onChange={(v) => setField(f.id, v)} />
      ))}

      {/* (옵션) 자유 프롬프트 — M1 비활성 placeholder */}
      {def.supportsOptionalPrompt && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.7 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: palette.textSoft }}>(옵션) 특별히 바꾸고 싶은 게 있나요?</div>
          <input
            disabled
            placeholder="우리 반 텃밭 채소들로 — 곧 지원돼요"
            style={{
              padding: "14px 18px",
              borderRadius: radius.button,
              border: `2px dashed ${palette.lavender}`,
              background: "rgba(255,255,255,0.5)",
              fontSize: 16,
              color: palette.textOnPastel,
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
        <PillButton tone="primary" onClick={start}>게임 시작 ▶</PillButton>
      </div>
    </div>
  );
}
