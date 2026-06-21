/**
 * 이야기(story) 저작 패널 — 단계(나레이션 한 줄씩)를 추가·편집·순서변경·삭제.
 * 재생 모드에서 하단 자막 바 + TTS로 한 단계씩 '다음'으로 넘기며 읽어준다.
 * (분기/장면 이동은 후속 — v1은 선형 나레이션.)
 * 저작 크롬 → Milray 토큰. 인스펙터와 같은 자리(오른쪽).
 */
import { Icon } from '@/lib/icons';
import type { StoryGraph } from '../schema/interactiveNode';

interface Props {
  story?: StoryGraph;
  onAddStep: () => void;
  onUpdateStepText: (id: string, text: string) => void;
  onRemoveStep: (id: string) => void;
  onMoveStep: (id: string, dir: -1 | 1) => void;
  onClose: () => void;
}

const navBtn = 'rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-30';

export function StoryPanel({ story, onAddStep, onUpdateStepText, onRemoveStep, onMoveStep, onClose }: Props) {
  const steps = story?.steps ?? [];
  return (
    <aside className="flex w-72 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-surface p-3 shadow-md">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-fg"><Icon name="book" size={16} /> 이야기</span>
        <button onClick={onClose} className="rounded-pill px-2 py-1 text-[11px] font-semibold text-fg-muted hover:bg-surface-3 hover:text-fg">
          닫기
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-fg-2">단계마다 한 줄씩 적어요. 재생하면 자막과 소리로 읽어주고 ‘다음’으로 넘겨요.</p>

      {steps.length === 0 && <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-[12px] text-fg-muted">아직 이야기가 없어요. 단계를 더해 보세요.</p>}

      {steps.map((s, i) => (
        <div key={s.id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-2 p-2">
          <div className="flex items-center justify-between">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{i + 1}</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => onMoveStep(s.id, -1)} disabled={i === 0} className={`${navBtn} inline-flex items-center`} title="위로" aria-label="위로">
                <Icon name="chevronUp" size={14} />
              </button>
              <button onClick={() => onMoveStep(s.id, 1)} disabled={i === steps.length - 1} className={`${navBtn} inline-flex items-center`} title="아래로" aria-label="아래로">
                <Icon name="chevronDown" size={14} />
              </button>
              <button onClick={() => onRemoveStep(s.id)} className="inline-flex items-center rounded-md px-1.5 py-0.5 text-fg-muted hover:bg-danger-soft hover:text-danger" title="삭제" aria-label="삭제">
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
          <textarea
            value={s.speak?.text ?? ''}
            onChange={(e) => onUpdateStepText(s.id, e.target.value)}
            placeholder="이 장면에서 들려줄 말"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </div>
      ))}

      <button
        onClick={onAddStep}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface-2 px-2 py-2 text-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="plus" size={16} /> 단계 추가
      </button>
    </aside>
  );
}
