/**
 * GamePromptBar.tsx — 게임 뷰어 하단 프롬프트바(단독 탭). 보드 프롬프트바와 동일 감각.
 * ------------------------------------------------------------------
 *  - 요소를 선택하고 입력 → 그 요소를 편집(색·글자·크기·움직임·정답·삭제) — applyEditIntent.
 *  - 선택이 없거나 편집 해석 실패 → 프롬프트로 게임 생성(orchestrator).
 * 임베드/풀스크린에선 보드 공통 프롬프트바가 같은 동작을 한다(useBoardBridge).
 */
import { useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { applyEditIntent } from "./editIntent";
import { generateGame } from "../generate/orchestrator";
import { setBackgroundFromPrompt } from "../generate/background";
import { setNodeContentFromPrompt } from "../generate/nodeContent";
import { useGen } from "./genProgress";
import { useMaterials } from "./materials";
import { useGame } from "./useGame";

export function GamePromptBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number | null>(null);
  const selectedId = useMaterials((s) => s.selectedId);
  const hasSel = !!selectedId && useMaterials.getState().items.some((m) => m.id === selectedId);
  const bgSel = useGame((s) => s.bgSelected && s.mode === "edit");
  const nodeSel = useGame((s) => s.mode === "edit" && !!s.selectedNodeId); // 게임 요소(슬롯) 선택

  const flash = (msg: string) => {
    setToast(msg);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    // 0) 배경 선택(편집) → 프롬프트로 배경 이미지 생성
    if (useGame.getState().bgSelected && useGame.getState().mode === "edit") {
      setText("");
      setBusy(true);
      flash("배경을 그리고 있어요…");
      try {
        const ok = await setBackgroundFromPrompt(t);
        flash(ok ? "배경을 넣었어요!" : "배경 생성에 실패했어요");
      } finally {
        setBusy(false);
      }
      return;
    }
    // 0.5) 게임 요소(슬롯) 선택(편집) → 프롬프트로 그 자리 그림을 생성해 적용
    {
      const g = useGame.getState();
      if (g.mode === "edit" && g.selectedNodeId) {
        const nodeId = g.selectedNodeId;
        setText("");
        setBusy(true);
        flash("선택한 자리에 그림을 그리고 있어요…");
        try {
          const ok = await setNodeContentFromPrompt(nodeId, t);
          flash(ok ? "그림을 넣었어요!" : "생성에 실패했어요");
        } finally {
          setBusy(false);
        }
        return;
      }
    }
    // 1) 선택 요소 편집 시도
    const r = applyEditIntent(t);
    if (r.ok) { setText(""); flash(r.msg); return; }
    // 2) 게임 생성
    setText("");
    setBusy(true);
    flash("게임을 만들고 있어요…");
    try {
      await generateGame(t, { seedImages: useGen.getState().seeds });
      flash("완성했어요!");
    } catch {
      flash("생성에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kv-gpbar-wrap">
      {toast && <div className="kv-gpbar-toast">{toast}</div>}
      <form className="kv-gpbar" onSubmit={submit}>
        <span className="kv-gpbar-ic" aria-hidden><Icon name={bgSel ? "studio" : nodeSel ? "studio" : hasSel ? "edit" : "sparkle"} size={18} /></span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder={
            bgSel
              ? "배경 이미지를 만들어요…  예) 숲속 · 바닷속 · 우주 · 꽃밭"
              : nodeSel
                ? "선택한 자리에 넣을 그림을 말해요…  예) 사자 · 기쁜 얼굴 · 빨간 사과"
                : hasSel
                  ? "선택한 요소에 명령…  예) 빨갛게 · 글자 사과로 · 통통 튀게 · 정답"
                  : "무엇이든 만들어 보세요…  예) 동물 이름 맞추기 · 과일 짝 맞추기"
          }
          aria-label="게임 명령 입력"
        />
        <button type="submit" className="kv-gpbar-send" disabled={busy || !text.trim()} aria-label="보내기">
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}
