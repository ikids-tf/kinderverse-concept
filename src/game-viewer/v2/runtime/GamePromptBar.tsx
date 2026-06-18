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
import { useGen } from "./genProgress";
import { useMaterials } from "./materials";

export function GamePromptBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number | null>(null);
  const selectedId = useMaterials((s) => s.selectedId);
  const hasSel = !!selectedId && useMaterials.getState().items.some((m) => m.id === selectedId);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
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
        <span className="kv-gpbar-ic" aria-hidden><Icon name={hasSel ? "edit" : "sparkle"} size={18} /></span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder={
            hasSel
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
