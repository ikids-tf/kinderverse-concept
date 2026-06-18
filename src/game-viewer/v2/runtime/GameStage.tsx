/**
 * GameStage.tsx — 교사 크롬 + 상태줄 + 무대 + 오버레이를 조립.
 * ------------------------------------------------------------------
 * 무대는 stage.nodes 를 정규화 좌표로 배치한다. 인터랙션이 '점유'한 슬롯(option/pair/cover/hidden)은
 * 해당 부품(TapTheRightOne/MatchPair/RevealEffect)이 그리고, 나머지(cue·장식)는 NodeRenderer가 그린다.
 * 무대 픽셀 크기는 ResizeObserver로 재서 StageSizeContext로 내려준다(이모지/뽑힘거리 환산).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { NodeRenderer } from "./NodeRenderer";
import { TapTheRightOne } from "./interactions/TapTheRightOne";
import { MatchPair } from "./interactions/MatchPair";
import { BinaryChoice } from "./interactions/BinaryChoice";
import { FlipMemory } from "./interactions/FlipMemory";
import { OrderSequence } from "./interactions/OrderSequence";
import { RevealEffect } from "./effects/RevealEffect";
import { EditLayer } from "./editor/EditLayer";
import { MaterialsLayer } from "./MaterialsLayer";
import { useMaterials } from "./materials";
import { WelcomeScreen } from "./WelcomeScreen";
import { useGen } from "./genProgress";
import { StageSizeContext, type StageSize } from "./stageSize";
import { FIXTURES, FIXTURE_KEYS, type ExampleKey } from "./fixtures";
import { useGame } from "./useGame";
import { say, stopSay } from "./tts";
import { useFullscreen } from "./useFullscreen";
import { isEmbedded, useChromeVisible } from "./useBoardBridge";
import { Icon } from "@/lib/icons";

/** 보드가 카드를 풀스크린으로 띄울 때 iframe을 ?fs=1로 로드한다. 이 땐 X(닫기) 토글 + 하단
    보드 프롬프트바 공간 확보를 한다. */
const isBoardFs = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fs");

