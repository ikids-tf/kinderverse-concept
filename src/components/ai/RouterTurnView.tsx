import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@/lib/icons';
import { pathForRoute, ROUTE_LABEL } from '@/ai/actions';
import { SUGGESTION_HIDE_BELOW, type RouterOutput } from '@/ai/contract';
import { useRouterStore, INLINE_ROUTES, type RouterTurn } from '@/store/routerStore';
import { useUIStore } from '@/store/uiStore';
import { RegistryRenderer } from '@/ui-registry/registry';

/* Renders one router turn on the AI chat page: the teacher's message + the
   router's decision (route card / clarify prompt) + suggested_next chips.
   Surfaces the M2 loop end-to-end. */

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

function ClarifyView({ output, contextText }: { output: RouterOutput; contextText: string }) {
  const location = useLocation();
  const send = useRouterStore((s) => s.send);
  const availableActions = useUIStore((s) => s.availableActions);

  const question = output.clarify?.question ?? '조금 더 구체적으로 알려주세요.';
  const options = output.clarify?.options ?? [];

  // Carry the original request forward so the answer keeps full context.
  const compose = (opt: string) => (contextText ? `${contextText} (${opt})` : opt);

  return (
    <div className="rounded-xl border border-border bg-surface p-t4 shadow-sm">
      <div className="mb-t2 flex items-center gap-t2">
        <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-accent-soft text-accent">
          <Icon name="message" size={14} />
        </span>
        <span className="text-overline text-fg-muted">명확화 필요 · 확신도 낮음</span>
      </div>
      <p className="text-body text-fg">{question}</p>
      {options.length > 0 && (
        <div className="mt-t3 flex flex-wrap gap-t2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                void send({
                  text: compose(opt),
                  page: location.pathname,
                  selection: { ids: [], types: [], count: 0 },
                  available_actions: availableActions,
                });
              }}
              className="rounded-pill border border-border-strong bg-surface px-t4 py-t2 text-sm font-medium text-fg transition-colors duration-150 ease-soft hover:bg-surface-2"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionView({ turn }: { turn: RouterTurn }) {
  const navigate = useNavigate();
  const runResult = useRouterStore((s) => s.runResult);
  const output = turn.output!;
  const route = output.route_to!; // non-null here (clarify handled separately)

  // record/plan/studio run inline (M3/M6); other agents land on My Board.
  const isInline = INLINE_ROUTES.includes(route);
  const running = turn.resultStatus === 'running';
  const hasResult = turn.resultStatus === 'done' && !!turn.result;

  return (
    <div className="rounded-xl border border-border bg-surface p-t4 shadow-sm">
      <div className="mb-t3 flex flex-wrap items-center gap-t2">
        <span className="rounded-pill bg-accent-soft px-t3 py-t1 text-overline text-accent">
          {ROUTE_LABEL[route]} 에이전트
        </span>
        <span className="rounded-pill bg-surface-2 px-t3 py-t1 text-overline text-fg-2">
          {output.intent}
        </span>
        {output.mode && (
          <span className="rounded-pill bg-surface-2 px-t3 py-t1 text-overline text-fg-2">
            {output.mode === 'observation' ? '관찰기록' : '놀이기록'}
          </span>
        )}
        <span className="rounded-pill bg-surface-2 px-t3 py-t1 text-overline text-fg-2">
          범위: {output.scope}
        </span>
        <ConfidenceBar value={output.confidence} />
      </div>

      {!hasResult && (
        <button
          disabled={running}
          onClick={() =>
            isInline ? void runResult(turn.id) : navigate(pathForRoute(route, output.mode))
          }
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

  // Re-route a record-result clarify answer through the router with full context.
  const onResultClarify = (opt: string) =>
    void send({
      text: `${turn.text} (${opt})`,
      page: location.pathname,
      selection: { ids: [], types: [], count: 0 },
      available_actions: availableActions,
    });

  return (
    <div className="flex flex-col gap-t3">
      {/* Teacher message */}
      <div className="self-end max-w-[80%] rounded-2xl rounded-br-md bg-accent-soft px-t4 py-t3 text-body text-fg">
        {turn.text}
      </div>

      {/* Router response */}
      <div className="max-w-[85%] self-start">
        {turn.status === 'routing' && (
          <div className="flex items-center gap-t2 rounded-xl border border-border bg-surface px-t4 py-t3 text-sm text-fg-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            라우팅 중…
          </div>
        )}

        {turn.status === 'done' && turn.output && (
          <>
            {turn.output.needs_confirmation || !turn.output.route_to ? (
              <ClarifyView output={turn.output} contextText={turn.text} />
            ) : (
              <DecisionView turn={turn} />
            )}

            {/* Tier1 agent result rendered via the AUI registry. */}
            {turn.result && (
              <div className="mt-t3">
                <RegistryRenderer
                  payload={turn.result}
                  state={turn.resultStatus === 'running' ? 'streaming' : 'ready'}
                  onClarifyOption={onResultClarify}
                />
                {(turn.resultMocked || turn.resultWarning) && (
                  <div className="mt-t2 flex flex-wrap items-center gap-t2 text-overline text-fg-muted">
                    {turn.resultMocked && (
                      <span className="rounded-pill bg-surface-2 px-t2 py-0.5">MOCK (키 미설정)</span>
                    )}
                    {turn.resultWarning && <span className="text-danger">{turn.resultWarning}</span>}
                  </div>
                )}
              </div>
            )}
            {turn.resultStatus === 'error' && !turn.result && (
              <div className="mt-t3 rounded-xl border border-border bg-danger-soft px-t4 py-t3 text-sm text-danger">
                기록 생성 오류: {turn.resultWarning ?? '알 수 없는 오류'}
              </div>
            )}
            {(turn.mocked || turn.warning) && (
              <div className="mt-t2 flex flex-wrap items-center gap-t2 text-overline text-fg-muted">
                {turn.mocked && (
                  <span className="rounded-pill bg-surface-2 px-t2 py-0.5">MOCK (키 미설정)</span>
                )}
                {turn.provider && <span>{turn.provider}{turn.model ? ` · ${turn.model}` : ''}</span>}
                {turn.warning && <span className="text-danger">{turn.warning}</span>}
              </div>
            )}
          </>
        )}

        {turn.status === 'error' && (
          <div className="rounded-xl border border-border bg-danger-soft px-t4 py-t3 text-sm text-danger">
            오류: {turn.warning ?? '알 수 없는 오류'}
          </div>
        )}
      </div>
    </div>
  );
}
