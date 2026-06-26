/* Vercel 서버리스 — POST /api/ai/run. 프로바이더 키는 서버(process.env)에만, 브라우저엔 안 감.
   dev의 vite-plugins/devGateway와 동일 계약(handleGatewayRequest). */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGatewayRequest } from '../../server/gateway/handler.js';
import { gatewayConfigFromEnv } from '../../server/gateway/env.js';

export const maxDuration = 60; // 이미지 생성 등 — Hobby 상한 60s

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    const result = await handleGatewayRequest(req.body, gatewayConfigFromEnv());
    res.status(200).json(result);
  } catch (e) {
    res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