/** 설정 메뉴용 세로 노브(라벨 위, 옵션 아래) — 그림 출처·난이도·분량·분위기 공용. */
function KnobRow<T extends string>(props: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="kv-set-knob">
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

const START_DESC: Record<string, string> = {
  "tap-the-right-one": "잘 보고 누구인지 맞혀봐요!",
  "match-pair": "관련 있는 친구끼리 짝지어요!",
  "reveal-and-collect": "흙에 뭐가 심겼을까요? 맞히면 쑥 뽑혀요!",
};

/* 확장활동 유형 → 아이콘·라벨 (게임=도입, 확장=본체). */
const EXTEND_META: Record<string, { emoji: string; label: string }> = {
  discuss: { emoji: "💬", label: "이야기 나누기" },
  story: { emoji: "📖", label: "이야기 만들기" },
  "name-create": { emoji: "✏️", label: "이름 짓고 만들기" },
  "connect-apply": { emoji: "🔗", label: "생활에 연결하기" },
  "move-express": { emoji: "🤸", label: "몸으로 표현하기" },
};
/* 누리과정 영역 → 한글 라벨 (카피 불가능한 교육 메타데이터). */
const NURI_LABEL: Record<string, string> = {
  communication: "의사소통",
  "nature-inquiry": "자연탐구",
  social: "사회관계",
  art: "예술경험",
  physical: "신체운동",
};

/* 자료 메뉴 빠른 스티커 팔레트. */
const MAT_EMOJIS = ["⭐", "❤️", "👍", "🎈", "🌈", "🍎", "🐶", "🌟", "✅", "🎵", "🌸", "🚗"];

export function GameStage() {
  const doc = useGame((s) => s.doc);
  const exampleKey = useGame((s) => s.exampleKey);
  const phase = useGame((s) => s.phase);
  const roundIdx = useGame((s) => s.roundIdx);
  const totalRounds = useGame((s) => s.totalRounds);
  const score = useGame((s) => s.score);
  const maxScore = useGame((s) => s.maxScore);
  const banner = useGame((s) => s.banner);
  const showNext = useGame((s) => s.showNext);
  const ttsEnabled = useGame((s) => s.ttsEnabled);
  const cueSlotId = useGame((s) => s.cueSlotId);
  const cueContent = useGame((s) => s.cueContent);
  const cueReactSeq = useGame((s) => s.cueReactSeq);

  const extendIdx = useGame((s) => s.extendIdx);

  const loadExample = useGame((s) => s.loadExample);
  const start = useGame((s) => s.start);
  const next = useGame((s) => s.next);
  const nextExtend = useGame((s) => s.nextExtend);
  const restart = useGame((s) => s.restart);
  const toggleTts = useGame((s) => s.toggleTts);
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);

  // 풀스크린(게임만) + 교사 크롬 가시성(보드가 카드 비포커스 시 숨김) + 카테고리 메뉴 펼침.
  const { isFs, toggle: toggleFs } = useFullscreen();
  const chromeVisible = useChromeVisible();
  const [openMenu, setOpenMenu] = useState<"play" | "set" | "mat" | null>(null);
  const showToolbar = !isFs && chromeVisible;

  // 자료(요소) — 게임 위에 즉흥으로 올리는 스티커·글자·그림.
  const addMaterial = useMaterials((s) => s.add);
  const addSeed = useGen((s) => s.addSeed);
  const sourceMode = useGen((s) => s.sourceMode);
  const setSourceMode = useGen((s) => s.setSourceMode);
  const knobs = useGen((s) => s.knobs);
  const setKnobs = useGen((s) => s.setKnobs);
  const [matText, setMatText] = useState("");

  // 뷰어에 이미지를 끌어다 놓으면: 게임 없을 땐 '시드'(만들기 재료), 게임 중엔 '자료'로.
  const onSeedDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        if (useGame.getState().doc) addMaterial("image", reader.result);
        else addSeed(reader.result);
      };
      reader.readAsDataURL(f);
    });
  };
  const onUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") addMaterial("image", reader.result);
      setOpenMenu(null);
    };
    reader.readAsDataURL(file);
  };

  // 에디터 undo/redo (zundo temporal). 게임/모드 전환 시 히스토리 초기화(세션 단위).
  const canUndo = useStore(useGame.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useGame.temporal, (s) => s.futureStates.length > 0);
  useEffect(() => {
    useGame.temporal.getState().clear();
  }, [exampleKey, mode]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<StageSize>({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const claimed = useMemo(() => {
    const s = new Set<string>();
    if (!doc) return s;
    const it = doc.interaction;
    if (it.kind === "tap-the-right-one") it.optionSlotIds.forEach((id) => s.add(id));
    if (it.kind === "match-pair" || it.kind === "connect") {
      it.leftSlotIds.forEach((id) => s.add(id));
      it.rightSlotIds.forEach((id) => s.add(id));
    }
    if (it.kind === "flip-memory") it.cardSlotIds.forEach((id) => s.add(id));
    if (it.kind === "order-sequence") it.slotIds.forEach((id) => s.add(id));
    doc.effects.forEach((e) => {
      if (e.kind === "reveal") {
        s.add(e.coverNodeId);
        s.add(e.hiddenNodeId);
      }
    });
    return s;
  }, [doc]);

  const unclaimed = useMemo(
    () =>
      doc
        ? [...doc.stage.nodes].filter((n) => !claimed.has(n.id)).sort((a, b) => a.transform.z - b.transform.z)
        : [],
    [doc, claimed],
  );

  const hasReveal = !!doc?.effects.some((e) => e.kind === "reveal");
  const kind = doc?.interaction.kind;

  // 가로 레인 카메라(PRD §10.1): 게임=섹션0, 확장활동=오른쪽 섹션들. 확장 단계면 그 섹션으로 팬.
  const cam = phase === "extend" ? extendIdx + 1 : 0;

  const onMute = () => {
    const was = ttsEnabled;
    toggleTts();
    if (was) stopSay();
  };

  return (
    <StageSizeContext.Provider value={size}>
      <div className="wrap">
        {/* 교사 크롬 — 카테고리 접이식 툴바. 자리는 항상 예약(무대 안 밀림), 호버 시 버튼만 페이드인. */}
        {!isFs && (
          <div className={`chrome${showToolbar ? " is-on" : ""}`}>
            <div className="kv-toolbar">
              {/* 놀이 고르기 (예제 8종을 한 메뉴로 접음) */}
              <div className="kv-menu-wrap">
                <button
                  type="button"
                  className={`kv-menu-btn${openMenu === "play" ? " on" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "play"}
                  onClick={() => setOpenMenu(openMenu === "play" ? null : "play")}
                >
                  <span className="kv-btn-ic"><Icon name="gamepad" size={17} /> 놀이</span>
                </button>
                {openMenu === "play" && (
                  <div className="kv-menu" role="menu">
                    {FIXTURE_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="menuitemradio"
                        aria-checked={k === exampleKey}
                        className={`kv-menu-item${k === exampleKey ? " on" : ""}`}
                        onClick={() => {
                          loadExample(k as ExampleKey);
                          setOpenMenu(null);
                        }}
                      >
                        {FIXTURES[k].label}
                      </button>
                    ))}
                    {isEmbedded && <div className="kv-menu-note">또는 보드 프롬프트바에 입력해 만들어요</div>}
                  </div>
                )}
              </div>

              {/* 설정 (난이도·분위기 — 읽기전용) */}
              <div className="kv-menu-wrap">
                <button
                  type="button"
                  className={`kv-menu-btn${openMenu === "set" ? " on" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "set"}
                  onClick={() => setOpenMenu(openMenu === "set" ? null : "set")}
                >
                  <span className="kv-btn-ic"><Icon name="settings" size={17} /> 설정</span>
                </button>
                {openMenu === "set" && (
                  <div className="kv-menu kv-menu-set" role="menu">
                    <KnobRow label="그림 출처" value={sourceMode} onChange={setSourceMode}
                      options={[["auto", "보관함 우선"], ["gallery", "모두 보관함"], ["generate", "모두 생성"]]} />
                    <KnobRow label="난이도" value={knobs.difficulty} onChange={(v) => setKnobs({ difficulty: v })}
                      options={[["baby", "아기"], ["toddler", "유아"], ["senior", "형님"]]} />
                    <KnobRow label="분량" value={knobs.length} onChange={(v) => setKnobs({ length: v })}
                      options={[["short", "짧게"], ["normal", "보통"], ["long", "길게"]]} />
                    <KnobRow label="분위기" value={knobs.mood} onChange={(v) => setKnobs({ mood: v })}
                      options={[["calm", "차분"], ["lively", "신나게"], ["punchy", "깜짝"]]} />
                  </div>
                )}
              </div>

              {/* 자료 — 게임 위에 즉흥으로 올리는 스티커·글자·그림(확장 활동) */}
              <div className="kv-menu-wrap">
                <button
                  type="button"
                  className={`kv-menu-btn${openMenu === "mat" ? " on" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "mat"}
                  onClick={() => setOpenMenu(openMenu === "mat" ? null : "mat")}
                >
                  <span className="kv-btn-ic"><Icon name="plus" size={17} /> 자료</span>
                </button>
                {openMenu === "mat" && (
                  <div className="kv-menu kv-menu-mat" role="menu">
                    <div className="kv-menu-label">스티커</div>
                    <div className="kv-emoji-row">
                      {MAT_EMOJIS.map((em) => (
                        <button key={em} type="button" className="kv-emoji-btn" aria-label={`스티커 ${em}`} onClick={() => addMaterial("emoji", em)}>
                          {em}
                        </button>
                      ))}
                    </div>
                    <div className="kv-menu-label">글자</div>
                    <form
                      className="kv-mat-textform"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const v = matText.trim();
                        if (v) {
                          addMaterial("text", v);
                          setMatText("");
                        }
                      }}
                    >
                      <input value={matText} onChange={(e) => setMatText(e.target.value)} placeholder="글자 입력" aria-label="글자 자료 입력" />
                      <button type="submit">추가</button>
                    </form>
                    <div className="kv-menu-label">그림</div>
                    <label className="kv-mat-upload">
                      <span className="kv-btn-ic"><Icon name="folder" size={15} /> 그림 올리기</span>
                      <input type="file" accept="image/*" onChange={onUploadImage} hidden />
                    </label>
                  </div>
                )}
              </div>

              <div className="kv-toolbar-spacer" />

              {/* 아이콘 클러스터 — 소리 / 편집 / 풀스크린 */}
              <button
                type="button"
                className="icon-btn"
                title="읽어주기 켜기/끄기"
                aria-label="읽어주기 켜기/끄기"
                onClick={onMute}
              >
                <Icon name={ttsEnabled ? "sound" : "mute"} size={18} />
              </button>
              <button
                type="button"
                className={`icon-btn${mode === "edit" ? " on" : ""}`}
                title="고급 편집 / 플레이"
                aria-label="고급 편집 / 플레이"
                aria-pressed={mode === "edit"}
                onClick={() => setMode(mode === "edit" ? "play" : "edit")}
              >
                <Icon name={mode === "edit" ? "play" : "edit"} size={18} />
              </button>
              {mode === "edit" && (
                <>
                  <button type="button" className="icon-btn" title="실행취소" aria-label="실행취소" disabled={!canUndo} onClick={() => useGame.temporal.getState().undo()}><Icon name="undo" size={18} /></button>
                  <button type="button" className="icon-btn" title="다시실행" aria-label="다시실행" disabled={!canRedo} onClick={() => useGame.temporal.getState().redo()}><Icon name="redo" size={18} /></button>
                </>
              )}
              <button
                type="button"
                className="icon-btn"
                title={isFs || isBoardFs ? "전체 화면 닫기" : "전체 화면"}
                aria-label={isFs || isBoardFs ? "전체 화면 닫기" : "전체 화면"}
                onClick={() => {
                  // 보드 풀스크린(포털)이면 부모에 닫기 알림(kv-fs-exit) → 보드가 포털을 닫는다.
                  if (isBoardFs) window.parent.postMessage({ type: "kv-fs-exit" }, "*");
                  else toggleFs(); // 단독 탭: 네이티브 풀스크린 토글
                }}
              >
                <Icon name={isFs || isBoardFs ? "x" : "maximize"} size={18} />
              </button>
            </div>
            {openMenu && <div className="kv-menu-backdrop" onClick={() => setOpenMenu(null)} aria-hidden />}
          </div>
        )}

        {/* 풀스크린 시 최소 플로팅 컨트롤(게임만 보이게 — 코너에 소리/나가기) */}
        {isFs && (
          <div className="kv-fs-bar">
            <button type="button" className="icon-btn" title="읽어주기 켜기/끄기" aria-label="읽어주기 켜기/끄기" onClick={onMute}>
              {ttsEnabled ? "🔊" : "🔇"}
            </button>
            <button type="button" className="icon-btn" title="전체 화면 끄기" aria-label="전체 화면 끄기" onClick={toggleFs}><Icon name="minimize" size={18} /></button>
          </div>
        )}

        {/* 상태 줄 — 게임이 있을 때만(환영 화면에선 숨김) */}
        {doc && (
          <div className="statusbar">
            <span className="round-txt">
              문제 <b>{roundIdx + 1}</b> / {totalRounds || 1}
            </span>
            <div className="stars" aria-label={`점수 ${score} / ${maxScore}`}>
              {Array.from({ length: maxScore }).map((_, i) => (
                <span key={i} className={`star${i < score ? " on" : ""}`}>⭐</span>
              ))}
            </div>
          </div>
        )}

        {/* 무대 — 이미지 드롭존(시드/자료) */}
        <div className="stage-frame" onDragOver={(e) => e.preventDefault()} onDrop={onSeedDrop}>
          <div className="stage" ref={stageRef}>
            {/* 카메라 — 게임(섹션0) + 확장활동(오른쪽 섹션들)을 가로 레인으로 팬 */}
            <div className="kv-camera" style={{ transform: `translateX(-${cam * 100}%)` }}>
              {/* 섹션 0 — 게임 */}
              <div className="kv-section">
                <div className="blob a" />
                <div className="blob b" />

                {doc && mode === "edit" && <EditLayer />}

                {doc && mode === "play" && (
                  <>
                    {unclaimed.map((node) => (
                      <NodeRenderer
                        key={node.id}
                        node={node}
                        binding={node.id === cueSlotId ? cueContent : undefined}
                        reactSeq={node.id === cueSlotId ? cueReactSeq : undefined}
                      />
                    ))}
                    {hasReveal && <RevealEffect />}
                    {kind === "match-pair" || kind === "connect" ? (
                      <MatchPair />
                    ) : kind === "binary-choice" ? (
                      <BinaryChoice />
                    ) : kind === "flip-memory" ? (
                      <FlipMemory />
                    ) : kind === "order-sequence" ? (
                      <OrderSequence />
                    ) : (
                      <TapTheRightOne />
                    )}
                  </>
                )}

                <div className={`banner${banner ? " show " + (banner.ok ? "ok" : "no") : ""}`}>
                  <span aria-hidden>{banner?.ok ? "🎉" : "💪"}</span>
                  <span>{banner?.text}</span>
                </div>

                <button type="button" className={`next${showNext ? " show" : ""}`} onClick={next}>
                  다음 <span aria-hidden>→</span>
                </button>

                {/* 환영 화면 — 게임이 없을 때(데모 대신). 프롬프트/이미지 드래그로 만들기 시작 */}
                {!doc && <WelcomeScreen />}

                {/* 시작 오버레이 (게임 있고 start 단계일 때만; 편집 모드 숨김) */}
                <div className={`overlay${phase !== "start" || mode === "edit" || !doc ? " hide" : ""}`}>
                  <div className="finish-emoji" aria-hidden>🐾</div>
                  <h2 className="jua">{doc?.meta.title ?? "게임을 시작해요"}</h2>
                  <p>{doc ? START_DESC[doc.meta.archetype] ?? "시작해볼까요?" : ""}</p>
                  <button type="button" className="big-btn" onClick={start}>▶ 시작</button>
                </div>

                {/* 완료 오버레이 */}
                <div className={`overlay${phase !== "finished" ? " hide" : ""}`}>
                  <div className="finish-emoji" aria-hidden>🎉</div>
                  <h2 className="jua">참 잘했어요!</h2>
                  <div className="finish-stars">
                    {Array.from({ length: maxScore }).map((_, i) => (
                      <span key={i} className={`star${i < score ? " on" : ""}`}>⭐</span>
                    ))}
                  </div>
                  <p>
                    {maxScore}개 중 {score}개 맞혔어요!
                  </p>
                  <button type="button" className="big-btn" onClick={restart}>↺ 다시 하기</button>
                </div>

                {mode === "edit" && (
                  <div className="edit-hint" aria-hidden>
                    ✏️ 끌어서 이동 · 모서리로 크기 · 방향키 미세이동
                  </div>
                )}
              </div>

              {/* 확장활동 섹션들 — 게임 오른쪽으로 펼쳐지는 레인(끊김없이 카메라 팬) */}
              {doc &&
                doc.extend.map((act, i) => {
                  const m = EXTEND_META[act.type] ?? { emoji: "🌟", label: "확장활동" };
                  const last = i + 1 >= doc.extend.length;
                  return (
                    <div className="kv-section kv-section-extend" key={i} style={{ left: `${(i + 1) * 100}%` }} role="group" aria-label="확장활동">
                      <div className="extend-card">
                        <div className="extend-top">
                          <span className="extend-kind">{m.emoji} {m.label}</span>
                          <span className="extend-step">확장활동 {i + 1} / {doc.extend.length}</span>
                        </div>
                        <ul className="extend-prompts">
                          {act.prompts.map((p, j) => (
                            <li key={j}>{p}</li>
                          ))}
                        </ul>
                        {act.nuri && act.nuri.length > 0 && (
                          <div className="extend-nuri" aria-label="누리과정 영역">
                            {act.nuri.map((n) => (
                              <span key={n} className="nuri-chip">🌱 {NURI_LABEL[n] ?? n}</span>
                            ))}
                          </div>
                        )}
                        <div className="extend-actions">
                          <button type="button" className="extend-listen" onClick={() => { if (ttsEnabled) say(act.prompts.join("  ")); }}>
                            <span className="kv-btn-ic"><Icon name="sound" size={15} /> 다시 듣기</span>
                          </button>
                          <button type="button" className="big-btn" onClick={nextExtend}>
                            {last ? "마치기 ✓" : "다음 →"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* 자료 레이어 — 카메라 밖(뷰포트 고정): 팬과 무관하게 항상 화면 위에서 추가/이동/삭제 */}
            {doc && mode === "play" && <MaterialsLayer />}
          </div>
        </div>

        {/* 뷰어 자체 프롬프트바는 두지 않는다 — 만들기는 보드 공통 프롬프트바가 담당한다
            (임베드 소형 카드: 보드 바가 제어 / 풀스크린: 보드 바가 그 자리에 떠서 제어).
            그림 출처·난이도·분량·분위기는 상단 ⚙️ 설정 메뉴에서 조절한다. */}

        {!isEmbedded && (
          <p className="note">
            이 화면은 <code>InteractiveDoc</code> 하나로 플레이됩니다 — 게임 코드를 새로 짠 게 아니라
            문서 → 런타임으로 렌더됩니다. (프로토: 이미지=이모지, 음성=브라우저 TTS, 모션=Motion 스프링.)
          </p>
        )}
      </div>
    </StageSizeContext.Provider>
  );
}
