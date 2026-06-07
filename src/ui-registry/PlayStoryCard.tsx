import { useState } from 'react';
import { Icon } from '@/lib/icons';
import type { PlayStoryCardProps } from './contracts';
import type { ComponentState } from './state';
import { AgeBadge, CardFrame, DomainChips } from './parts';

/* 놀이기록 = 놀이이야기 카드 (record.story). 사진 슬롯 + 활동 서술 + 학부모 발송용.
   발송은 자율성 게이트: 생성=L1 초안 / 발송=L2 확인 / 외부 채널=L3(휴먼게이트). */

export function PlayStoryCard({
  props,
  state = 'ready',
}: {
  props: PlayStoryCardProps;
  state?: ComponentState;
}) {
  const [editing, setEditing] = useState(false);
  const [narrative, setNarrative] = useState(props.narrative);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);

  if (state === 'loading' || state === 'error') {
    return <CardFrame state={state} />;
  }

  const effective = editing ? 'editing' : state;

  return (
    <CardFrame
      state={effective}
      eyebrow="놀이이야기 · 학부모 발송용"
      title={props.title}
      actions={
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2"
        >
          {editing ? '완료' : '편집'}
        </button>
      }
    >
      <div className="mb-t4">
        <AgeBadge age_band={props.age_band} curriculum={props.curriculum} />
      </div>

      {/* 사진 슬롯 (실제 아동 사진은 M4 갤러리 연동) */}
      {props.photo_slots.length > 0 && (
        <div className="mb-t4 grid grid-cols-2 gap-t3 sm:grid-cols-3">
          {props.photo_slots.map((slot, i) => (
            <figure key={i} className="overflow-hidden rounded-md border border-border">
              <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 text-fg-muted">
                <Icon name="gallery" size={22} />
              </div>
              <figcaption className="px-t2 py-t1 text-overline text-fg-muted">
                {slot.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* 활동 서술 */}
      {editing ? (
        <textarea
          data-kv-editable="true"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          className="min-h-[120px] w-full resize-y rounded-md border border-field-border bg-surface px-t3 py-t2 text-body text-fg focus:outline-none focus:ring-2 focus:ring-focus"
        />
      ) : (
        <p className="whitespace-pre-wrap text-body leading-relaxed text-fg-1">{narrative}</p>
      )}

      {props.family_note && (
        <div className="mt-t4 rounded-md bg-accent-soft px-t3 py-t2">
          <div className="text-overline mb-t1 text-accent">학부모께</div>
          <p className="text-sm text-fg-1">{props.family_note}</p>
        </div>
      )}

      <div className="mt-t4 flex flex-wrap items-center justify-between gap-t2">
        <DomainChips domains={props.domains} />

        {/* 발송 = L2 확인 (외부 채널 발송은 L3 휴먼게이트) */}
        {sent ? (
          <span className="inline-flex items-center gap-t1 text-overline text-success">
            <Icon name="check" size={14} /> 발송 준비됨 (데모)
          </span>
        ) : confirming ? (
          <span className="flex items-center gap-t2 text-sm">
            <span className="text-fg-2">이대로 발송할까요?</span>
            <button
              onClick={() => {
                setConfirming(false);
                setSent(true);
              }}
              className="rounded-pill bg-fg px-t3 py-1 text-overline text-on-dark"
            >
              확인
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-pill border border-border px-t3 py-1 text-overline text-fg-2"
            >
              취소
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-t1 rounded-pill bg-accent px-t4 py-t2 text-sm font-semibold text-on-accent transition-colors duration-150 ease-soft hover:bg-accent-hover"
          >
            <Icon name="send" size={14} /> 학부모 발송
          </button>
        )}
      </div>
    </CardFrame>
  );
}
