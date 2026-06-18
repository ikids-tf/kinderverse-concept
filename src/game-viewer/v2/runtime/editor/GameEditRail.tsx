/**
 * GameEditRail.tsx — 게임 전용 편집 LNB(좌측 세로 바) + 호버 프리셋 플라이아웃.
 * ------------------------------------------------------------------
 * My Board 좌측 툴바와 동일한 호버 메뉴 형식(스와치 + 라벨 + 설명, 섹션 구분)을 그대로 따른다.
 * 단, 게임뷰어는 Tailwind 미적용(파스텔 독립) → player.css 토큰/인라인으로 같은 모양을 만든다.
 *  - 텍스트: 제목/본문/라벨 + 배경 스타일(버튼/사각 박스/원형 박스) — 보드 텍스트 메뉴와 동일.
 *  - 버튼: 선택지/정답/오답/시작. 프레임: 이미지/동영상/사진카드/정사각존.
 *  - 액션: 선택 요소에 움직임 + 선 잇기.
 * 인스펙터(편집툴)는 요소 아래에 뜬다(MaterialsLayer). InteractiveDoc 인터랙션 엔진 불변.
 */
import { useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/lib/icons";
import { useMaterials, type AnimKind, type Material } from "../materials";

type ToolId = "text" | "button" | "frame" | "action";
interface Preset { id: string; label: string; desc: string; swatch: ReactNode; make: () => void }
interface Section { label?: string; items: Preset[] }

const ANIMS: Array<{ key: AnimKind; label: string; emoji: string }> = [
  { key: "none", label: "없음", emoji: "⏹" },
  { key: "shake", label: "흔들기", emoji: "↔️" },
  { key: "bounce", label: "통통", emoji: "⤴️" },
  { key: "spin", label: "회전", emoji: "🔄" },
  { key: "float", label: "둥실", emoji: "🎈" },
];

// ── 스와치(보드 미리보기와 같은 의미) — Tailwind 없이 인라인 ──
const ga = (size: number, color = "var(--ink)", weight = 700): ReactNode => (
  <span className="jua" style={{ fontSize: size, lineHeight: 1, color, fontWeight: weight }}>가</span>
);
const boxSwatch = (radius: number): ReactNode => (
  <span
    style={{
      fontSize: 9, lineHeight: 1, color: "var(--ink)", background: "#fff",
      border: "1.5px solid #EBDFD2", borderRadius: radius, padding: "2px 6px", boxShadow: "var(--shadow-sm)",
    }}
  >가나</span>
);
const pillSwatch = (bg: string, fg: string): ReactNode => (
  <span style={{ fontSize: 9, fontWeight: 800, lineHeight: 1, color: fg, background: bg, borderRadius: 999, padding: "3px 7px" }}>가나</span>
);
const ratioSwatch = (w: number, h: number): ReactNode => (
  <span style={{ display: "block", width: w, height: h, borderRadius: 4, border: "1.5px solid #EBDFD2", background: "var(--bg-peach,#FDE9DD)" }} />
);

export function GameEditRail() {
  const add = useMaterials((s) => s.add);
  const items = useMaterials((s) => s.items);
  const selectedId = useMaterials((s) => s.selectedId);
  const selectedIds = useMaterials((s) => s.selectedIds);
  const update = useMaterials((s) => s.update);
  const connectMode = useMaterials((s) => s.connectMode);
  const setConnectMode = useMaterials((s) => s.setConnectMode);
  const [fly, setFly] = useState<ToolId | null>(null);
  const leaveT = useRef<number | null>(null);
  const selected: Material | null = items.find((m) => m.id === selectedId) ?? null;

  const enter = (id: ToolId) => { if (leaveT.current) window.clearTimeout(leaveT.current); setFly(id); };
  const leave = () => { if (leaveT.current) window.clearTimeout(leaveT.current); leaveT.current = window.setTimeout(() => setFly(null), 120); };

  // ── 프리셋 패널(텍스트는 보드와 동일 구성) ──
  const PANELS: Record<Exclude<ToolId, "action">, { title: string; sections: Section[] }> = {
    text: {
      title: "텍스트",
      sections: [
        {
          items: [
            { id: "title", label: "제목", desc: "주제·구역 제목", swatch: ga(17, "var(--ink)", 800), make: () => add("text", "제목", { w: 0.44, h: 0.13 }) },
            { id: "body", label: "본문", desc: "기본 텍스트", swatch: ga(13), make: () => add("text", "텍스트", { w: 0.3, h: 0.1 }) },
            { id: "label", label: "라벨", desc: "이름표·작은 글씨", swatch: ga(10, "var(--ink-soft)"), make: () => add("text", "라벨", { w: 0.2, h: 0.08, style: { fg: "var(--ink-soft)" } }) },
          ],
        },
        {
          label: "배경 스타일",
          items: [
            { id: "button", label: "버튼", desc: "코랄 배경 라벨", swatch: pillSwatch("var(--coral)", "#fff"), make: () => add("button", "버튼", { style: { bg: "var(--coral)", fg: "#fff", radius: 1 } }) },
            { id: "boxRect", label: "사각 박스", desc: "테두리 사각 텍스트", swatch: boxSwatch(3), make: () => add("text", "텍스트", { w: 0.26, h: 0.12, style: { bg: "#FFFFFF", radius: 0.18 } }) },
            { id: "boxRound", label: "원형 박스", desc: "둥근 알약 텍스트", swatch: boxSwatch(999), make: () => add("text", "텍스트", { w: 0.26, h: 0.12, style: { bg: "#FFFFFF", radius: 1 } }) },
          ],
        },
      ],
    },
    button: {
      title: "버튼",
      sections: [
        {
          items: [
            { id: "opt", label: "선택지", desc: "답 고르기 버튼", swatch: pillSwatch("var(--coral)", "#fff"), make: () => add("button", "선택지", { style: { bg: "var(--coral)", fg: "#fff", radius: 1 }, correct: false }) },
            { id: "correct", label: "정답", desc: "정답으로 표시", swatch: pillSwatch("#86CFA0", "#fff"), make: () => add("button", "정답", { style: { bg: "#86CFA0", fg: "#fff", radius: 1 }, correct: true }) },
            { id: "wrong", label: "오답", desc: "오답 보기", swatch: pillSwatch("#C9C2B8", "#fff"), make: () => add("button", "오답", { style: { bg: "#C9C2B8", fg: "#fff", radius: 1 }, correct: false }) },
            { id: "start", label: "시작", desc: "큰 시작 버튼", swatch: pillSwatch("var(--coral)", "#fff"), make: () => add("button", "시작하기", { w: 0.3, h: 0.13, style: { bg: "var(--coral)", fg: "#fff", radius: 0.5 } }) },
          ],
        },
      ],
    },
    frame: {
      title: "프레임",
      sections: [
        {
          items: [
            { id: "img", label: "이미지", desc: "그림 컨테이너 (가로)", swatch: ratioSwatch(22, 16), make: () => add("frame", "", { w: 0.3, h: 0.26, mediaKind: "image", style: { radius: 0.12 } }) },
            { id: "vid", label: "동영상", desc: "영상 컨테이너 (와이드)", swatch: ratioSwatch(24, 14), make: () => add("frame", "", { w: 0.4, h: 0.24, mediaKind: "video", style: { radius: 0.12 } }) },
            { id: "card", label: "사진카드", desc: "둥근 카드 (세로)", swatch: ratioSwatch(15, 19), make: () => add("frame", "", { w: 0.24, h: 0.3, mediaKind: "image", style: { radius: 0.4 } }) },
            { id: "zone", label: "정사각존", desc: "정사각 영역", swatch: ratioSwatch(18, 18), make: () => add("frame", "", { w: 0.26, h: 0.26, mediaKind: "image", style: { radius: 0.06 } }) },
          ],
        },
      ],
    },
  };

  const TOOLS: Array<{ id: ToolId; icon: IconName; label: string; defaultMake?: () => void }> = [
    { id: "text", icon: "writing", label: "텍스트", defaultMake: () => add("text", "텍스트") },
    { id: "button", icon: "gamepad", label: "버튼", defaultMake: () => add("button", "버튼") },
    { id: "frame", icon: "frame", label: "프레임", defaultMake: () => add("frame", "") },
    { id: "action", icon: "motion", label: "액션" },
  ];

  const applyAnim = (anim: AnimKind) => { selectedIds.forEach((id) => update(id, { anim })); };

  return (
    <>
      <div className="kv-edit-rail" onPointerDown={(e) => e.stopPropagation()}>
        {TOOLS.map((t, i) => (
          <div key={t.id}>
            {i === TOOLS.length - 1 && <div className="kv-rail-div" />}
            <div className="kv-rail-item" onPointerEnter={() => enter(t.id)} onPointerLeave={leave}>
              <button
                type="button"
                className={`kv-rail-btn${fly === t.id || (t.id === "action" && connectMode) ? " on" : ""}`}
                title={t.label}
                aria-label={t.label}
                onClick={() => t.defaultMake?.()}
              >
                <Icon name={t.icon} size={18} />
              </button>

              {/* 프리셋 플라이아웃(보드 형식: 스와치 + 라벨 + 설명) */}
              {fly === t.id && t.id !== "action" && (
                <div className="kv-rail-fly">
                  <p className="kv-fly-title">{PANELS[t.id].title}</p>
                  {PANELS[t.id].sections.map((sec, si) => (
                    <div key={si}>
                      {si > 0 && <div className="kv-fly-sep" />}
                      {sec.label && <p className="kv-fly-seclabel">{sec.label}</p>}
                      <div className="kv-fly-list">
                        {sec.items.map((p) => (
                          <button key={p.id} type="button" className="kv-fly-row" onClick={() => p.make()}>
                            <span className="kv-fly-swatch">{p.swatch}</span>
                            <span className="kv-fly-txt">
                              <span className="kv-fly-label">{p.label}</span>
                              <span className="kv-fly-desc">{p.desc}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 액션 플라이아웃 — 선택 요소에 움직임 + 선 잇기 */}
              {fly === t.id && t.id === "action" && (
                <div className="kv-rail-fly">
                  <p className="kv-fly-title">움직임 {selected ? "" : "(요소 선택)"}</p>
                  <div className="kv-fly-anims">
                    {ANIMS.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        className={`kv-anim-chip${selected?.anim === a.key || (!selected?.anim && a.key === "none") ? " on" : ""}`}
                        disabled={!selected}
                        onClick={() => applyAnim(a.key)}
                      >
                        <span aria-hidden>{a.emoji}</span> {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="kv-fly-sep" />
                  <button
                    type="button"
                    className={`kv-connect-toggle${connectMode ? " on" : ""}`}
                    onClick={() => setConnectMode(!connectMode)}
                  >
                    <Icon name="link" size={15} /> {connectMode ? "선 잇기 끄기" : "선 잇기"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {connectMode && (
        <div className="kv-connect-hint" role="status">
          🔗 이을 두 요소를 차례로 누르세요 · 선을 누르면 삭제
        </div>
      )}
    </>
  );
}
