/**
 * PageNav.tsx — 편집 모드 페이지(라운드) 이동·추가·삭제 바.
 * ------------------------------------------------------------------
 * 한 게임은 여러 페이지(라운드)를 가진다(예: 동물 맞추기의 서로 다른 동물). 편집은 한 번에
 * 한 페이지만 보여주므로, 이 바로 페이지를 넘기며 각 페이지를 고치고, 새 페이지를 추가한다.
 * "추가"는 현재 페이지를 복제해 시작점을 주고(교사가 그림/답만 교체), 어떤 인터랙션 종류든
 * 스키마상 유효한 라운드를 보장한다. 무대 콘텐츠가 아니라 교사 편집 도구라 코랄 악센트를 쓴다.
 */
import { useGame } from "../useGame";
import { Icon } from "@/lib/icons";

export function PageNav() {
  const doc = useGame((s) => s.doc);
  const editRoundIdx = useGame((s) => s.editRoundIdx);
  const setEditRound = useGame((s) => s.setEditRound);
  const addRound = useGame((s) => s.addRound);
  const removeRound = useGame((s) => s.removeRound);

  if (!doc) return null;
  const total = doc.interaction.rounds.length;
  const idx = Math.min(editRoundIdx, total - 1);

  return (
    <div className="edit-pagenav" role="group" aria-label="페이지 이동·추가·삭제">
      <button
        type="button"
        className="pagenav-arrow"
        disabled={idx <= 0}
        onClick={() => setEditRound(idx - 1)}
        title="이전 페이지"
        aria-label="이전 페이지"
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <span className="pagenav-count" aria-live="polite">
        페이지 <b>{idx + 1}</b> / {total}
      </span>
      <button
        type="button"
        className="pagenav-arrow"
        disabled={idx >= total - 1}
        onClick={() => setEditRound(idx + 1)}
        title="다음 페이지"
        aria-label="다음 페이지"
      >
        <Icon name="chevronRight" size={18} />
      </button>

      <span className="pagenav-sep" aria-hidden />

      <button
        type="button"
        className="pagenav-add"
        onClick={addRound}
        title="이 페이지를 복제해 새 페이지를 추가해요"
        aria-label="페이지 추가"
      >
        <Icon name="plus" size={16} /> 페이지
      </button>
      <button
        type="button"
        className="pagenav-del"
        disabled={total <= 1}
        onClick={removeRound}
        title="이 페이지 삭제"
        aria-label="이 페이지 삭제"
      >
        <Icon name="minus" size={16} />
      </button>
    </div>
  );
}
