/**
 * MakeGamePage.tsx — 입구② "나만의 게임 만들기" (스튜디오형, v1).
 * ------------------------------------------------------------------
 * 교사가 ① 게임 종류(장르)를 고르고 ② 이미지를 업로드/추천에서 골라 재료로 담고
 * ③ 하단 프롬프트바에 설명을 적어 게임을 만든다.
 *   - 재료 이미지가 있으면 → 그 그림들로 '세기' 게임(업로드=teacher 에셋, 추천=openmoji).
 *   - 재료가 없으면 → 장르 + 프롬프트로 LLM 라우팅 → 큐레이션 게임.
 * 하단 프롬프트바는 이 페이지(전체화면/단독) 자체 바. (임베드 시 보드 프롬프트바 연동은 다음 증분)
 *
 * v1 범위: 골격(장르·업로드·추천·하단바). 스타일 이미지 생성·배경제거·보드 드래그는 다음 단계.
 */
import { useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import type { GameSpec, TemplateId } from "../schema/gameSpec";
import { TEMPLATE_FORMS } from "../generate/templateForms";
import { CONTENT_SETS, type CategoryId } from "../generate/contentSets";
import { buildSpecFromForm, buildCountingFromImages, type PickedImage } from "../generate/buildSpecFromForm";
import { generateGameSpec } from "../generate/generateGameSpec";
import { generateImageAsset, STYLE_LABEL, STYLES, type ImgStyle } from "../generate/imageAsset";
import { Sprite } from "../assets/Sprite";
import { palette, radius, shadow } from "../theme";
import { PillButton } from "../engine/GameShell";
import { OmojiIcon } from "./formControls";

const GENRES = Object.values(TEMPLATE_FORMS);

/** 추천 이미지 — 큐레이션 OpenMoji 샘플(카테고리별 앞 몇 개). */
const RECOMMENDED: PickedImage[] = (["animal", "fruit", "vehicle", "food"] as CategoryId[]).flatMap((c) =>
  CONTENT_SETS[c].items.slice(0, 4).map((it) => ({ kind: "openmoji" as const, ref: it.ref, label: it.label })),
);

const keyOf = (im: PickedImage) => im.ref ?? im.url ?? "";

export function MakeGamePage({ onStart, showBar = true }: { onStart: (spec: GameSpec) => void; showBar?: boolean }) {
  const [genre, setGenre] = useState<TemplateId>("counting");
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [genSubject, setGenSubject] = useState("");
  const [genStyle, setGenStyle] = useState<ImgStyle>("clean");
  const [genBusy, setGenBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const aiGenerate = async () => {
    const s = genSubject.trim();
    if (!s || genBusy) return;
    setGenBusy(true);
    try {
      const url = await generateImageAsset(s, genStyle); // 유료 — 버튼 클릭 시에만
      if (url) {
        setPicked((p) => [...p, { kind: "upload", url, label: s.slice(0, 20) }]);
        setGenSubject("");
      }
    } finally {
      setGenBusy(false);
    }
  };

  const isPicked = (im: PickedImage) => picked.some((x) => keyOf(x) === keyOf(im));
  const togglePick = (im: PickedImage) =>
    setPicked((p) => (p.some((x) => keyOf(x) === keyOf(im)) ? p.filter((x) => keyOf(x) !== keyOf(im)) : [...p, im]));
  const removePick = (im: PickedImage) => setPicked((p) => p.filter((x) => keyOf(x) !== keyOf(im)));

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    [...files].slice(0, 8).forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () =>
        setPicked((p) => [...p, { kind: "upload", url: String(reader.result), label: f.name.replace(/\.[^.]+$/, "").slice(0, 20) || "내 그림" }]);
      reader.readAsDataURL(f);
    });
  };

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let spec: GameSpec;
      if (picked.length > 0) {
        spec = buildCountingFromImages(picked, { ageRange: "3-5" }); // 고른 그림 → 세기
      } else if (prompt.trim()) {
        // 임의 소재 콘텐츠 생성(건물↔직업 등) → 실패 시 큐레이션. 선택 장르를 우선.
        spec = (await generateGameSpec(prompt.trim(), genre)).spec;
      } else {
        spec = buildSpecFromForm({ templateId: genre, values: { ageRange: "3-5" } });
      }
      onStart(spec);
    } finally {
      setBusy(false);
    }
  };

  const makeLabel = busy ? "만드는 중…" : picked.length > 0 ? "내 그림으로 만들기 ▶" : "만들기 ▶";

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* 본문(스크롤) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "4px 22px 18px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* ① 게임 종류 */}
          <Section title="① 어떤 놀이로 만들까요?">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {GENRES.map((g) => {
                const on = genre === g.templateId;
                return (
                  <motion.button
                    key={g.templateId}
                    type="button"
                    onClick={() => setGenre(g.templateId)}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 16px 10px 12px",
                      borderRadius: radius.pill,
                      border: on ? `2px solid ${palette.coral}` : "2px solid transparent",
                      background: on ? "rgba(255,181,167,0.25)" : palette.outline,
                      boxShadow: shadow.soft,
                      cursor: "pointer",
                      fontSize: 15,
                      fontWeight: 800,
                      color: palette.textSoft,
                    }}
                  >
                    <OmojiIcon refCode={g.icon} label={g.title} size={26} />
                    {g.title}
                  </motion.button>
                );
              })}
            </div>
          </Section>

          {/* ② 그림(재료) — 업로드 + 추천 */}
          <Section title="② 그림 고르기 (선택)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: radius.card,
                  border: `2px dashed ${palette.lavender}`,
                  background: palette.outline,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  color: palette.textOnPastel,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>＋</span>
                업로드
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              {RECOMMENDED.map((im) => {
                const on = isPicked(im);
                return (
                  <motion.button
                    key={keyOf(im)}
                    type="button"
                    onClick={() => togglePick(im)}
                    whileTap={{ scale: 0.92 }}
                    title={im.label}
                    style={{
                      width: 84,
                      height: 84,
                      padding: 12,
                      borderRadius: radius.card,
                      border: on ? `3px solid ${palette.success}` : "3px solid transparent",
                      background: palette.outline,
                      boxShadow: shadow.soft,
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    <Sprite refCode={im.ref as string} label={im.label} />
                    {on && <span aria-hidden style={{ position: "absolute", top: 4, right: 6, fontSize: 16 }}>✅</span>}
                  </motion.button>
                );
              })}
            </div>
          </Section>

          {/* ③ AI로 그림 만들기 — 유료, 버튼 누를 때만 1회 생성 */}
          <Section title="③ AI로 그림 만들기 (선택)">
            <input
              value={genSubject}
              onChange={(e) => setGenSubject(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void aiGenerate(); }}
              disabled={genBusy}
              placeholder="무엇을 그릴까요? 예) 공룡, 우리 반 마스코트"
              style={{ width: "100%", maxWidth: 420, padding: "12px 16px", borderRadius: radius.button, border: `2px solid ${palette.lavender}`, background: palette.outline, fontSize: 15, color: palette.textSoft, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {STYLES.map((st) => {
                const on = genStyle === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setGenStyle(st)}
                    style={{ padding: "8px 14px", borderRadius: radius.pill, border: on ? `2px solid ${palette.coral}` : "2px solid transparent", background: on ? "rgba(255,181,167,0.25)" : palette.outline, boxShadow: shadow.soft, fontSize: 14, fontWeight: 700, color: palette.textSoft, cursor: "pointer" }}
                  >
                    {STYLE_LABEL[st]}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <PillButton tone="soft" onClick={aiGenerate}>{genBusy ? "그림 만드는 중… (~20초)" : "✨ 그림 만들기"}</PillButton>
              <span style={{ fontSize: 12, color: palette.textOnPastel, opacity: 0.85 }}>AI가 그려 ‘내 재료’에 담아요 · 만들 때마다 비용이 들어요</span>
            </div>
          </Section>

          {/* 고른 재료 */}
          {picked.length > 0 && (
            <Section title={`내 재료 (${picked.length})`}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {picked.map((im) => (
                  <div key={keyOf(im)} style={{ position: "relative", width: 64, height: 64, borderRadius: radius.button, background: palette.outline, boxShadow: shadow.soft, padding: 8 }}>
                    {im.kind === "openmoji" ? (
                      <Sprite refCode={im.ref as string} label={im.label} />
                    ) : (
                      <img src={im.url} alt={im.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                    )}
                    <button
                      type="button"
                      onClick={() => removePick(im)}
                      aria-label="빼기"
                      style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999, border: "none", background: palette.textSoft, color: "#fff", fontSize: 13, cursor: "pointer", lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: palette.textOnPastel, opacity: 0.85, marginTop: 8 }}>
                고른 그림으로 <b>세기 놀이</b>를 만들어요. (실루엣·줄잇기용 가공은 곧 추가돼요)
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* ③ 하단 프롬프트바 — 전체화면/단독은 자체 입력바, 임베드 소형 카드는 보드 프롬프트바로 입력(여긴 안내+만들기만) */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${palette.bgSky}`, background: palette.bgCream, padding: "12px 22px 14px" }}>
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: 8,
            background: palette.outline,
            borderRadius: radius.pill,
            boxShadow: shadow.soft,
          }}
        >
          {showBar ? (
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void generate(); }}
              disabled={busy}
              placeholder={picked.length > 0 ? "고른 그림으로 만들어요 — '만들기'를 눌러요" : "예) 동물원 동물 세기 · 우리 반 텃밭 채소들로"}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 17, padding: "8px 14px", color: palette.textSoft }}
            />
          ) : (
            <span style={{ flex: 1, padding: "8px 14px", fontSize: 14, color: palette.textOnPastel, lineHeight: 1.4 }}>
              아래 <b>보드 입력창</b>에 적어 만들거나, 위에서 그림·종류를 골라 ‘만들기’를 눌러요 (크게 보려면 ⛶).
            </span>
          )}
          <PillButton tone="primary" onClick={generate}>{makeLabel}</PillButton>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: palette.textSoft }}>{title}</div>
      {children}
    </div>
  );
}
