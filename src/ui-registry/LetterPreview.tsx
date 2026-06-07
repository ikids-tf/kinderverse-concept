import { useState } from 'react';
import { Icon } from '@/lib/icons';
import type { LetterPreviewProps, Tone } from './contracts';
import type { ComponentState } from './state';
import { CardFrame } from './parts';
import { useLearningStore } from '@/store/learningStore';

/* 통신문/공지/문장 (agent.writing). 톤 토글 + 자율성 게이트:
   생성=L1 초안 / 발송=L2 확인 / 외부 채널 발송=L3(휴먼게이트). */

const KIND_LABEL: Record<LetterPreviewProps['kind'], string> = {
  letter: '가정통신문',
  notice: '공지',
  text: '문장',
};
const TONE_LABEL: Record<Tone, string> = { warm: '따뜻하게', formal: '정중하게', concise: '간결하게' };

export function LetterPreview({
  props,
  state = 'ready',
}: {
  props: LetterPreviewProps;
  state?: ComponentState;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(props.body);
  const [tone, setTone] = useState<Tone>(props.tone);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const recordEdit = useLearningStore((s) => s.recordEdit);
  const recordAccept = useLearningStore((s) => s.recordAccept);

  // 편집 완료 시 diff를 학습 신호로 (최고 레버리지, §8.1).
  function toggleEdit() {
    if (editing) recordEdit({ task: 'writing', artifactType: 'LetterPreview', before: props.body, after: body, tone });
    setEditing((v) => !v);
  }

  if (state === 'loading' || state === 'error') return <CardFrame state={state} />;

  return (
    <CardFrame
      state={editing ? 'editing' : state}
      eyebrow={`${KIND_LABEL[props.kind]} · 초안(L1)`}
      title={props.title}
      actions={
        <button
          onClick={toggleEdit}
          className="rounded-pill border border-border px-t3 py-1 text-sm text-fg-2 hover:bg-surface-2"
        >
          {editing ? '완료' : '편집'}
        </button>
      }
    >
      {/* 톤 토글 */}
      <div className="mb-t4 flex flex-wrap items-center gap-t2">
        {props.audience && (
          <span className="rounded-pill bg-surface-2 px-t3 py-1 text-overline text-fg-2">
            받는 사람: {props.audience}
          </span>
        )}
        <span className="text-overline text-fg-muted">톤</span>
        {(['warm', 'formal', 'concise'] as Tone[]).map((t) => (
          <button
            key={t}
            onClick={() => setTone(t)}
            className={`rounded-pill px-t3 py-1 text-overline transition-colors duration-150 ${
              tone === t ? 'bg-fg text-on-dark' : 'border border-border text-fg-2 hover:bg-surface-2'
            }`}
          >
            {TONE_LABEL[t]}
          </button>
        ))}
      </div>

      {editing ? (
        <textarea
          data-kv-editable="true"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[160px] w-full resize-y rounded-md border border-field-border bg-surface px-t4 py-t3 text-body leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-focus"
        />
      ) : (
        <div className="rounded-md border border-border bg-white p-t5">
          <p className="whitespace-pre-wrap text-body leading-relaxed text-fg-1">{body}</p>
        </div>
      )}

      {/* 자율성 게이트: 발송 = L2 확인 / 외부 채널 = L3 */}
      <div className="mt-t4 flex flex-wrap items-center justify-between gap-t2">
        <span className="text-overline text-fg-muted">외부 채널(문자·이메일) 발송은 휴먼게이트(L3)</span>
        {sent ? (
          <span className="inline-flex items-center gap-t1 text-overline text-success">
            <Icon name="check" size={14} /> 발송 준비됨 (L2 확인 완료)
          </span>
        ) : confirming ? (
          <span className="flex items-center gap-t2 text-sm">
            <span className="text-fg-2">이대로 발송할까요?</span>
            <button onClick={() => { setConfirming(false); setSent(true); recordAccept({ task: 'writing', artifactType: 'LetterPreview', content: body, tone }); }} className="rounded-pill bg-fg px-t3 py-1 text-overline text-on-dark">확인</button>
            <button onClick={() => setConfirming(false)} className="rounded-pill border border-border px-t3 py-1 text-overline text-fg-2">취소</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-t1 rounded-pill bg-accent px-t4 py-t2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            <Icon name="send" size={14} /> 발송 (L2 확인)
          </button>
        )}
      </div>
    </CardFrame>
  );
}
