/**
 * StartScreen.tsx — 게임 뷰어 기본 화면 (STEP 8).
 * ------------------------------------------------------------------
 * 상단 탭으로 두 입구를 오간다: [템플릿에서 시작](기본) ↔ [나만의 게임 만들기].
 *   - 템플릿 탭 → 갤러리 → 폼 → 게임.
 *   - 나만의 게임 만들기 탭 → MakeGamePage(장르·이미지·하단 프롬프트바) → 게임.
 * 레이아웃은 flex 컬럼 — 헤더/탭은 위에 고정, 본문이 남는 높이를 채운다(만들기 페이지의
 * 하단 프롬프트바가 화면 하단에 핀되도록).
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { GameSpec, TemplateId } from "../schema/gameSpec";
import { generateGameSpec } from "../generate/generateGameSpec";
import type { PickedImage } from "../generate/buildSpecFromForm";
import { palette, radius, shadow } from "../theme";
import { GameViewer } from "../engine/GameViewer";
import { useFullscreen } from "../engine/useFullscreen";
import { TemplateGallery } from "./TemplateGallery";
import { TemplateForm } from "./TemplateForm";
import { MakeGamePage } from "./MakeGamePage";
import { HomeGallery } from "./HomeGallery";

type View =
  | { kind: "home" }
  | { kind: "gallery" }
  | { kind: "form"; templateId: TemplateId }
  | { kind: "make" }
  | { kind: "play"; spec: GameSpec };

export function StartScreen({ onExit }: { onExit?: () => void }) {
  const [view, setView] = useState<View>({ kind: "home" });
  const { isFs, toggle: toggleFs } = useFullscreen();

  // 하단바 하이브리드 — 전체화면(?fs)·단독(부모 없음)은 자체 바, 임베드 소형 카드는 보드 프롬프트바.
  const embedded = typeof window !== "undefined" && window.parent !== window;
  const fsMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fs");
  const ownBar = !embedded || fsMode;
  const [creating, setCreating] = useState(false);
  const [feedImage, setFeedImage] = useState<PickedImage | null>(null);

  // 보드 → iframe 메시지: 프롬프트로 게임 생성(kv-game-create) / 보드 이미지를 재료로 넣기(kv-game-add-image).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; prompt?: string; src?: string; label?: string } | null;
      if (d?.type === "kv-game-create" && typeof d.prompt === "string" && d.prompt.trim()) {
        setCreating(true);
        generateGameSpec(d.prompt.trim())
          .then(({ spec }) => setView({ kind: "play", spec }))
          .catch(() => {})
          .finally(() => setCreating(false));
      } else if (d?.type === "kv-game-add-image" && typeof d.src === "string") {
        // 보드 이미지 드롭 → '나만의 게임 만들기'로 전환하고 그 그림을 재료로 담는다.
        setFeedImage({ kind: "upload", url: d.src, label: (d.label || "내 그림").slice(0, 20) });
        setView({ kind: "make" });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const goHome = () => setView({ kind: "home" });

  if (view.kind === "play") {
    return <GameViewer spec={view.spec} onExit={goHome} />;
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: palette.bgCream, color: palette.textSoft }}>
      {/* 상단 — 헤더 + 탭 (고정) */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 22px 0", display: "flex", flexDirection: "column", gap: 18 }}>
          <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={goHome}
              title="첫 화면으로"
              style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
            >
              <span style={{ fontSize: 30 }}>🎈</span>
              <span style={{ fontSize: 24, fontWeight: 900, color: palette.textSoft }}>놀이 만들기</span>
            </button>
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

          <NavButtons
            active={view.kind === "make" ? "make" : view.kind === "gallery" || view.kind === "form" ? "templates" : "home"}
            onTemplates={() => setView({ kind: "gallery" })}
            onMake={() => setView({ kind: "make" })}
          />
        </div>
      </div>

      {/* 본문 */}
      {view.kind === "make" ? (
        <MakeGamePage onStart={(spec) => setView({ kind: "play", spec })} showBar={ownBar} feedImage={feedImage} onFedImage={() => setFeedImage(null)} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 22px 40px", display: "flex", flexDirection: "column", gap: 22 }}>
            {view.kind === "home" && (
              <HomeGallery
                onPick={(templateId) => setView({ kind: "form", templateId })}
                onPlay={(spec) => setView({ kind: "play", spec })}
              />
            )}
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
          </div>
        </div>
      )}

      {creating && (
        <div style={{ position: "absolute", inset: 0, zIndex: 60, display: "grid", placeItems: "center", background: "rgba(255,249,242,0.82)" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: palette.textSoft }}>놀이를 만드는 중…</div>
        </div>
      )}
    </div>
  );
}

/** 상단 네비게이션 — 탭이 아니라 '버튼'. 클릭하면 해당 페이지로 이동(현재 페이지면 강조). */
function NavButtons({
  active,
  onTemplates,
  onMake,
}: {
  active: "home" | "templates" | "make";
  onTemplates: () => void;
  onMake: () => void;
}) {
  const btn = (on: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "12px 16px",
    borderRadius: radius.pill,
    border: on ? "none" : `1.5px solid ${palette.outline}`,
    background: on ? palette.coral : "rgba(255,255,255,0.6)",
    color: on ? palette.textOnPastel : palette.textSoft,
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: shadow.soft,
  });
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <motion.button type="button" onClick={onTemplates} whileTap={{ scale: 0.97 }} style={btn(active === "templates")}>
        템플릿
      </motion.button>
      <motion.button type="button" onClick={onMake} whileTap={{ scale: 0.97 }} style={btn(active === "make")}>
        나만의 게임 만들기
      </motion.button>
    </div>
  );
}
