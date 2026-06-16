/**
 * StartScreen.tsx — 게임 뷰어 기본 화면 (STEP 8).
 * ------------------------------------------------------------------
 * 상단 탭으로 두 입구를 오간다: [템플릿에서 시작](기본) ↔ [나만의 게임 만들기].
 *   - 템플릿 탭 → 갤러리 → 폼 → 게임.
 *   - 나만의 게임 만들기 탭 → MakeGamePage(장르·이미지·하단 프롬프트바) → 게임.
 * 레이아웃은 flex 컬럼 — 헤더/탭은 위에 고정, 본문이 남는 높이를 채운다(만들기 페이지의
 * 하단 프롬프트바가 화면 하단에 핀되도록).
 */
import { useState } from "react";
import { motion } from "motion/react";
import type { GameSpec, TemplateId } from "../schema/gameSpec";
import { EXAMPLE_COUNTING, EXAMPLE_SILHOUETTE } from "../schema/examples";
import { palette, radius, shadow } from "../theme";
import { GameViewer } from "../engine/GameViewer";
import { useFullscreen } from "../engine/useFullscreen";
import { TemplateGallery } from "./TemplateGallery";
import { TemplateForm } from "./TemplateForm";
import { MakeGamePage } from "./MakeGamePage";

type View =
  | { kind: "gallery" }
  | { kind: "form"; templateId: TemplateId }
  | { kind: "make" }
  | { kind: "play"; spec: GameSpec };

export function StartScreen({ onExit }: { onExit?: () => void }) {
  const [view, setView] = useState<View>({ kind: "gallery" });
  const { isFs, toggle: toggleFs } = useFullscreen();

  const tab: "template" | "make" = view.kind === "make" ? "make" : "template";
  const home = () => setView(tab === "make" ? { kind: "make" } : { kind: "gallery" });

  if (view.kind === "play") {
    return <GameViewer spec={view.spec} onExit={home} />;
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: palette.bgCream, color: palette.textSoft }}>
      {/* 상단 — 헤더 + 탭 (고정) */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 22px 0", display: "flex", flexDirection: "column", gap: 18 }}>
          <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 30 }}>🎈</span>
              <span style={{ fontSize: 24, fontWeight: 900, color: palette.textSoft }}>놀이 만들기</span>
            </div>
            <div style={{ flex: 1 }} />
            <motion.button
              type="button"
              aria-label={isFs ? "전체 화면 끄기" : "전체 화면"}
              title={isFs ? "전체 화면 끄기" : "전체 화면으로 보기"}
              onClick={toggleFs}
              whileTap={{ scale: 0.9 }}
              style={{ width: 42, height: 42, borderRadius: radius.pill, border: "none", background: palette.outline, boxShadow: shadow.soft, fontSize: 18, cursor: "pointer", color: palette.textSoft }}
            >
              {isFs ? "🡼" : "⛶"}
            </motion.button>
            {onExit && (
              <motion.button
                type="button"
                aria-label="닫기"
                onClick={onExit}
                whileTap={{ scale: 0.9 }}
                style={{ width: 42, height: 42, borderRadius: radius.pill, border: "none", background: palette.outline, boxShadow: shadow.soft, fontSize: 18, cursor: "pointer", color: palette.textSoft }}
              >
                ✕
              </motion.button>
            )}
          </header>

          <Tabs tab={tab} onTab={(t) => setView(t === "make" ? { kind: "make" } : { kind: "gallery" })} />
        </div>
      </div>

      {/* 본문 */}
      {view.kind === "make" ? (
        <MakeGamePage onStart={(spec) => setView({ kind: "play", spec })} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 22px 40px", display: "flex", flexDirection: "column", gap: 22 }}>
            {view.kind === "gallery" && (
              <TemplateGallery onPick={(templateId) => setView({ kind: "form", templateId })} />
            )}
            {view.kind === "form" && (
              <TemplateForm
                templateId={view.templateId}
                onBack={() => setView({ kind: "gallery" })}
                onStart={(spec) => setView({ kind: "play", spec })}
              />
            )}

            {/* 개발/데모 — 바로 해보기 */}
            <div style={{ marginTop: 8, paddingTop: 16, borderTop: `1px dashed ${palette.lavender}`, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: palette.textOnPastel, opacity: 0.8 }}>바로 해보기:</span>
              <DemoButton onClick={() => setView({ kind: "play", spec: EXAMPLE_COUNTING })}>🦁 동물 세기</DemoButton>
              <DemoButton onClick={() => setView({ kind: "play", spec: EXAMPLE_SILHOUETTE })}>✈️ 그림자 맞추기</DemoButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tabs({ tab, onTab }: { tab: "template" | "make"; onTab: (t: "template" | "make") => void }) {
  const item = (id: "template" | "make", label: string) => {
    const on = tab === id;
    return (
      <button
        type="button"
        onClick={() => onTab(id)}
        style={{
          flex: 1,
          padding: "12px 16px",
          borderRadius: radius.pill,
          border: "none",
          background: on ? palette.coral : "transparent",
          color: on ? palette.textOnPastel : palette.textSoft,
          fontSize: 16,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 6, padding: 6, background: "rgba(255,255,255,0.6)", borderRadius: radius.pill, boxShadow: shadow.soft }}>
      {item("template", "템플릿에서 시작")}
      {item("make", "나만의 게임 만들기")}
    </div>
  );
}

function DemoButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      style={{ padding: "8px 14px", borderRadius: radius.pill, border: "none", background: palette.outline, boxShadow: shadow.soft, fontSize: 14, fontWeight: 700, color: palette.textSoft, cursor: "pointer" }}
    >
      {children}
    </motion.button>
  );
}
