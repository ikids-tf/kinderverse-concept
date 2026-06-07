import { runRouter } from '@/ai/agents/router';
import { validateRegistryPayload } from '@/ui-registry/contracts';
import { ROUTING_GOLDEN, CONTRACT_GOLDEN } from './golden';

/* Eval harness runners (PRD §9). Contract regression is deterministic (no model);
   routing accuracy runs the live router and measures against the KPI (≥90%). */

export interface ContractRow {
  name: string;
  expectValid: boolean;
  gotValid: boolean;
  pass: boolean;
  errors?: string[];
}
export interface ContractResult {
  total: number;
  passed: number;
  rows: ContractRow[];
}

export function runContractRegression(): ContractResult {
  const rows: ContractRow[] = CONTRACT_GOLDEN.map((c) => {
    const res = validateRegistryPayload(c.payload);
    const gotValid = res.ok;
    return {
      name: c.name,
      expectValid: c.expectValid,
      gotValid,
      pass: gotValid === c.expectValid,
      errors: res.ok ? undefined : res.errors,
    };
  });
  return { total: rows.length, passed: rows.filter((r) => r.pass).length, rows };
}

export interface RoutingRow {
  text: string;
  expect: string;
  got: string | null;
  pass: boolean;
}
export interface RoutingResult {
  total: number;
  correct: number;
  accuracy: number;
  rows: RoutingRow[];
}

export async function runRoutingEval(
  onRow?: (row: RoutingRow, i: number) => void,
): Promise<RoutingResult> {
  const rows: RoutingRow[] = [];
  for (let i = 0; i < ROUTING_GOLDEN.length; i++) {
    const c = ROUTING_GOLDEN[i];
    let got: string | null = null;
    try {
      const res = await runRouter({
        text: c.text,
        page: '/chat',
        selection: { ids: [], types: [], count: 0 },
        available_actions: ['start_task', 'chat'],
      });
      got = res.output.route_to;
    } catch {
      got = null;
    }
    const row: RoutingRow = { text: c.text, expect: c.expect, got, pass: got === c.expect };
    rows.push(row);
    onRow?.(row, i);
  }
  const correct = rows.filter((r) => r.pass).length;
  return { total: rows.length, correct, accuracy: rows.length ? correct / rows.length : 0, rows };
}
