/**
 * editIntent.ts — '요소 선택 + 프롬프트' → 선택 요소 편집(보드 프롬프트바와 동일 감각).
 * ------------------------------------------------------------------
 * 결정론 키워드 해석기(외부 LLM 호출 0 · 무료 · 즉시). 선택된 자료(Material)가 있을 때
 * 자연어 지시를 색·글자·크기·라운드·움직임·정답·삭제로 매핑한다.
 * 매칭 0이면 ok:false → 호출부가 '게임 생성'으로 폴백한다.
 */
import { useMaterials, type AnimKind } from "./materials";

const COLORS: Record<string, string> = {
  빨강: "#E8836B", 빨간: "#E8836B", 빨갛: "#E8836B", 빨개: "#E8836B", red: "#E8836B",
  주황: "var(--coral)", 주황색: "var(--coral)", 코랄: "var(--coral)",
  노랑: "#FFD66B", 노란: "#FFD66B", 노랗: "#FFD66B", yellow: "#FFD66B",
  초록: "#A7E0B5", 초록색: "#A7E0B5", 녹색: "#A7E0B5", 푸른: "#A7E0B5", 푸르: "#A7E0B5", green: "#A7E0B5",
  파랑: "#9BD0F5", 파란: "#9BD0F5", 파랗: "#9BD0F5", 파래: "#9BD0F5", 하늘: "#9BD0F5", blue: "#9BD0F5",
  분홍: "#F6B8D0", 핑크: "#F6B8D0", pink: "#F6B8D0",
  보라: "#C9B8F2", purple: "#C9B8F2",
  하양: "#FFFFFF", 하얗: "#FFFFFF", 하얘: "#FFFFFF", 흰: "#FFFFFF", white: "#FFFFFF",
  검정: "#5B5750", 까만: "#5B5750", 까맣: "#5B5750", 까매: "#5B5750", black: "#5B5750",
};
const ANIMS: Array<[RegExp, AnimKind]> = [
  [/멈춰|멈춤|정지|그만/, "none"],
  [/흔들|좌우/, "shake"],
  [/통통|튀|점프|바운/, "bounce"],
  [/회전|돌(려|아|기)/, "spin"],
  [/둥실|떠다|부유|떠오/, "float"],
];

export interface EditResult { ok: boolean; msg: string }

/** 선택 요소(들)에 프롬프트를 적용. 적용된 게 없으면 {ok:false}. */
export function applyEditIntent(prompt: string): EditResult {
  const st = useMaterials.getState();
  const sel = st.items.filter((x) => st.selectedIds.includes(x.id));
  if (sel.length === 0) return { ok: false, msg: "" };
  const p = prompt.trim();
  if (!p) return { ok: false, msg: "" };

  // 삭제(선택 전체)
  if (/삭제|지워|없애|제거/.test(p)) {
    st.removeSelected();
    return { ok: true, msg: `${sel.length}개 삭제했어요` };
  }
  const results = sel.map((m) => applyToOne(st, m, p));
  const did = [...new Set(results.flat())];
  return did.length ? { ok: true, msg: `${did.join("·")} 적용했어요${sel.length > 1 ? ` (${sel.length}개)` : ""}` } : { ok: false, msg: "" };
}

type Store = ReturnType<typeof useMaterials.getState>;
function applyToOne(st: Store, m: Store["items"][number], p: string): string[] {
  const did: string[] = [];
  // 정답/오답(버튼)
  if (/정답|맞(아|는|음)/.test(p)) { st.update(m.id, { correct: true }); did.push("정답"); }
  if (/오답|틀(려|린|림)/.test(p)) { st.update(m.id, { correct: false }); did.push("오답"); }
  // 움직임
  for (const [re, anim] of ANIMS) if (re.test(p)) { st.update(m.id, { anim }); did.push("움직임"); break; }
  // 크기
  if (/크게|키워|커지|크기.?(키|크)/.test(p)) {
    st.update(m.id, { w: Math.min(1, m.w * 1.3), h: Math.min(1, m.h * 1.3) }); did.push("크게");
  } else if (/작게|줄여|작아|축소/.test(p)) {
    st.update(m.id, { w: Math.max(0.06, m.w * 0.75), h: Math.max(0.06, m.h * 0.75) }); did.push("작게");
  }
  // 라운드(버튼/프레임)
  if (m.kind === "button" || m.kind === "frame") {
    if (/둥글|동그|알약|라운드/.test(p)) { st.setStyle(m.id, { radius: 1 }); did.push("둥글게"); }
    else if (/각지|네모|사각|모(나|서)/.test(p)) { st.setStyle(m.id, { radius: 0 }); did.push("각지게"); }
  }
  // 색 (글자색 vs 배경)
  const wantsText = /글(자|씨)|폰트|텍스트.?색/.test(p);
  for (const k in COLORS) {
    if (p.includes(k)) {
      if (wantsText && (m.kind === "button" || m.kind === "text")) st.setStyle(m.id, { fg: COLORS[k] });
      else if (m.kind === "button" || m.kind === "frame") st.setStyle(m.id, { bg: COLORS[k] });
      else if (m.kind === "text") st.setStyle(m.id, { fg: COLORS[k] });
      did.push("색");
      break;
    }
  }
  // 글자 변경(텍스트/버튼)
  if (m.kind === "text" || m.kind === "button") {
    const quoted = p.match(/['"“”]([^'"“”]+)['"“”]/);
    const phrase = p.match(/(?:글자|글씨|이름|텍스트|라벨)\s*(?:을|를|은|는)?\s*['"]?(.+?)['"]?\s*(?:로|으로)\s*(?:바꿔|변경|해|써|적)/);
    if (quoted?.[1]) { st.update(m.id, { value: quoted[1].trim() }); did.push("글자"); }
    else if (phrase?.[1]) { st.update(m.id, { value: phrase[1].trim() }); did.push("글자"); }
    else if (did.length === 0 && p.length <= 14 && !/[?？]/.test(p)) {
      // 짧은 문구 + 다른 명령 없음 → 그대로 글자로 설정
      st.update(m.id, { value: p }); did.push("글자");
    }
  }

  return did;
}
