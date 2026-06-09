import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { openDocOnBoard } from '@/board/composer';
import { pathForRoute, ROUTE_LABEL } from '@/ai/actions';
import { SUGGESTION_HIDE_BELOW, CONFIDENCE_THRESHOLD, type RouterOutput } from '@/ai/contract';
import { useRouterStore, INLINE_ROUTES, type RouterTurn, type ChatAnswer } from '@/store/routerStore';
import { useUIStore } from '@/store/uiStore';
import { RegistryRenderer } from '@/ui-registry/registry';
import { MarkdownMessage } from './MarkdownMessage';

/* Renders one chat turn on the AI 채팅 page (reference KinderVerse parity):
   the teacher's message (right bubble) + the assistant's streamed editorial
   markdown answer (left, coral sparkle avatar). The Tier0 router runs in
   parallel and is surfaced UNDER the answer as a contextual action (route card /
   clarify chips) so the structured agent + AUI path stays intact. */

/** What contextual action the router decision warrants below the prose answer. */
function actionMode(o: RouterOutput): 'decision' | 'clarify' | 'none' {
  if (o.route_to && INLINE_ROUTES.includes(o.route_to) && o.confidence >= CONFIDENCE_THRESHOLD) return 'decision';
  if (o.clarify?.options && o.clarify.options.length > 0) return 'clarify';
  return 'none';
}

