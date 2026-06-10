import { Icon } from '@/lib/icons';
import type { WorksheetCardProps } from './contracts';
import type { ComponentState } from './state';
import { CardFrame } from './parts';
import { WorksheetSheet, downloadWorksheetA4, printWorksheetA4 } from './worksheet-sheet';

/* 활동지/워크시트 (agent.studio) — 인쇄용 A4 한 장. 제목·안내는 또렷한 텍스트
   레이어, 그림은 생성 이미지. 다운로드/인쇄는 정확한 A4(210:297) PNG로 합성. */

export function WorksheetCard({
  props,
  state = 'ready',
}: {
  props: WorksheetCardProps;
  state?: ComponentState;
}) {
  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;

  return (
    <CardFrame
      state={state}
      eyebrow="활동지 · 인쇄용 A4"
      title={props.title}
      actions={
        props.image_url ? (
          <div className="flex items-center gap-t2">
            <button
              onClick={() => void downloadWorksheetA4(props)}
              className="inline-flex items-center gap-t1 rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
            >
              <Icon name="download" size={14} /> 다운로드
            </button>
            <button
              onClick={() => void printWorksheetA4(props)}
              className="inline-flex items-center gap-t1 rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
            >
              <Icon name="print" size={14} /> 인쇄
            </button>
          </div>
        ) : undefined
      }
    >
      {/* 인쇄용 활동지 A4 한 장 — 제목·안내 텍스트 레이어 + 활동 그림. */}
      <div className="mx-auto" style={{ maxWidth: 380 }}>
        <WorksheetSheet props={props} className="rounded-md border border-border" />
      </div>
    </CardFrame>
  );
}
