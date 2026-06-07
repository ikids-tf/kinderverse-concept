import { useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  runContractRegression,
  runRoutingEval,
  type ContractResult,
  type RoutingResult,
  type RoutingRow,
} from '@/eval/run';
import { GOVERNANCE_POLICIES, type PolicyStatus } from '@/lib/governance';

/* 평가 하네스 + 거버넌스 (PRD §9·§12·§14). QA/베타 준비 페이지(/eval).
   - 출력 계약 회귀: 결정적(모델 불요).
   - 라우팅 정확도: 라이브 라우터, KPI ≥90%.
   - 거버넌스 체크리스트: 시행 정책 현황. */

const KPI_ROUTING = 0.9;

const STATUS_STYLE: Record<PolicyStatus, string> = {
  enforced: 'bg-success-soft text-success',
  partial: 'bg-accent-soft text-accent',
  planned: 'bg-surface-3 text-fg-2',
};
const STATUS_LABEL: Record<PolicyStatus, string> = { enforced: '시행', partial: '부분', planned: '예정' };

export function EvalPage() {
  const [contract, setContract] = useState<ContractResult | null>(null);
  const [routing, setRouting] = useState<RoutingResult | null>(null);
  const [routingRows, setRoutingRows] = useState<RoutingRow[]>([]);
  const [running, setRunning] = useState(false);

  function runContract() {
    setContract(runContractRegression());
  }

  async function runRouting() {
    setRunning(true);
    setRoutingRows([]);
    setRouting(null);
    const res = await runRoutingEval((row) => setRoutingRows((prev) => [...prev, row]));
    setRouting(res);
    setRunning(false);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-t6 pt-t7 pb-40">
      <header className="mb-t6">
        <div className="text-overline mb-t2 text-fg-muted">QA · 베타 준비</div>
        <h1 className="font-display text-display font-semibold tracking-[-0.01em] text-fg">평가 하네스</h1>
      </header>

      {/* 출력 계약 회귀 */}
      <section className="mb-t8">
        <div className="mb-t3 flex items-center justify-between">
          <h2 className="font-display text-h3 font-semibold text-fg">출력 계약 회귀검사</h2>
          <button onClick={runContract} className="rounded-pill bg-fg px-t4 py-t2 text-sm font-semibold text-on-dark hover:bg-fg-1">
            실행
          </button>
        </div>
        {contract && (
          <div className="rounded-xl border border-border bg-surface p-t4 shadow-sm">
            <div className="mb-t3 text-body">
              <b className={contract.passed === contract.total ? 'text-success' : 'text-danger'}>
                {contract.passed}/{contract.total} 통과
              </b>{' '}
              <span className="text-fg-muted">(무근거 관찰 거부 등 안티-환각 회귀 포함)</span>
            </div>
            <ul className="flex flex-col gap-t1">
              {contract.rows.map((r, i) => (
                <li key={i} className="flex items-center gap-t2 text-sm">
                  <Icon name={r.pass ? 'check' : 'x'} size={14} color={r.pass ? 'var(--success)' : 'var(--danger)'} />
                  <span className="text-fg-1">{r.name}</span>
                  <span className="ml-auto text-overline text-fg-muted">
                    기대 {r.expectValid ? '통과' : '거부'} · 결과 {r.gotValid ? '통과' : '거부'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 라우팅 정확도 */}
      <section className="mb-t8">
        <div className="mb-t3 flex items-center justify-between">
          <h2 className="font-display text-h3 font-semibold text-fg">라우팅 정확도 (KPI ≥90%)</h2>
          <button
            onClick={runRouting}
            disabled={running}
            className="rounded-pill bg-fg px-t4 py-t2 text-sm font-semibold text-on-dark hover:bg-fg-1 disabled:opacity-60"
          >
            {running ? '실행 중…' : '실행 (라이브)'}
          </button>
        </div>
        <div className="rounded-xl border border-border bg-surface p-t4 shadow-sm">
          {routing && (
            <div className="mb-t3 text-body">
              <b className={routing.accuracy >= KPI_ROUTING ? 'text-success' : 'text-danger'}>
                {Math.round(routing.accuracy * 100)}% ({routing.correct}/{routing.total})
              </b>{' '}
              <span className="text-fg-muted">— KPI {routing.accuracy >= KPI_ROUTING ? '충족' : '미달'}</span>
            </div>
          )}
          {routingRows.length === 0 && !routing && (
            <p className="text-sm text-fg-muted">골든셋 {10}건을 라이브 라우터로 평가합니다.</p>
          )}
          <ul className="flex flex-col gap-t1">
            {routingRows.map((r, i) => (
              <li key={i} className="flex items-center gap-t2 text-sm">
                <Icon name={r.pass ? 'check' : 'x'} size={14} color={r.pass ? 'var(--success)' : 'var(--danger)'} />
                <span className="truncate text-fg-1">{r.text}</span>
                <span className="ml-auto shrink-0 text-overline text-fg-muted">
                  {r.expect} {r.pass ? '=' : '≠'} {r.got ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 거버넌스 체크리스트 */}
      <section>
        <h2 className="mb-t3 font-display text-h3 font-semibold text-fg">데이터 거버넌스</h2>
        <div className="flex flex-col gap-t2">
          {GOVERNANCE_POLICIES.map((p) => (
            <div key={p.id} className="rounded-md border border-border bg-surface px-t4 py-t3">
              <div className="flex items-center gap-t2">
                <span className="text-sm font-semibold text-fg">{p.label}</span>
                <span className={`rounded-pill px-t2 py-0.5 text-overline ${STATUS_STYLE[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <p className="mt-t1 text-sm text-fg-2">{p.rule}</p>
              <p className="text-overline text-fg-muted">시행: {p.enforcedAt}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