function TypingDots({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 py-t1 ${className}`} aria-label="작성 중">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="kv-typing-dot h-1.5 w-1.5 rounded-pill bg-fg-muted"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="mt-t2 inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-t3 py-t1 text-overline text-fg-2 transition-colors duration-150 ease-soft hover:bg-surface-2 hover:text-fg"
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      {copied ? '복사됨' : '복사'}
    </button>
  );
}

/** A streamed answer is "board-worthy" (a plan / mind map / structured document)
    when it carries markdown headings or runs long — worth opening on My Board. */
function looksLikeDoc(s: string): boolean {
  return /(^|\n)#{1,3}\s/.test(s) || s.length > 320;
}

/** "마이보드에서 보기" — opens a fresh board with this document laid out in full on
    the left + a mind map reflecting its structure on the right, then navigates. */
function ViewOnBoardButton({ content }: { content: string }) {
  const navigate = useNavigate();
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || '문서';
  return (
    <button
      type="button"
      onClick={() => {
        void openDocOnBoard({ title, markdown: content });
        navigate('/board');
      }}
      className="mt-t2 inline-flex items-center gap-1.5 rounded-pill border border-accent bg-accent-soft px-t3 py-t1 text-overline font-semibold text-accent transition-colors duration-150 ease-soft hover:bg-accent hover:text-on-accent"
    >
      <Icon name="board" size={13} /> 마이보드에서 보기
    </button>
  );
}

function ChatAnswerView({ chat }: { chat: ChatAnswer }) {
  if (!chat.content && chat.streaming) return <TypingDots />;
  const done = !chat.streaming && !chat.error;
  return (
    <div className={chat.error ? 'text-danger' : undefined}>
      {chat.content && <MarkdownMessage content={chat.content} />}
      {chat.streaming && <TypingDots className={chat.content ? 'mt-t2' : ''} />}
      {done && chat.content && (
        <div className="flex flex-wrap items-center gap-t2">
          <CopyButton text={chat.content} />
          {looksLikeDoc(chat.content) && <ViewOnBoardButton content={chat.content} />}
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-t2" title={`확신도 ${pct}%`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-pill bg-surface-3">
        <span className="block h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-overline text-fg-muted">{pct}%</span>
    </span>
  );
}

function SuggestedNext({ output }: { output: RouterOutput }) {
  const visible = output.suggested_next.filter((s) => s.confidence >= SUGGESTION_HIDE_BELOW);
  if (visible.length === 0) return null;
  return (
    <div className="mt-t3 flex flex-wrap items-center gap-t2">
      <span className="text-overline text-fg-muted">추천</span>
      {visible.map((s) => (
        <button
          key={s.action}
          title={s.reason}
          className="rounded-pill border border-dashed border-border bg-surface px-t3 py-t1 text-sm text-fg-2 transition-colors duration-150 ease-soft hover:text-fg hover:border-accent"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ClarifyChips({ output, contextText }: { output: RouterOutput; contextText: string }) {
  const location = useLocation();
  const send = useRouterStore((s) => s.send);
  const availableActions = useUIStore((s) => s.availableActions);
  const options = output.clarify?.options ?? [];
  const compose = (opt: string) => (contextText ? `${contextText} (${opt})` : opt);

  return (
    <div className="rounded-xl border border-border bg-surface p-t3 shadow-sm">
      <div className="mb-t2 flex items-center gap-t2 text-overline text-fg-muted">
        <Icon name="message" size={13} /> 더 정확히 도우려면
      </div>
      <div className="flex flex-wrap gap-t2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() =>
              void send({
                text: compose(opt),
                page: location.pathname,
                selection: { ids: [], types: [], count: 0 },
                available_actions: availableActions,
              })
            }
            className="rounded-pill border border-border-strong bg-surface px-t4 py-t2 text-sm font-medium text-fg transition-colors duration-150 ease-soft hover:bg-surface-2"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function DecisionCard({ turn }: { turn: RouterTurn }) {
  const navigate = useNavigate();
  const runResult = useRouterStore((s) => s.runResult);
  const output = turn.output!;
  const route = output.route_to!;
  const isInline = INLINE_ROUTES.includes(route);
  const running = turn.resultStatus === 'running';
  const hasResult = turn.resultStatus === 'done' && !!turn.result;

  return (
    <div className="rounded-xl border border-border bg-surface p-t4 shadow-sm">
      <div className="mb-t3 flex flex-wrap items-center gap-t2">
        <span className="rounded-pill bg-accent-soft px-t3 py-t1 text-overline text-accent">
          {ROUTE_LABEL[route]} 에이전트
        </span>
        <span className="rounded-pill bg-surface-2 px-t3 py-t1 text-overline text-fg-2">{output.intent}</span>
        {output.mode && (
          <span className="rounded-pill bg-surface-2 px-t3 py-t1 text-overline text-fg-2">
            {output.mode === 'observation' ? '관찰기록' : '놀이기록'}
          </span>
        )}
        <ConfidenceBar value={output.confidence} />
      </div>

      {!hasResult && (
        <button
          disabled={running}
          onClick={() => (isInline ? void runResult(turn.id) : navigate(pathForRoute(route, output.mode)))}
          className="inline-flex items-center gap-t2 rounded-pill bg-fg px-t4 py-t2 font-sans text-sm font-semibold text-on-dark transition-colors duration-150 ease-soft hover:bg-fg-1 disabled:opacity-60"
        >
          {running ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-on-dark/40 border-t-on-dark" />
              생성 중…
            </>
          ) : (
            <>
              {isInline ? `${ROUTE_LABEL[route]} 생성` : `${ROUTE_LABEL[route]}(으)로 진행`}
              <Icon name="arrowRight" size={16} />
            </>
          )}
        </button>
      )}

      <SuggestedNext output={output} />
    </div>
  );
}

export function RouterTurnView({ turn }: { turn: RouterTurn }) {
  const location = useLocation();
  const send = useRouterStore((s) => s.send);
  const availableActions = useUIStore((s) => s.availableActions);

  const onResultClarify = (opt: string) =>
    void send({
      text: `${turn.text} (${opt})`,
      page: location.pathname,
      selection: { ids: [], types: [], count: 0 },
      available_actions: availableActions,
    });

  const mode = turn.status === 'done' && turn.output ? actionMode(turn.output) : 'none';

  return (
    <div className="flex flex-col gap-t3">
      {/* Teacher message (right bubble) */}
      <div className="max-w-[80%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-t4 py-t3 text-body text-fg">
        {turn.text}
      </div>

      {/* Assistant: coral sparkle avatar + streamed editorial answer */}
      <div className="flex w-full max-w-[92%] gap-t3 self-start">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent shadow-sm">
          <Icon name="sparkle" size={16} fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          {turn.chat && <ChatAnswerView chat={turn.chat} />}

          {/* Contextual action from the Tier0 router (runs in parallel) */}
          {mode === 'decision' && (
            <div className="mt-t3">
              <DecisionCard turn={turn} />
            </div>
          )}
          {mode === 'clarify' && turn.output && (
            <div className="mt-t3">
              <ClarifyChips output={turn.output} contextText={turn.text} />
            </div>
          )}

          {/* Tier1 agent result via the AUI registry (after the action is run) */}
          {turn.result && (
            <div className="mt-t3">
              <RegistryRenderer
                payload={turn.result}
                state={turn.resultStatus === 'running' ? 'streaming' : 'ready'}
                onClarifyOption={onResultClarify}
              />
              {(turn.resultMocked || turn.resultWarning) && (
                <div className="mt-t2 flex flex-wrap items-center gap-t2 text-overline text-fg-muted">
                  {turn.resultMocked && <span className="rounded-pill bg-surface-2 px-t2 py-0.5">MOCK (키 미설정)</span>}
                  {turn.resultWarning && <span className="text-danger">{turn.resultWarning}</span>}
                </div>
              )}
            </div>
          )}
          {turn.resultStatus === 'error' && !turn.result && (
            <div className="mt-t3 rounded-xl border border-border bg-danger-soft px-t4 py-t3 text-sm text-danger">
              생성 오류: {turn.resultWarning ?? '알 수 없는 오류'}
            </div>
          )}

          {/* Meta: provider/model + mock badge */}
          {(turn.mocked || turn.provider || turn.warning) && (
            <div className="mt-t2 flex flex-wrap items-center gap-t2 text-overline text-fg-muted">
              {turn.mocked && <span className="rounded-pill bg-surface-2 px-t2 py-0.5">MOCK (키 미설정)</span>}
              {turn.provider && <span>{turn.provider}{turn.model ? ` · ${turn.model}` : ''}</span>}
              {turn.warning && <span className="text-danger">{turn.warning}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
