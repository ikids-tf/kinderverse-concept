import type { GatewayRequest, GatewayResponse } from './gateway/types';

/* Thin client caller. The actual provider calls (with secrets) happen server-side
   at POST /api/ai/run — in dev that's the Vite middleware (vite-plugins/devGateway),
   in prod a serverless/Supabase function with the same contract. Keys never touch
   the browser. */

export const GATEWAY_ENDPOINT = '/api/ai/run';

export async function callGateway(req: GatewayRequest): Promise<GatewayResponse> {
  try {
    const res = await fetch(GATEWAY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      return { ok: false, error: `gateway HTTP ${res.status}` };
    }
    return (await res.json()) as GatewayResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
